// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import { App } from '../src/App';
import { Engine } from '../src/engine';
import { HotkeyRecorder } from '../src/HotkeyRecorder';
import type { Bridge } from '../src/types';
let host:HTMLDivElement,root:Root,calls:string[],save:ReturnType<typeof vi.fn>,failBegin:boolean,failSave:boolean;
const field=()=>host.querySelector<HTMLInputElement>('#hotkey-recorder')!;
const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;
const press=async(key:string,code:string,props:KeyboardEventInit={},type='keydown')=>{await act(async()=>{field().dispatchEvent(new KeyboardEvent(type,{key,code,ctrlKey:true,altKey:true,bubbles:true,cancelable:true,...props}));});};
async function capture(){await act(async()=>field().focus());await press('k','KeyK');await press('k','KeyK',{},'keyup');}
describe('shortcut recorder React DOM with isolated native command transport',()=>{
 beforeEach(async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});calls=[];failBegin=false;failSave=false;
  const bridge:Bridge=async<T,>(command:string)=>{calls.push(command);if(failBegin&&command==='begin_hotkey_recording')throw new Error('unregister failed');return undefined as T;};
  save=vi.fn(async()=>{if(failSave)throw '这个快捷键不可用或已被占用，请录制其他组合';});host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<HotkeyRecorder value="Alt+Super+Space" mac bridge={bridge} onSave={save}/>));
 });
 afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
 it('focuses, captures one chord, resumes old binding on keyup and saves only explicitly',async()=>{
  expect(field().readOnly).toBe(true);expect(field().value).toBe('⌥ ⌘ 空格');expect(calls).toEqual([]);
  await capture();expect(field().value).toBe('⌃ ⌥ K');expect(calls).toEqual(['begin_hotkey_recording','end_hotkey_recording']);expect(save).not.toHaveBeenCalled();
  await act(async()=>button('保存快捷键').click());expect(save).toHaveBeenCalledExactlyOnceWith('Ctrl+Alt+KeyK');
 });
 it('Esc cancels without bubbling to window close or changing configuration',async()=>{
  const parent=vi.fn();document.addEventListener('keydown',parent);await act(async()=>field().focus());await press('Escape','Escape');expect(field().value).toBe('⌥ ⌘ 空格');expect(save).not.toHaveBeenCalled();expect(parent).not.toHaveBeenCalled();expect(calls.at(-1)).toBe('end_hotkey_recording');document.removeEventListener('keydown',parent);
 });
 it('modifier-only and blur abandon recording, preserving the prior value',async()=>{
  await act(async()=>field().focus());await press('Control','ControlLeft');expect(host.textContent).not.toContain('保存快捷键');await act(async()=>field().blur());expect(field().value).toBe('⌥ ⌘ 空格');expect(save).not.toHaveBeenCalled();expect(calls.at(-1)).toBe('end_hotkey_recording');
 });
 it('a failed native preparation cannot record or write settings',async()=>{
  failBegin=true;await act(async()=>field().focus());expect(host.textContent).toContain('暂时无法开始录制');await press('k','KeyK');expect(field().value).toBe('⌥ ⌘ 空格');expect(save).not.toHaveBeenCalled();
 });
 it('keeps rejected drafts for correction and supports cancel/default without implicit saves',async()=>{
  await capture();failSave=true;await act(async()=>button('保存快捷键').click());expect(host.textContent).toContain('已被占用');expect(field().value).toBe('⌃ ⌥ K');
  await act(async()=>button('取消修改').click());expect(field().value).toBe('⌥ ⌘ 空格');expect(save).toHaveBeenCalledTimes(1);
  await capture();await act(async()=>button('恢复默认').click());expect(field().value).toBe('⌥ ⌘ 空格');expect(save).toHaveBeenCalledTimes(1);
 });
 it('resumes after unmount so native recording cannot stay active',async()=>{
  await act(async()=>field().focus());await act(async()=>root.render(<div/>));await act(async()=>{});expect(calls.at(-1)).toBe('end_hotkey_recording');expect(save).not.toHaveBeenCalled();
 });
 it('cancels when the application loses focus and never submits the draft',async()=>{
  await act(async()=>field().focus());await press('Control','ControlLeft');await act(async()=>window.dispatchEvent(new FocusEvent('blur')));expect(calls).toEqual(['begin_hotkey_recording','end_hotkey_recording']);expect(field().value).toBe('⌥ ⌘ 空格');expect(save).not.toHaveBeenCalled();
 });
 it('cleans up a native begin that resolves after the component has unmounted',async()=>{
  let release!:()=>void;const pending=new Promise<void>(r=>{release=r;});const commands:string[]=[];const bridge:Bridge=async<T,>(command:string)=>{commands.push(command);if(command==='begin_hotkey_recording')await pending;return undefined as T;};
  await act(async()=>root.render(<HotkeyRecorder value="Alt+Super+Space" mac bridge={bridge} onSave={save}/>));await act(async()=>field().focus());await act(async()=>root.render(<div/>));expect(commands).toEqual(['begin_hotkey_recording']);await act(async()=>release());expect(commands).toEqual(['begin_hotkey_recording','end_hotkey_recording']);
 });
 it('reports a failed resume instead of implying that the previous shortcut works',async()=>{
  const bridge:Bridge=async<T,>(command:string)=>{if(command==='end_hotkey_recording')throw 'restore failed';return undefined as T;};await act(async()=>root.render(<HotkeyRecorder value="Alt+Super+Space" mac bridge={bridge} onSave={save}/>));await act(async()=>field().focus());await press('Escape','Escape');expect(host.textContent).toContain('原快捷键未能恢复');expect(save).not.toHaveBeenCalled();
 });
 it('integrates with application settings: Escape stays in the dialog and save updates only the shortcut',async()=>{
  const settings={schemaVersion:1 as const,hotkey:'Alt+Super+Space',historyEnabled:true,serviceNoticeAccepted:true};const transport:{command:string;args?:Record<string,unknown>}[]=[];
  const bridge:Bridge=async<T,>(command:string,args?:Record<string,unknown>)=>{transport.push({command,args});return undefined as T;};await act(async()=>root.render(<App bridge={bridge} engine={new Engine(bridge)} initialBoot={{configured:true,history:[],settings}} initialPanel="settings"/>));
  await act(async()=>{host.querySelector<HTMLDetailsElement>('details')!.open=true;field().focus();});await press('Escape','Escape');expect(host.querySelector('[role="dialog"]')).not.toBeNull();expect(transport.some(c=>c.command==='hide_window'||c.command==='update_settings')).toBe(false);
  await capture();await act(async()=>button('保存快捷键').click());expect(transport.filter(c=>c.command==='update_settings').map(c=>c.args)).toEqual([{settings:{...settings,hotkey:'Ctrl+Alt+KeyK'}}]);expect(transport.some(c=>c.command==='api_request'||c.command==='query_balance')).toBe(false);
 });

});
