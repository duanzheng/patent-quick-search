// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { Engine } from '../src/engine';
import type { Bootstrap, Bridge, Run } from '../src/types';
const boot:Bootstrap={configured:true,history:[],settings:{schemaVersion:1,hotkey:'Alt+Super+Space',historyEnabled:true,serviceNoticeAccepted:true}};
let root:Root,host:HTMLDivElement,engine:Engine,calls:{command:string,args?:Record<string,unknown>}[];
const makeRun=(id='public-dom-fixture',n=12):Run=>({schemaVersion:1,id,revision:1,query:'public query',scope:'mixed',createdAt:1,deadlineAt:60001,status:'complete',searchDone:2,searchTotal:2,logicalSearch:2,attempts:2,errors:[],hits:Array.from({length:n},(_,i)=>({id:`${id}-${i}`,originalUrl:`https://example.com/${i}#part`,canonicalKey:`${i}`,title:`Public title ${i}`,domain:'example.com',snippet:'Public returned snippet',summary:'',retrievedAt:1,matches:[]}))});
const el=<T extends HTMLElement=HTMLElement>(selector:string)=>host.querySelector<T>(selector)!;
const rows=()=>Array.from(host.querySelectorAll<HTMLElement>('.result-row'));
const selected=()=>rows().filter(row=>row.classList.contains('is-active')).map(row=>row.dataset.resultIndex);
async function click(node:HTMLElement){await act(async()=>{node.focus();node.click();});}
async function key(node:HTMLElement,value:string,options:KeyboardEventInit={}){await act(async()=>{node.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...options}));});}
async function frame(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,40));});}
describe('real React DOM selection and on-demand syntax help (isolated, no service)',()=>{
  beforeEach(async()=>{
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
    vi.spyOn(HTMLElement.prototype,'scrollIntoView').mockImplementation(()=>{});
    vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:10,height:10}] as unknown as DOMRectList);
    calls=[];const bridge:Bridge=async<T,>(command:string,args?:Record<string,unknown>)=>{calls.push({command,args});return undefined as T;};
    engine=new Engine(bridge);engine.restore(makeRun());host=document.createElement('div');document.body.append(host);root=createRoot(host);
    await act(async()=>{root.render(<App bridge={bridge} engine={engine} initialBoot={boot}/>);});
  });
  afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
  it('reproduces the keyboard→mouse→keyboard sequence with one shared highlight and no row-click open',async()=>{
    const input=el<HTMLTextAreaElement>('#query');input.focus();await key(input,'ArrowDown');expect(selected()).toEqual(['0']);
    await click(rows()[2].querySelector<HTMLElement>('.result-snippet')!);expect(selected()).toEqual(['2']);expect(document.activeElement).toBe(rows()[2]);
    await key(document.activeElement as HTMLElement,'ArrowDown');await frame();expect(selected()).toEqual(['3']);expect(document.activeElement).toBe(rows()[3]);
    await key(rows()[3],'ArrowUp');await frame();expect(selected()).toEqual(['2']);expect(calls.some(c=>c.command==='open_source'||c.command==='api_request')).toBe(false);
  });
  it('starts from a mouse selection, navigates from an inline action and opens only explicit actions once',async()=>{
    await click(rows()[1]);expect(selected()).toEqual(['1']);await key(rows()[1],'ArrowDown');await frame();expect(selected()).toEqual(['2']);
    await click(rows()[2].querySelector<HTMLElement>('.result-title')!);expect(calls.filter(c=>c.command==='open_source')).toHaveLength(1);
    await key(document.activeElement as HTMLElement,'ArrowDown');await frame();expect(selected()).toEqual(['3']);expect(calls.filter(c=>c.command==='open_source')).toHaveLength(1);
    await key(rows()[3],'Enter');expect(calls.filter(c=>c.command==='open_source')).toHaveLength(2);
  });
  it('crosses a reveal batch by keyboard and preserves selection as more results arrive',async()=>{
    expect(rows()).toHaveLength(5);await click(rows()[4]);await key(rows()[4],'ArrowDown');await frame();await frame();expect(rows()).toHaveLength(10);expect(selected()).toEqual(['5']);expect(document.activeElement).toBe(rows()[5]);
    await act(async()=>{engine.run!.hits.push(...makeRun('added',2).hits);engine.run!.revision++;engine.restore(engine.run!);});expect(selected()).toEqual(['5']);expect(rows()[5].scrollIntoView).toHaveBeenCalled();
  });
  it('does not let a pending reveal steal a newer mouse selection or a replacement query',async()=>{
    await click(rows()[4]);await key(rows()[4],'ArrowDown');await click(rows()[1]);await frame();expect(selected()).toEqual(['1']);expect(document.activeElement).toBe(rows()[1]);
    await click(rows()[9]);await key(rows()[9],'ArrowDown');await act(async()=>engine.restore(makeRun('replacement',2)));await frame();expect(rows()).toHaveLength(2);expect(selected()).toEqual([]);
  });
  it('closes help with Escape/outside click, returns input focus and traps keyboard focus',async()=>{
    await click(el('[aria-label="高级搜索语法"]'));expect(el('[role="dialog"]').textContent).toContain('不是专利优先权日');expect(el('[role="dialog"]').textContent).toContain('OR');
    const close=el('[aria-label="关闭面板"]');expect(document.activeElement).toBe(close);await key(close,'Tab');expect(document.activeElement).toBe(close);
    await key(close,'Escape');expect(host.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(el('#query'));
    await click(el('[aria-label="高级搜索语法"]'));await click(el('.syntax-overlay'));expect(host.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(el('#query'));
    expect(calls.some(c=>c.command==='api_request'||c.command==='query_balance'||c.command==='hide_window')).toBe(false);
  });
  it('restores selected-row focus after settings, but does not hijack form controls or text editing',async()=>{
    await click(rows()[2]);await click(el('[aria-label="设置"]'));await key(el('[aria-label="关闭面板"]'),'Escape');expect(document.activeElement).toBe(rows()[2]);await key(rows()[2],'ArrowDown');await frame();expect(selected()).toEqual(['3']);
    const scope=el<HTMLSelectElement>('select');scope.focus();await key(scope,'ArrowUp');expect(selected()).toEqual(['3']);
    const input=el<HTMLTextAreaElement>('#query');input.focus();await key(input,'ArrowLeft');await key(input,'ArrowUp',{shiftKey:true});expect(selected()).toEqual(['3']);
    await click(rows()[0]);await key(rows()[0],'ArrowUp');expect(selected()).toEqual([]);expect(document.activeElement).toBe(input);
  });
  it('copies from an inline button without opening a page, then continues result navigation',async()=>{
    const write=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{value:{writeText:write},configurable:true});
    await click(rows()[2].querySelector<HTMLElement>('[aria-label^="复制来源"]')!);expect(selected()).toEqual(['2']);expect(write).toHaveBeenCalledWith('Public title 2\nhttps://example.com/2#part');
    await key(document.activeElement as HTMLElement,'ArrowDown');await frame();expect(selected()).toEqual(['3']);expect(calls.some(c=>c.command==='open_source'||c.command==='api_request')).toBe(false);
  });
  it('preserves multiline caret editing, IME and modifier keys in the query',async()=>{
    const input=el<HTMLTextAreaElement>('#query');input.focus();
    await act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;setter.call(input,'first line\nsecond line');input.dispatchEvent(new Event('input',{bubbles:true}));});
    await key(input,'ArrowDown');expect(selected()).toEqual([]);
    await key(input,'ArrowDown',{isComposing:true});await key(input,'ArrowDown',{ctrlKey:true});expect(selected()).toEqual([]);
  });

});
