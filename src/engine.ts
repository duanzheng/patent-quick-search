import { mergeHits, message, normalize, parseHits, SEARCH_RESULT_LIMIT, plan, resultScope, validateInput } from './domain';
import type { ApiError, Bridge, Run, Scope } from './types';
type Job = {query:string;index:number};
export class Engine {
  run:Run|null=null;
  private queue:Job[]=[];
  private active=0;
  private epoch=0;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private controller=new AbortController();
  private usable=false;
  private starting=false;
  private listeners=new Set<()=>void>();
  constructor(private bridge:Bridge) {}
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};};
  private emit(){this.listeners.forEach(fn=>fn());}
  private changed(){if(this.run){this.run.revision++;this.run={...this.run,hits:[...this.run.hits]};}this.emit();}
  private persist(){const id=this.run?.id;if(this.run) void this.bridge('save_run',{run:this.run}).catch(()=>{if(this.run?.id===id&&this.run&&!this.run.errors.includes('无法保存本地历史')){this.run.errors.push('无法保存本地历史');this.changed();}});}
  private metric(event:string,resultId?:string){if(this.run) void this.bridge('record_metric',{metric:{event,resultId,runId:this.run.id,attempts:this.run.attempts,logicalSearch:this.run.logicalSearch,status:this.run.status,elapsed:Date.now()-this.run.createdAt}}).catch(()=>{});}
  get running(){return this.usable&&(this.starting||this.active>0||this.queue.length>0);}
  async start(draft:string,scope:Scope) {
    const query=normalize(draft); const error=validateInput(query); if(error) throw new Error(error);
    if(this.running&&this.run?.query===query&&this.run.scope===scope) return;
    this.stop();
    const epoch=++this.epoch;this.controller=new AbortController();this.usable=true;this.starting=true;
    this.active=0;this.queue=[];
    const queries=plan(query,scope),now=Date.now();
    this.run={schemaVersion:1,id:crypto.randomUUID(),revision:1,query,scope,createdAt:now,deadlineAt:now+60000,status:'searching',hits:[],errors:[],searchDone:0,searchTotal:queries.length,logicalSearch:queries.length,attempts:0};
    this.changed();
    try {await this.bridge('begin_run',{id:this.run.id});}catch(e){if(epoch===this.epoch){this.usable=false;this.starting=false;this.run.status='failed';this.run.errors.push(message(e as ApiError));this.changed();}return;}
    if(epoch!==this.epoch) return;
    this.starting=false;this.metric('run_started');
    this.queue=queries.map((query,index)=>({query,index}));
    this.timer=setTimeout(()=>this.stop('expired'),Math.max(0,this.run.deadlineAt-Date.now()));
    this.pump(epoch);
  }
  stop(status:'stopped'|'expired'='stopped') {
    const old=this.run;const wasRunning=this.running;
    this.epoch++;this.usable=false;this.starting=false;this.queue=[];this.active=0;this.controller.abort();clearTimeout(this.timer);
    if(old&&old.status!=='stopped'&&old.status!=='expired') {
      if(wasRunning||status==='expired'){old.status=status;old.cancelledAt=Date.now();
      this.changed();this.persist();this.metric('run_cancelled');}
      void this.bridge('cancel_run',{id:old.id}).catch(()=>{});
    }
  }
  restore(run:Run){
    this.stop();this.run=searchHistoryRun(run);this.usable=false;
    if(this.run.status==='searching'){this.run.status='stopped';this.run.cancelledAt=Date.now();}

    this.changed();
  }
  clear(){this.stop();this.run=null;this.emit();}
  action(event:'source_opened'|'source_copied'|'query_edited',resultId?:string){this.metric(event,resultId);}
  private pump(epoch:number){
    if(epoch!==this.epoch||!this.usable||!this.run)return;
    if(Date.now()>=this.run.deadlineAt){this.stop('expired');return;}
    while(this.active<2&&this.queue.length){const job=this.queue.shift()!;this.active++;void this.execute(job,epoch);}
    if(!this.active&&!this.queue.length){
      this.run.status=this.run.errors.length?(this.run.hits.length?'partial':'failed'):(this.run.hits.length?'complete':'empty');
      this.changed();this.persist();this.metric('run_finished');
    }
  }
  private async request(job:Job,epoch:number):Promise<unknown>{
    for(let attempt=0;attempt<2;attempt++){
      if(epoch!==this.epoch||!this.usable||!this.run||Date.now()>=this.run.deadlineAt)throw {kind:'cancelled'};
      if(this.run.attempts>=4)throw {kind:'budget'};
      this.run.attempts++;this.changed();
      try{return await this.bridge('api_request',{id:this.run.id,operation:'search',logicalId:`search-${job.index}`,attemptIndex:attempt,payload:{query:job.query,ori_question:this.run.query,count:SEARCH_RESULT_LIMIT,need_content:false}});}
      catch(raw){
        const e=raw as ApiError;const retry=e.kind==='network'||e.status===408||e.status===429||(e.status??0)>=500;
        const wait=Math.max(1000,(e.retryAfter??0)*1000);
        if(!retry||attempt===1||!this.run||Date.now()+wait+15000>this.run.deadlineAt)throw e;
        await new Promise<void>((resolve,reject)=>{const signal=this.controller.signal;const abort=()=>{clearTimeout(t);reject({kind:'cancelled'});};const t=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},wait);if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
      }
    }
  }
  private async execute(job:Job,epoch:number){
    if(!this.run)return;
    try {
      const raw=await this.request(job,epoch);if(epoch!==this.epoch||!this.usable||!this.run)return;
      const batch=parseHits(raw,resultScope(this.run.query,this.run.scope),job.index);mergeHits(this.run.hits,batch.hits);
      if(batch.invalid)this.run.errors.push(`来源 ${job.index+1} 已跳过 ${batch.invalid} 条不合规结果`);
      this.metric('search_batch_received');
    }catch(raw){
      if(epoch!==this.epoch||!this.run)return;
      const e=(raw instanceof Error?{kind:raw.message}:raw) as ApiError;
      this.run.errors.push(message(e));
      if(e.status===401||e.status===402){this.run.errors.push(message(e));this.stop();return;}
    }finally{
      if(epoch===this.epoch&&this.run){this.run.searchDone++;this.active--;this.run.status='searching';this.changed();this.persist();this.pump(epoch);}
    }
  }
}
export function searchHistoryRun(run:Run):Run {
  const legacy=run as Run&{status:string;logicalFetch?:number};
  const errors=run.errors.filter(e=>!/正文|抓取|读取原文|Fetch/i.test(e));
  const hits=run.hits.map(h=>({id:h.id,originalUrl:h.originalUrl,canonicalKey:h.canonicalKey,title:h.title,domain:h.domain,publication:h.publication,snippet:h.snippet,summary:h.summary,retrievedAt:h.retrievedAt,matches:structuredClone(h.matches)}));
  const oldStatus=String(legacy.status);const status=oldStatus==='reading'&&run.searchDone<run.searchTotal?'stopped':oldStatus==='reading'||(oldStatus==='partial'&&!errors.length)?(errors.length?(hits.length?'partial':'failed'):(hits.length?'complete':'empty')):run.status;
  return {schemaVersion:1,id:run.id,revision:run.revision,query:run.query,scope:run.scope,createdAt:run.createdAt,deadlineAt:run.deadlineAt,status,cancelledAt:run.cancelledAt,hits,errors,searchDone:run.searchDone,searchTotal:run.searchTotal,logicalSearch:run.logicalSearch,attempts:run.attempts};
}
