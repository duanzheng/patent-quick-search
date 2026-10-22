// Only reveals already received candidates. This is not a service page/cursor.
export const RESULT_BATCH_SIZE=5;
export const RESULT_PREFETCH_MARGIN=160;
export interface RevealState {runId:string|null;visible:number;loading:boolean;error:string|null;}
export class ResultReveal {
  state:RevealState={runId:null,visible:RESULT_BATCH_SIZE,loading:false,error:null};
  private generation=0;
  private active=false;
  private total=0;
  private pending:Promise<boolean>|undefined;
  constructor(private publish:(state:RevealState)=>void,private frame:()=>Promise<void>=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()))){}
  private update(next:Partial<RevealState>){this.state={...this.state,...next};this.publish(this.state);}
  reset(runId:string|null,total=0){this.active=true;this.generation++;this.pending=undefined;this.total=total;this.update({runId,visible:RESULT_BATCH_SIZE,loading:false,error:null});}
  setTotal(runId:string|null,total:number){if(runId===this.state.runId)this.total=total;}
  cancel(){this.active=false;this.generation++;this.pending=undefined;}
  reveal(runId:string,total:number):Promise<boolean>{
    if(!this.active||runId!==this.state.runId)return Promise.resolve(false);
    this.total=total;
    if(this.pending)return this.pending;
    if(this.state.visible>=this.total)return Promise.resolve(false);
    const generation=this.generation;this.update({loading:true,error:null});
    const request=Promise.resolve().then(()=>this.frame()).then(()=>{
      if(generation!==this.generation)return false;
      this.update({visible:Math.min(this.total,this.state.visible+RESULT_BATCH_SIZE)});return true;
    }).catch(()=>{if(generation===this.generation)this.update({error:'暂时无法显示更多结果，请重试。'});return false;}).finally(()=>{
      if(generation===this.generation){this.pending=undefined;this.update({loading:false});}
    });
    this.pending=request;return request;
  }
}
