// Explicit offline visual fixtures. This entry is selected only by a separate QA build.
// It never loads credentials, calls the network or reads/writes user history.
import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { App } from './App';
import { Engine } from './engine';
import type { Balance, Bootstrap, Bridge, Run } from './types';
const cases=['初始','输入','加载','结果','空结果','错误','设置','余额'] as const;
type Case=typeof cases[number];
const boot:Bootstrap={configured:false,settings:{schemaVersion:1,hotkey:'Alt+Super+Space',historyEnabled:false,serviceNoticeAccepted:true},history:[]};
const bridge:Bridge=async<T,>(command:string,args?:Record<string,unknown>)=>{
  if(command==='set_panel_expanded'||command==='hide_window')return invoke<T>(command,args);
  if(command==='get_history')return [] as T;
  throw {kind:'visual_fixture_no_service'};
};
function fixture(state:Case):Engine {
  const engine=new Engine(bridge);
  if(['初始','输入','设置','余额'].includes(state))return engine;
  const run:Run={schemaVersion:1,id:'visual-fixture',revision:1,query:'用弹性件补偿夹爪磨损',scope:'mixed',createdAt:Date.now(),deadlineAt:Date.now()+60000,status:state==='加载'?'searching':state==='空结果'?'empty':state==='错误'?'failed':'complete',hits:[],errors:state==='错误'?['网络连接失败，请检查网络后重试。']:[],searchDone:2,searchTotal:2,logicalSearch:2,attempts:0};
  if(state==='结果')run.hits=[
    {id:'fixture-patent',originalUrl:'https://patents.google.com/patent/CN000000000A/zh',canonicalKey:'fixture-patent',domain:'patents.google.com',publication:'CN000000000A',title:'一种具有弹性补偿结构的夹持装置（界面测试样例）',snippet:'通过弹性元件吸收夹爪与工件之间的位移偏差，保持夹持过程中的作用力稳定。',summary:'合成视觉样例，不是真实检索结果。',matches:[],retrievedAt:Date.now()},
    {id:'fixture-page',originalUrl:'https://example.com/technical-fixture',canonicalKey:'fixture-page',domain:'example.com',title:'夹持系统中的柔顺机构与恒力控制（界面测试样例）',snippet:'介绍弹簧、柔性铰链和位移反馈在夹持机构中的应用。',summary:'合成视觉样例。',matches:[],retrievedAt:Date.now()}];
  engine.run=run;return engine;
}
export function VisualQa(){
  const [state,setState]=useState<Case>('初始');const [dark,setDark]=useState(false);
  const engine=useMemo(()=>fixture(state),[state]);
  const balance:Balance={credentialGeneration:0,requestId:1,fetchedAt:Date.now(),isAvailable:true,infos:[{currency:'CNY',total_balance:'12.3400',granted_balance:'2.0000',topped_up_balance:'10.3400'}]};
  return <div className="visual-qa-root"><div className="visual-qa-bar"><span>视觉夹具 · 未连接服务</span>{cases.map(c=><button key={c} aria-pressed={state===c} onClick={()=>setState(c)}>{c}</button>)}<button onClick={()=>{setDark(!dark);document.documentElement.dataset.theme=dark?'light':'dark';}}>{dark?'浅色':'深色'}</button></div><App key={state} bridge={bridge} engine={engine} initialBoot={{...boot,configured:state==='余额'}} initialDraft={state==='输入'?'通过弹性件补偿夹爪磨损，保持夹持力稳定':undefined} initialPanel={state==='设置'||state==='余额'?'settings':null} initialBalance={state==='余额'?balance:undefined}/></div>;
}
