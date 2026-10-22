import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Engine } from './engine';
import { HotkeyRecorder } from './HotkeyRecorder';
import { openOriginalSource } from './source';
import { ResultReveal, RESULT_BATCH_SIZE, RESULT_PREFETCH_MARGIN } from './result-reveal';
import type { RevealState } from './result-reveal';
import { hasExplicitSite, normalize, validateInput } from './domain';
import type { ApiError, Balance, Bootstrap, Bridge, Hit, Run, Scope, Settings } from './types';
import './style.css';
const productionBridge:Bridge=(command,args)=>invoke(command,args);
const productionEngine=new Engine(productionBridge);
const example='通过弹性件补偿夹爪磨损，保持夹持力稳定';
const date=(value:number)=>new Date(value).toLocaleString();
const statuses:Record<string,string>={searching:'正在搜索',complete:'',partial:'部分原文暂不可用',empty:'没有找到相关资料',failed:'暂时无法搜索',stopped:'已停止搜索',expired:'此次搜索已结束'};
type Panel='settings'|'history'|'notice'|'syntax'|null;
export function escapeDestination(panel:Panel,balanceOpen:boolean){
  if(balanceOpen)return 'balance';
  if(panel==='history')return 'settings';
  if(panel)return 'search';
  return 'hide';
}
interface Props {bridge?:Bridge;engine?:Engine;initialBoot?:Bootstrap;initialPanel?:Panel;initialBalance?:Balance;initialDraft?:string;}
function Icon({name}:{name:string}) {
  const paths:Record<string,string>={help:'M9.1 9a3 3 0 1 1 5.4 1.8c-.8.7-2.5 1.3-2.5 3.2 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',search:'m20 20-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',settings:'M10.015 5.079 L10.720 2.890 L13.280 2.890 L13.985 5.079 A7.2 7.2 0 0 1 15.491 5.703 L17.537 4.653 L19.347 6.463 L18.297 8.509 A7.2 7.2 0 0 1 18.921 10.015 L21.110 10.720 L21.110 13.280 L18.921 13.985 A7.2 7.2 0 0 1 18.297 15.491 L19.347 17.537 L17.537 19.347 L15.491 18.297 A7.2 7.2 0 0 1 13.985 18.921 L13.280 21.110 L10.720 21.110 L10.015 18.921 A7.2 7.2 0 0 1 8.509 18.297 L6.463 19.347 L4.653 17.537 L5.703 15.491 A7.2 7.2 0 0 1 5.079 13.985 L2.890 13.280 L2.890 10.720 L5.079 10.015 A7.2 7.2 0 0 1 5.703 8.509 L4.653 6.463 L6.463 4.653 L8.509 5.703 A7.2 7.2 0 0 1 10.015 5.079Z M15.1 12a3.1 3.1 0 1 0-6.2 0 3.1 3.1 0 0 0 6.2 0',history:'M3 10a9 9 0 1 1 2 8 M3 4v6h6 M12 7v5l3 2',close:'m6 6 12 12 M6 18 18 6',arrow:'M5 12h14 M13 6l6 6-6 6',external:'M14 3h7v7 M21 3 11 13 M10 3H4v17h16v-6',copy:'M8 8h12v13H8z M16 8V3H3v13h5',file:'M6 2h8l5 5v15H6z M14 2v6h5 M9 12h7 M9 16h7',patent:'M12 3 3 8l9 5 9-5-9-5z M5 12v6l7 4 7-4v-6'};
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]??paths.file}/></svg>;
}
export function App({bridge=productionBridge,engine=productionEngine,initialBoot,initialPanel=null,initialBalance,initialDraft}:Props){
  const [,render]=useState(0);const [boot,setBoot]=useState(initialBoot);const [draft,setDraft]=useState(initialDraft??engine.run?.query??'');const [scope,setScope]=useState<Scope>(engine.run?.scope??'mixed');
  const [error,setError]=useState('');const [panel,setPanel]=useState<Panel>(initialPanel);const [active,setActive]=useState(-1);const [history,setHistory]=useState<Run[]>([]);
  const [keyDraft,setKeyDraft]=useState('');const [showKey,setShowKey]=useState(false);const [editing,setEditing]=useState(!initialBoot?.configured);const [saving,setSaving]=useState(false);
  const [balanceOpen,setBalanceOpen]=useState(!!initialBalance);const [balance,setBalance]=useState<Balance|null>(initialBalance??null);const [balanceError,setBalanceError]=useState('');const [balanceBusy,setBalanceBusy]=useState(false);const [retryAt,setRetryAt]=useState(0);const [clock,setClock]=useState(Date.now());
  const historyEntry=useRef<HTMLButtonElement>(null);const returningToHistory=useRef(false);const navigationEpoch=useRef(0);const balancePending=useRef(false);const credentialEpoch=useRef(0);const composing=useRef(false);const input=useRef<HTMLTextAreaElement>(null);
  const resultNavigation=useRef(0);const resultContext=useRef(false);const panelReturn=useRef<HTMLElement|null>(null);
  const content=useRef<HTMLElement>(null);const moreResults=useRef<HTMLDivElement>(null);
  const [revealState,setRevealState]=useState<RevealState>({runId:null,visible:RESULT_BATCH_SIZE,loading:false,error:null});
  const [resultReveal]=useState(()=>new ResultReveal(setRevealState));
  const run=engine.run;const running=engine.running;
  const visible=revealState.runId===run?.id?revealState.visible:RESULT_BATCH_SIZE;
  const revealLoading=revealState.runId===run?.id&&revealState.loading;
  const revealError=revealState.runId===run?.id?revealState.error:null;
  useEffect(()=>engine.subscribe(()=>render(n=>n+1)),[engine]);
  useEffect(()=>{resultNavigation.current++;setActive(-1);resultContext.current=false;resultReveal.reset(run?.id??null);if(content.current)content.current.scrollTop=0;return()=>resultReveal.cancel();},[resultReveal,run?.id]);
  useEffect(()=>{resultReveal.setTotal(run?.id??null,run?.hits.length??0);},[resultReveal,run?.id,run?.hits.length]);
  useEffect(()=>{
    const root=content.current,target=moreResults.current,id=run?.id;
    if(!root||!target||!id||panel||revealLoading||revealError||typeof IntersectionObserver==='undefined')return;
    let disposed=false;
    const observer=new IntersectionObserver(entries=>{
      if(!disposed&&entries.some(entry=>entry.isIntersecting)&&engine.run?.id===id)void resultReveal.reveal(id,engine.run.hits.length);
    },{root,rootMargin:`0px 0px ${RESULT_PREFETCH_MARGIN}px 0px`,threshold:0});
    observer.observe(target);return()=>{disposed=true;observer.disconnect();};
  },[engine,resultReveal,run?.id,run?.hits.length,visible,panel,revealLoading,revealError]);
  function resetResults(){resultNavigation.current++;resultReveal.reset(engine.run?.id??null);if(content.current)content.current.scrollTop=0;}

  useEffect(()=>{
    if(!isTauri()){if(!initialBoot)setError('请打开桌面应用使用搜索。');return;}
    if(!initialBoot)void bridge<Bootstrap>('bootstrap').then(b=>{setBoot(b);setEditing(!b.configured);if(b.credentialError||b.hotkeyError)setError([b.credentialError,b.hotkeyError].filter(Boolean).join(' '));input.current?.focus();}).catch(()=>setError('暂时无法打开搜索服务，请退出后重试。'));
    const focus=listen('focus-input',()=>{const dialogs=document.querySelectorAll<HTMLElement>('[role="dialog"]');const dialog=dialogs[dialogs.length-1];if(dialog)(dialog.querySelector<HTMLElement>('input,button'))?.focus();else input.current?.focus();});
    return()=>{void focus.then(f=>f());};
  },[bridge,initialBoot]);
  useEffect(()=>{if(isTauri())void bridge('set_panel_expanded',{expanded:!!run||!!panel,message:!!run&&!run.hits.length&&!panel}).catch(()=>{});},[bridge,!!run,!!run?.hits.length,panel]);
  useEffect(()=>{if(!retryAt)return;const t=setInterval(()=>setClock(Date.now()),500);return()=>clearInterval(t);},[retryAt]);
  function closePanel(searchOnly=false){navigationEpoch.current++;returningToHistory.current=false;setPanel(null);setKeyDraft('');setEditing(!boot?.configured);setShowKey(false);setBalanceOpen(false);const target=!searchOnly&&panel!=='syntax'?panelReturn.current:null;(target?.isConnected?target:input.current)?.focus();}
  async function hideWindow(){try{await bridge('hide_window');}catch{setError('暂时无法收起窗口，请重试。');}}
  function returnToSettings(){navigationEpoch.current++;returningToHistory.current=true;setPanel('settings');}
  function rememberSearchFocus(){resultNavigation.current++;panelReturn.current=resultContext.current&&active>=0?document.getElementById(`result-${active}`):input.current;}
  function openSyntax(){rememberSearchFocus();setPanel('syntax');}
  function openSettings(){rememberSearchFocus();navigationEpoch.current++;returningToHistory.current=false;setEditing(!boot?.configured);setError('');setPanel('settings');}
  useEffect(()=>{
    function key(e:KeyboardEvent){
      const command=/Mac/.test(navigator.platform)?e.metaKey:e.ctrlKey;
      if(e.isComposing||composing.current)return;
      if(e.key==='Escape'){e.preventDefault();switch(escapeDestination(panel,balanceOpen)){
        case 'balance':setBalanceOpen(false);break;
        case 'settings':returnToSettings();break;
        case 'search':closePanel();break;
        case 'hide':void hideWindow();break;
      }}
      if(command&&e.key.toLowerCase()==='w'){e.preventDefault();void hideWindow();}
      if(command&&e.key===','){e.preventDefault();openSettings();}
      const target=e.target instanceof Element?e.target:null;
      const row=target?.closest<HTMLElement>('[data-result-index]');
      const inQuery=target===input.current;
      const editingControl=!!target?.closest('input,textarea,select,[contenteditable="true"]');
      if(!panel&&!e.defaultPrevented&&!e.altKey&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&run?.hits.length&&
        (inQuery||(row&&!editingControl))&&['ArrowDown','ArrowUp'].includes(e.key)){
        // Multiline queries keep their normal caret navigation; a selected result or
        // a single-line search entry uses arrows to navigate the result collection.
        if(inQuery&&active<0&&/[\r\n\u2028\u2029]/u.test(draft))return;
        e.preventDefault();void navigateResults(e.key==='ArrowDown'?1:-1,!!row);
      }
    }
    document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  });
  function selectResult(index:number,focus=false){
    resultNavigation.current++;setActive(index);resultContext.current=true;
    if(focus)document.getElementById(`result-${index}`)?.focus({preventScroll:true});
  }
  async function navigateResults(direction:1|-1,fromRow:boolean){
    const current=engine.run;if(!current)return;const epoch=++resultNavigation.current;
    const next=active+direction;
    if(next<0){setActive(-1);resultContext.current=false;input.current?.focus();return;}
    if(next>=current.hits.length)return;
    if(next>=visible){const id=current.id;const added=await resultReveal.reveal(id,current.hits.length);if(!added||engine.run?.id!==id||resultNavigation.current!==epoch)return;}
    selectResult(next);
    if(fromRow){const selected=resultNavigation.current;requestAnimationFrame(()=>{if(engine.run?.id===current.id&&selected===resultNavigation.current)document.getElementById(`result-${next}`)?.focus({preventScroll:true});});}
  }
  useEffect(()=>{if(active>=0)document.getElementById(`result-${active}`)?.scrollIntoView({block:'nearest'});},[active]);
  useEffect(()=>{
    if(!panel)return;const dialogs=document.querySelectorAll<HTMLElement>('[role="dialog"]');const dialog=dialogs[dialogs.length-1];if(!dialog)return;
    const focusable=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,summary,[tabindex="0"]')).filter(n=>n.getClientRects().length>0);
    const target=panel==='settings'&&returningToHistory.current?historyEntry.current:panel==='settings'&&editing?dialog.querySelector<HTMLInputElement>('.key-input'):focusable()[0];
    (target??focusable()[0])?.focus();returningToHistory.current=false;
    const trap=(e:KeyboardEvent)=>{if(e.key!=='Tab')return;const nodes=focusable(),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first?.focus();}};
    document.addEventListener('keydown',trap);return()=>document.removeEventListener('keydown',trap);
  },[panel,editing]);
  async function settings(next:Settings){await bridge('update_settings',{settings:next});setBoot(b=>b?{...b,settings:next}:b);}
  async function submit(){const invalid=validateInput(draft);if(invalid){setError(invalid);return;}if(!boot?.configured){openSettings();return;}if(!boot.settings.serviceNoticeAccepted){setPanel('notice');return;}setError('');setActive(-1);resetResults();await engine.start(draft,scope);}
  function resetBalance(){credentialEpoch.current++;balancePending.current=false;setBalanceBusy(false);setBalance(null);setBalanceError('');setRetryAt(0);}
  async function useKey(){if(saving)return;setSaving(true);setError('');try{await bridge('set_local_key',{input:keyDraft});engine.stop();resetBalance();setBoot(b=>b?{...b,configured:true}:b);setKeyDraft('');closePanel();}catch{setError('无法保存密钥，请检查输入后重试。');}finally{setSaving(false);}}
  async function clearKey(){try{await bridge('clear_local_key');engine.stop();resetBalance();setBoot(b=>b?{...b,configured:false}:b);setEditing(true);setKeyDraft('');}catch{setError('无法清除本地密钥，请检查磁盘权限后重试。');}}
  async function queryBalance(refresh=false){setBalanceOpen(true);if(balancePending.current||(!refresh&&balance))return;balancePending.current=true;setBalanceBusy(true);setBalanceError('');const epoch=credentialEpoch.current;try{const value=await bridge<Balance>('query_balance',{refresh});if(epoch===credentialEpoch.current){setBalance(value);setRetryAt(0);}}catch(raw){if(epoch!==credentialEpoch.current)return;const e=raw as ApiError;if(e.kind==='cancelled')return;if(e.status===401){setBalance(null);setBalanceError('API Key 无效，请更换后重试。');}else setBalanceError(e.status===429?'查询频繁，请稍后刷新。':e.kind==='unconfigured'?'请先添加 API Key。':'暂时无法查询余额，请重试。');if(e.status===429){const now=Date.now();setClock(now);setRetryAt(now+(e.retryAfter??30)*1000);}}finally{if(epoch===credentialEpoch.current){balancePending.current=false;setBalanceBusy(false);}}}
  async function openHistory(){const epoch=++navigationEpoch.current;setBalanceOpen(false);try{const rows=await bridge<Run[]>('get_history');if(epoch!==navigationEpoch.current)return;setHistory(rows);setPanel('history');}catch{if(epoch===navigationEpoch.current)setError('暂时无法打开历史，请重试。');}}
  async function removeHistory(id?:string){if(!id||engine.run?.id===id)engine.clear();await bridge('delete_history',{id:id??null});setHistory(await bridge<Run[]>('get_history'));}
  async function copy(text:string){try{await navigator.clipboard.writeText(text);}catch{setError('复制失败，请选择文字后使用系统复制快捷键。');}}
  async function source(h:Hit){try{await openOriginalSource(bridge,h.originalUrl);engine.action('source_opened',h.id);}catch{setError('无法打开来源，请复制链接到浏览器。');}}
  const count=[...normalize(draft)].length,waiting=Math.max(0,Math.ceil((retryAt-clock)/1000));
  return <div className="spotlight-shell">
    <header className="window-toolbar" data-tauri-drag-region><span data-tauri-drag-region>技术点快搜</span><nav aria-label="设置入口"><button className="icon-button settings-trigger" onClick={openSettings} aria-label="设置" title="设置" aria-haspopup="dialog" aria-expanded={panel==='settings'||panel==='history'} aria-controls="settings-panel"><Icon name="settings"/></button></nav></header>
    <form className="search-form" onSubmit={e=>{e.preventDefault();void submit();}}><div className="search-line"><span className="search-symbol"><Icon name="search"/></span><label className="sr-only" htmlFor="query">搜索技术点、关键词或公开号</label><textarea id="query" ref={input} autoFocus rows={1} value={draft} placeholder="搜索技术点、关键词或公开号" aria-activedescendant={active>=0?`result-${active}`:undefined} aria-controls="search-results" onFocus={()=>{resultContext.current=false;}} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onChange={e=>{resultNavigation.current++;setDraft(e.target.value);setActive(-1);engine.action('query_edited');}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&!composing.current&&e.nativeEvent.keyCode!==229){e.preventDefault();if(active>=0&&run?.hits[active])void source(run.hits[active]);else void submit();}}}/><button type="button" className="icon-button syntax-trigger" aria-label="高级搜索语法" title="高级搜索语法" aria-haspopup="dialog" aria-controls="syntax-help" aria-expanded={panel==='syntax'} onClick={openSyntax}><Icon name="help"/></button>{running&&<button type="button" className="stop-button" onClick={()=>engine.stop()}>停止</button>}<button type="submit" className="search-submit" aria-label={run?'重新搜索':'搜索'} title={run?'重新搜索，可产生新费用':'搜索'} disabled={!boot}><Icon name="arrow"/></button></div><div className="search-options">{hasExplicitSite(draft)?<span className="custom-scope">按查询中的站点条件</span>:<select aria-label="检索范围" value={scope} onChange={e=>{setScope(e.target.value as Scope);setActive(-1);}}><option value="mixed">专利与技术资料</option><option value="patents">仅专利 · Google Patents</option></select>}<span className={count>100?'character-count danger':'character-count'}>{count>0?`${count}/100`:'仅搜索公开资料'}</span></div></form>
    {error&&<div role="alert" className="inline-alert"><span>{error}</span><button className="icon-button" onClick={()=>setError('')} aria-label="关闭提示"><Icon name="close"/></button></div>}
    <main ref={content} className="content-area" aria-busy={revealLoading}>
    {run?<section id="search-results" className="results" aria-label="搜索结果" aria-live="polite"><div className="results-heading"><span title={run.query}>“{run.query}” <b>{run.hits.length>0?`· ${run.hits.length} 条`:''}</b></span>{run.hits.length>0&&run.status==='searching'&&<span className="working"><i/>{statuses[run.status]}</span>}</div>
      {run.errors.some(e=>!/^来源 \d+ 已跳过/.test(e))&&<div className="result-warning">{run.errors.find(e=>!/^来源 \d+ 已跳过/.test(e))}{run.errors.some(e=>e.includes('余额'))&&<button onClick={()=>{openSettings();void queryBalance();}}>查看余额</button>}</div>}
      {!run.hits.length&&<div className="state-message"><span className={run.status==='searching'?'large-spinner':'state-icon'}>{run.status!=='searching'&&<Icon name="search"/>}</span><h2>{statuses[run.status]||'没有找到相关资料'}</h2><p>{run.status==='searching'?'找到的资料会陆续显示。':run.status==='empty'?'试试缩短描述，或切换到“专利与技术资料”。':'处理上方提示后，可按 Enter 重新搜索。'}</p></div>}
      {run.hits.slice(0,visible).map((h,index)=><article id={`result-${index}`} key={h.id} className={`result-row ${active===index?'is-active':''}`} tabIndex={active===index?0:-1} data-result-index={index} aria-label={`结果 ${index+1}：${h.title}${active===index?'，已选中':''}`} onFocus={()=>selectResult(index)} onClick={e=>{selectResult(index);if(!(e.target as Element).closest('button,a,input,textarea,select'))e.currentTarget.focus({preventScroll:true});}} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();void source(h);}}}><span className={`source-icon ${h.publication?'patent':''}`}><Icon name={h.publication?'patent':'file'}/></span><div className="result-main"><button className="result-title" onClick={()=>void source(h)}>{h.title}</button><div className="result-source">{h.publication??h.domain}<span>·</span>{h.publication?'专利页面':'网页资料'}</div><p className="result-snippet">{h.snippet||h.summary||'来源未提供摘要'}</p><div className="result-bottom"><div><button onClick={()=>void source(h)}>打开原网页 <Icon name="external"/></button><button onClick={()=>{void copy([h.title,h.publication,h.originalUrl].filter(Boolean).join('\n'));engine.action('source_copied',h.id);}} aria-label={`复制来源：${h.title}`} title="复制来源"><Icon name="copy"/></button></div></div></div></article>)}
      {run.hits.length>visible?<div ref={moreResults} className="result-reveal">{revealError&&<p role="alert" className="reveal-error">{revealError}</p>}<button type="button" className="show-more" disabled={revealLoading} onClick={()=>void resultReveal.reveal(run.id,run.hits.length)}>{revealLoading?'显示中…':revealError?'重试显示':'显示更多结果'} <span>↓</span></button></div>:run.hits.length>0&&!running&&<p className="results-end">本次结果已全部显示</p>}
    </section>:<section className="start-state" aria-label="开始搜索"><p>从一个技术点，找到值得看的资料。</p><button className="example-button" onClick={()=>{setDraft(example);input.current?.focus();}}>试试：用弹性件补偿夹爪磨损 <span>↗</span></button></section>}
    </main>
    <footer className="keyboard-bar"><span>{!panel&&<><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>↵</kbd> {active>=0?'打开原网页':'搜索'}</>}</span><span><kbd>esc</kbd> {balanceOpen?'收起余额':panel==='history'?'返回设置':panel?'返回搜索':'收起'}</span></footer>
    {panel&&<div className={`overlay ${panel==='syntax'?'syntax-overlay':''}`} onClick={e=>{if(panel==='syntax'&&e.target===e.currentTarget)closePanel(true);}}><section id={panel==='syntax'?'syntax-help':panel==='notice'?'service-notice':'settings-panel'} className={`dialog ${panel==='syntax'?'syntax-dialog':''}`} role="dialog" aria-modal="true" aria-label={panel==='syntax'?'高级搜索语法':panel==='history'?'搜索历史':panel==='notice'?'启用检索服务':'设置'}><div className="dialog-header">{panel==='history'?<div className="history-heading"><button className="icon-button history-back" onClick={returnToSettings} aria-label="返回设置" title="返回设置"><Icon name="arrow"/></button><h2>搜索历史</h2></div>:<h2>{panel==='syntax'?'高级搜索语法':panel==='notice'?'开始使用检索服务':'设置'}</h2>}<button className="icon-button" onClick={()=>closePanel()} aria-label="关闭面板"><Icon name="close"/></button></div>
      {panel==='syntax'&&<div className="syntax-content"><dl className="syntax-examples">
        <dt>精确匹配</dt><dd>用英文双引号包住短语：<code>"短语"</code></dd>
        <dt>排除词语</dt><dd>词前加减号；短语加双引号：<code>-词语 -"短语"</code></dd>
        <dt>限定或排除站点</dt><dd>site: 后填域名，多站点用大写 OR：<code>site:example.com OR site:example.org</code><code>-site:example.com</code></dd>
        <dt>指定语言</dt><dd>lang: 后填语言代码，多种语言用逗号：<code>lang:zh,en</code></dd>
        <dt>限定网页发布时间</dt><dd>日期填年份或 YYYY-MM-DD：<code>after:2025-01-01 before:2026</code></dd>
      </dl><p className="muted">将这些条件与搜索词一起输入。日期不是专利优先权日。</p><p className="muted">含 site: 或 -site: 时按输入的站点条件搜索，覆盖范围选项；删除后恢复所选范围。</p><p className="muted">输入最多 100 个字符；完整查询不超过 128 个字符，不会截断。</p></div>}
      {panel==='notice'&&<div className="service-notice"><p>查询文字会发送给 DeepSeek，费用由你的 DeepSeek 账户承担。</p><p className="muted">请只输入可发送至外部服务的公开内容。</p><button className="primary" onClick={()=>{if(!boot)return;void settings({...boot.settings,serviceNoticeAccepted:true}).then(()=>{setPanel(null);resetResults();return engine.start(draft,scope);}).catch(()=>setError('暂时无法启用，请重试。'));}}>同意并搜索</button></div>}
      {panel==='settings'&&boot&&<><section className="settings-section"><div className="setting-label"><h3>DeepSeek API Key</h3><span className={boot.configured?'session-badge connected':'session-badge'}>{boot.configured?'已配置':'未连接'}</span></div><p className="muted">保存在这台电脑，重启后自动连接。</p>{editing?<><input aria-label="DeepSeek API Key" className="key-input" autoComplete="off" spellCheck={false} type={showKey?'text':'password'} value={keyDraft} placeholder="粘贴你的 DeepSeek API Key" onChange={e=>setKeyDraft(e.target.value)}/><div className="setting-actions"><label className="check-label"><input type="checkbox" checked={showKey} onChange={e=>setShowKey(e.target.checked)}/>显示密钥</label><div>{boot.configured&&<button className="quiet" onClick={()=>{setKeyDraft('');setShowKey(false);setEditing(false);}}>取消</button>}<button className="primary" disabled={saving||!keyDraft.trim()} onClick={()=>void useKey()}>{saving?'正在保存':'保存密钥'}</button></div></div></>:<div className="setting-actions"><button onClick={()=>{setKeyDraft('');setEditing(true);}}>更换密钥</button><button className="quiet danger" onClick={()=>void clearKey()}>清除密钥</button></div>}</section>
      <section className="settings-section"><div className="setting-label"><div><h3>账户余额</h3><p className="muted">查看此 API Key 所属的 DeepSeek 账户。</p></div><button disabled={!boot.configured||balanceBusy} onClick={()=>void queryBalance()}>{balanceBusy?'查询中…':'查看余额'}</button></div>{balanceOpen&&<div className="balance-card"><div className="balance-heading"><span>DeepSeek 账户</span><div><button className="quiet" disabled={balanceBusy||waiting>0} onClick={()=>void queryBalance(true)}>{balanceBusy?'查询中…':waiting>0?`${waiting} 秒后刷新`:'刷新'}</button><button className="icon-button" onClick={()=>setBalanceOpen(false)} aria-label="收起余额"><Icon name="close"/></button></div></div>{balanceError&&<p role="alert" className="balance-error">{balanceError}{balance&&' 以下为上次查询结果。'}</p>}{balance?<><p className="balance-availability">{balance.isAvailable?'账户余额可用':'账户当前无可用余额'}</p>{balance.infos.map(b=><div className="currency-balance" key={b.currency}><div className="balance-total"><span>{b.currency}</span><strong>{b.total_balance}</strong></div><dl><dt>赠金余额</dt><dd>{b.granted_balance}</dd><dt>充值余额</dt><dd>{b.topped_up_balance}</dd></dl></div>)}<p className="muted">更新于 {date(balance.fetchedAt)} · 余额可能随其他应用使用而变化。</p></>:<p className="muted">{balanceBusy?'正在查询余额…':'尚无余额信息'}</p>}</div>}</section>
      <section className="settings-section history-entry"><button ref={historyEntry} className="settings-row" onClick={()=>void openHistory()} aria-label="搜索历史"><span><Icon name="history"/>搜索历史</span><Icon name="arrow"/></button></section>
      <details className="settings-details"><summary>快捷键与本地数据</summary><p className="muted">API Key 以明文保存在此电脑的应用配置中；请勿共享该文件。不会读取或修改以前的钥匙串条目。</p><HotkeyRecorder value={boot.settings.hotkey} bridge={bridge} onSave={hotkey=>settings({...boot.settings,hotkey})}/><label className="check-label history-toggle"><input type="checkbox" checked={boot.settings.historyEnabled} onChange={e=>void settings({...boot.settings,historyEnabled:e.target.checked}).catch(()=>setError('设置未保存，请重试。'))}/>在本机保存搜索历史</label><p className="muted">最近 50 次搜索保留 30 天。关闭不会删除已有历史。</p><div className="setting-actions"><button className="quiet danger" onClick={()=>void removeHistory().catch(()=>setError('无法清空历史，请重试。'))}>清空历史</button><button className="quiet" onClick={()=>void bridge<boolean>('export_metrics').catch(()=>setError('无法导出，请重试。'))}>导出诊断记录</button></div><p className="muted">诊断记录不含查询文字、网页内容、密钥或余额。退出应用请使用菜单栏的“退出”或 Command+Q。</p></details>{error&&<p role="alert" className="inline-alert">{error}</p>}</>}
      {panel==='history'&&<div className="history-list">{history.length===0?<div className="state-message"><Icon name="history"/><h3>还没有搜索历史</h3><p>最近的搜索会显示在这里。</p></div>:history.map(r=><div className="history-item" key={r.id}><button onClick={()=>{engine.restore(r);setDraft(r.query);setScope(r.scope);resetResults();setActive(-1);resultContext.current=false;closePanel(true);}}><strong>{r.query}</strong><small>{date(r.createdAt)} · {r.hits.length} 条资料</small></button><button className="icon-button" onClick={()=>void removeHistory(r.id).catch(()=>setError('无法删除这条历史，请重试。'))} aria-label={`删除历史：${r.query}`}><Icon name="close"/></button></div>)}</div>}
    </section></div>}
  </div>;
}
