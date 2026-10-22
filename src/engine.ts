import { mergeHits, message, normalize, pageContent, parseHits, plan, validateInput } from './domain';
import type { ApiError, Bridge, Hit, Run, Scope } from './types';
type Job = {kind:'search';query:string;index:number}|{kind:'fetch';id:string;url:string};
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
  private metric(event:string,resultId?:string){if(this.run) void this.bridge('record_metric',{metric:{event,resultId,runId:this.run.id,attempts:this.run.attempts,logicalSearch:this.run.logicalSearch,logicalFetch:this.run.logicalFetch,status:this.run.status,elapsed:Date.now()-this.run.createdAt}}).catch(()=>{});}
  get running(){return this.usable&&(this.starting||this.active>0||this.queue.length>0);}
  async start(draft:string,scope:Scope) {
    const query=normalize(draft); const error=validateInput(query); if(error) throw new Error(error);
    if(this.running&&this.run?.query===query&&this.run.scope===scope) return;
    this.stop();
    const epoch=++this.epoch;this.controller=new AbortController();this.usable=true;this.starting=true;
    this.active=0;this.queue=[];
    const queries=plan(query,scope),now=Date.now();
    this.run={schemaVersion:1,id:crypto.randomUUID(),revision:1,query,scope,createdAt:now,deadlineAt:now+60000,status:'searching',hits:[],errors:[],searchDone:0,searchTotal:queries.length,logicalSearch:queries.length,logicalFetch:0,attempts:0};
    this.changed();
    try {await this.bridge('begin_run',{id:this.run.id});}catch(e){if(epoch===this.epoch){this.usable=false;this.starting=false;this.run.status='failed';this.run.errors.push(message(e as ApiError));this.changed();}return;}
    if(epoch!==this.epoch) return;
    this.starting=false;this.metric('run_started');
    this.queue=queries.map((query,index)=>({kind:'search',query,index}));
    this.timer=setTimeout(()=>this.stop('expired'),Math.max(0,this.run.deadlineAt-Date.now()));
    this.pump(epoch);
  }
  stop(status:'stopped'|'expired'='stopped') {
    const old=this.run;const wasRunning=this.running;
    this.epoch++;this.usable=false;this.starting=false;this.queue=[];this.active=0;this.controller.abort();clearTimeout(this.timer);
    if(old&&old.status!=='stopped'&&old.status!=='expired') {
      if(wasRunning||status==='expired'){old.status=status;old.cancelledAt=Date.now();old.hits.forEach(h=>{if(['queued','loading'].includes(h.fetchStatus))h.fetchStatus='cancelled';});
      this.changed();this.persist();this.metric('run_cancelled');}
      void this.bridge('cancel_run',{id:old.id}).catch(()=>{});
    }
  }
  restore(run:Run){
    this.stop();this.run=structuredClone(run);this.usable=false;
    if(['searching','reading'].includes(this.run.status)){this.run.status='stopped';this.run.cancelledAt=Date.now();}
    this.run.hits.forEach(h=>{if(['queued','loading'].includes(h.fetchStatus))h.fetchStatus='cancelled';});
    this.changed();
  }
  clear(){this.stop();this.run=null;this.emit();}
  fetch(id:string) {
    if(!this.run) return;
    const h=this.run.hits.find(h=>h.id===id);if(!h||h.fetchStatus!=='not_requested')return;
    if(!this.usable||Date.now()>=this.run.deadlineAt){h.error='本轮已结束，请打开来源或重新搜索';this.changed();return;}
    if(this.run.logicalFetch>=5){h.error='本轮正文读取次数已用完，可打开来源查看';this.changed();return;}
    this.run.logicalFetch++;this.run.status=this.run.searchDone<this.run.searchTotal?'searching':'reading';h.fetchStatus='queued';this.queue.push({kind:'fetch',id,url:h.originalUrl});this.changed();this.pump(this.epoch);
  }
  action(event:'source_opened'|'source_copied'|'result_opened'|'query_edited',resultId?:string){this.metric(event,resultId);}
  private pump(epoch:number){
    if(epoch!==this.epoch||!this.usable||!this.run)return;
    if(Date.now()>=this.run.deadlineAt){this.stop('expired');return;}
    while(this.active<2&&this.queue.length){const job=this.queue.shift()!;this.active++;void this.execute(job,epoch);}
    if(!this.active&&!this.queue.length){
      this.run.status=this.run.errors.length||this.run.hits.some(h=>h.fetchStatus==='failed')?(this.run.hits.length?'partial':'failed'):(this.run.hits.length?'complete':'empty');
      this.changed();this.persist();this.metric('run_finished');
    }
  }
  private async request(job:Job,epoch:number):Promise<unknown>{
    for(let attempt=0;attempt<2;attempt++){
      if(epoch!==this.epoch||!this.usable||!this.run||Date.now()>=this.run.deadlineAt)throw {kind:'cancelled'};
      if(this.run.attempts>=14)throw {kind:'budget'};
      this.run.attempts++;this.changed();
      try{return await this.bridge('api_request',{id:this.run.id,operation:job.kind,logicalId:job.kind==='search'?`search-${job.index}`:job.id,attemptIndex:attempt,payload:job.kind==='search'?{query:job.query,ori_question:this.run.query,count:10,need_content:false}:{url:job.url}});}
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
    const hit=job.kind==='fetch'?this.run.hits.find(h=>h.id===job.id):undefined;
    if(hit){hit.fetchStatus='loading';this.metric('fetch_started',hit.id);this.changed();}
    try {
      const raw=await this.request(job,epoch);if(epoch!==this.epoch||!this.usable||!this.run)return;
      if(job.kind==='search'){
        const batch=parseHits(raw,this.run.scope,job.index);mergeHits(this.run.hits,batch.hits);
        if(batch.invalid)this.run.errors.push(`来源 ${job.index+1} 已跳过 ${batch.invalid} 条不合规结果`);
        this.metric('search_batch_received');
        this.run.hits.slice(0,3).forEach(h=>{if(h.fetchStatus==='not_requested')this.fetch(h.id);});
      }else if(hit){
        const p=pageContent(raw);hit.content=p.content;hit.preview=p.preview;hit.truncated=p.truncated;hit.fetchedAt=Date.now();hit.lastUsedAt=hit.fetchedAt;hit.contentHash=typeof (raw as Record<string,unknown>).content_hash==='string'?(raw as Record<string,string>).content_hash:undefined;hit.fetchStatus=p.content.trim()?'available':'empty';
        if(hit.fetchStatus==='empty')hit.error='此页未返回可读正文';
        this.metric('fetch_completed',hit.id);
      }
    }catch(raw){
      if(epoch!==this.epoch||!this.run)return;
      const e=(raw instanceof Error?{kind:raw.message}:raw) as ApiError;
      if(hit){hit.fetchStatus='failed';hit.error=message(e);}else this.run.errors.push(message(e));
      if(e.status===401||e.status===402){this.run.errors.push(message(e));this.stop();return;}
    }finally{
      if(epoch===this.epoch&&this.run){if(job.kind==='search')this.run.searchDone++;this.active--;this.run.status=this.run.searchDone<this.run.searchTotal?'searching':'reading';this.changed();this.persist();this.pump(epoch);}
    }
  }
}
export const fetchLabel=(h:Hit)=>h.cacheCleared?'正文缓存已清理':({not_requested:'未读取',queued:'等待读取',loading:'读取中',available:'已获取正文',empty:'正文不可用',failed:'正文不可用',cancelled:'读取已停止'}[h.fetchStatus]);
