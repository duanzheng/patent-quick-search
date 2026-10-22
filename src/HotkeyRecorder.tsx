import { useEffect, useRef, useState } from 'react';
import { captureHotkey, defaultHotkey, formatHotkey, hotkeyParts, hotkeyWarning } from './hotkey';
import type { Bridge } from './types';
interface Props {value:string;bridge:Bridge;onSave:(value:string)=>Promise<void>;mac?:boolean;}
export function HotkeyRecorder({value,bridge,onSave,mac=typeof navigator!=='undefined'&&/Mac/.test(navigator.platform)}:Props){
  const [draft,setDraft]=useState(value),[phase,setPhase]=useState<'idle'|'starting'|'recording'|'captured'|'ending'>('idle');
  const [preview,setPreview]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const field=useRef<HTMLInputElement>(null),saveButton=useRef<HTMLButtonElement>(null),editButton=useRef<HTMLButtonElement>(null),session=useRef<Promise<void>|null>(null),generation=useRef(0),recording=useRef(false),captured=useRef(false),snapshot=useRef(value),live=useRef(true);
  const dirty=draft!==value,busy=phase!=='idle',warning=hotkeyWarning(draft,mac);
  useEffect(()=>{setDraft(value);},[value]);
  useEffect(()=>{live.current=true;return()=>{live.current=false;generation.current++;recording.current=false;const current=session.current;if(current)void current.then(()=>bridge('end_hotkey_recording')).catch(()=>{});};},[bridge]);
  async function finish(cancel=false){
    if(cancel)setDraft(snapshot.current);
    if(!session.current)return;const current=session.current;session.current=null;generation.current++;recording.current=false;
    if(cancel||!captured.current)setDraft(snapshot.current);
    setPhase('ending');setPreview('');
    try{await current;await bridge('end_hotkey_recording');}catch{if(live.current)setError('原快捷键未能恢复，请重新保存快捷键或重开应用。');}
    finally{if(live.current)setPhase('idle');}
  }
  useEffect(()=>{const lost=()=>{if(recording.current){void finish(true);field.current?.blur();}};window.addEventListener('blur',lost);return()=>window.removeEventListener('blur',lost);});
  async function begin(){
    if(saving||session.current||phase==='ending')return;
    const epoch=++generation.current;snapshot.current=draft;captured.current=false;recording.current=true;setError('');setPhase('starting');
    const current=bridge<void>('begin_hotkey_recording');session.current=current;
    try{await current;if(!live.current||epoch!==generation.current)return;setPhase('recording');}
    catch{if(live.current&&epoch===generation.current){session.current=null;recording.current=false;setPhase('idle');setError('暂时无法开始录制，请重试。');field.current?.blur();}}
  }
  async function save(){
    if(!dirty||saving||busy)return;setSaving(true);setError('');
    try{await onSave(draft);}catch(raw){setError(typeof raw==='string'?raw:'无法保存快捷键，原组合仍保留，请换一个组合后重试。');}
    finally{setSaving(false);}
  }
  return <div className="hotkey-setting"><label className="field-label" htmlFor="hotkey-recorder">唤起快捷键</label><div className="hotkey-record-row"><input id="hotkey-recorder" ref={field} className={busy?'hotkey-recorder is-recording':'hotkey-recorder'} aria-label="全局快捷键" aria-describedby="hotkey-description" aria-busy={phase==='starting'||phase==='ending'} readOnly disabled={saving} value={phase==='recording'||phase==='captured'?preview||'请按组合键…':phase==='starting'?'准备录制…':formatHotkey(draft,mac)} onFocus={()=>void begin()} onBlur={()=>{if(recording.current)void finish();}} onKeyDown={e=>{
    if(e.key==='Tab')return;
    e.preventDefault();e.stopPropagation();
    if(e.key==='Escape'){void finish(true);field.current?.blur();return;}
    if(phase!=='recording')return;
    const result=captureHotkey(e.nativeEvent);
    if(result.kind==='modifiers'){setPreview(formatHotkey([e.ctrlKey&&'Ctrl',e.altKey&&'Alt',e.shiftKey&&'Shift',e.metaKey&&'Super'].filter(Boolean).join('+'),mac));return;}
    if(result.kind==='invalid'){setError(result.message);return;}
    if(result.kind==='captured'){captured.current=true;setDraft(result.value);setPreview(formatHotkey(result.value,mac));setError('');setPhase('captured');}
  }} onKeyUp={e=>{if(captured.current&&recording.current&&!['Shift','Control','Alt','Meta'].includes(e.key)){e.preventDefault();e.stopPropagation();void finish().then(()=>requestAnimationFrame(()=>(saveButton.current??editButton.current)?.focus()));field.current?.blur();}}}/><button ref={editButton} type="button" disabled={saving} onClick={()=>{if(busy){void finish(true);field.current?.blur();}else field.current?.focus();}}>{busy?'取消录制':'修改'}</button></div><p id="hotkey-description" className="muted">{busy?'按下组合键，Esc 取消；离开输入框将取消未完成的录制。':hotkeyParts(draft,mac).join(' + ')+' · 点击或 Tab 进入后直接按键'}</p>
    {warning&&<p className="muted hotkey-warning">{warning}</p>}{error&&<p role="alert" className="hotkey-error">{error}</p>}
    <div className="hotkey-actions">{dirty&&<><button ref={saveButton} type="button" disabled={saving||busy} onClick={()=>void save()}>{saving?'正在保存':'保存快捷键'}</button><button type="button" className="quiet" disabled={saving||busy} onClick={()=>{setDraft(value);setError('');}}>取消修改</button></>}<button type="button" className="quiet" disabled={saving||busy||draft===defaultHotkey(mac)} onClick={()=>{setDraft(defaultHotkey(mac));setError('');}}>恢复默认</button></div></div>;
}
