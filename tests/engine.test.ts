import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Engine } from '../src/engine';
import type { Bridge } from '../src/types';
const batch=(n=10)=>({results:Array.from({length:n},(_,i)=>({url:`https://example.com/${i}`,title:`title ${i}`,snippet:'summary',summary:'long summary'}))});
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(handler:(a:Record<string,unknown>)=>Promise<unknown>){
  const calls:{command:string;args:Record<string,unknown>}[]=[];const bridge:Bridge=async<T>(command:string,args:Record<string,unknown>={})=>{calls.push({command,args:structuredClone(args)});return (command==='api_request'?await handler(args):undefined)as T;};
  return {engine:new Engine(bridge),calls,api:()=>calls.filter(c=>c.command==='api_request')};
}
describe('offline scheduler with synthetic transport, not real API acceptance',()=>{
  beforeEach(()=>{vi.useFakeTimers();});afterEach(()=>vi.useRealTimers());
  it('shows the fast batch while a second Search is pending and fetches only first 3',async()=>{let slowResolve!:(v:unknown)=>void;const slow=new Promise(resolve=>{slowResolve=resolve;});const f=fixture(async a=>{const p=a.payload as Record<string,unknown>;return a.operation==='fetch'?{title:'',content:'body'}:p.query===p.ori_question?slow:batch();});await f.engine.start('技术','mixed');await flush();expect(f.engine.run?.hits).toHaveLength(10);expect(f.engine.run?.searchDone).toBe(1);slowResolve(batch());await flush();expect(f.engine.run?.logicalFetch).toBe(3);expect(f.api().filter(c=>c.args.operation==='fetch')).toHaveLength(3);expect(f.engine.run?.hits).toHaveLength(10);f.engine.stop();});
  it('enforces combined concurrency, duplicate submission and 5 distinct fetches',async()=>{let active=0,peak=0;const releases:(()=>void)[]=[];const f=fixture(a=>new Promise(resolve=>{active++;peak=Math.max(peak,active);releases.push(()=>{active--;resolve(a.operation==='search'?batch():{title:'',content:'body'});});}));await f.engine.start('技术','mixed');await f.engine.start('技术','mixed');expect(f.api()).toHaveLength(2);for(let i=0;i<8;i++){releases.shift()?.();await flush();}expect(peak).toBeLessThanOrEqual(2);for(const h of f.engine.run!.hits)f.engine.fetch(h.id);expect(f.engine.run?.logicalFetch).toBe(5);for(let i=0;i<8;i++){releases.shift()?.();await flush();}expect(f.api().filter(c=>c.args.operation==='fetch')).toHaveLength(5);f.engine.stop();});
  it('ignores old responses after stop, replacement and history restore',async()=>{let done!:(v:unknown)=>void;const f=fixture(a=>a.operation==='search'?new Promise(r=>{done=r;}):Promise.resolve({title:'',content:'body'}));await f.engine.start('旧词','patents');f.engine.stop();done(batch());await flush();expect(f.engine.run?.hits).toHaveLength(0);expect(f.engine.run?.status).toBe('stopped');expect(f.api()).toHaveLength(1);await f.engine.start('新词','patents');expect(f.engine.run?.query).toBe('新词');f.engine.stop();});
  it('retries transient errors once, respecting Retry-After and the attempt budget',async()=>{let n=0;const f=fixture(async()=>{n++;throw{kind:'http',status:429,retryAfter:2};});await f.engine.start('技术','patents');await flush();expect(n).toBe(1);await vi.advanceTimersByTimeAsync(1999);expect(n).toBe(1);await vi.advanceTimersByTimeAsync(1);await flush();expect(n).toBe(2);expect(f.engine.run?.attempts).toBe(2);expect(f.engine.run?.status).toBe('failed');f.engine.stop();});
  it('does not retry beyond remaining deadline or retry permanent errors',async()=>{for(const e of [{kind:'http',status:429,retryAfter:50},{kind:'http',status:400},{kind:'http',status:403},{kind:'http',status:404}]){const f=fixture(async()=>{throw e;});await f.engine.start('技术','patents');await flush();expect(f.api()).toHaveLength(1);f.engine.stop();}});
  it('auth errors stop the queue and do not fabricate results',async()=>{const f=fixture(async()=>{throw{kind:'http',status:401};});await f.engine.start('技术','mixed');await flush();expect(f.engine.run?.status).toBe('stopped');expect(f.engine.run?.hits).toHaveLength(0);expect(f.engine.run?.errors.join()).toContain('密钥无效');f.engine.stop();});
  it('expires at 60s and blocks late results and manual fetch',async()=>{let done!:(v:unknown)=>void;const f=fixture(()=>new Promise(r=>{done=r;}));await f.engine.start('技术','mixed');await vi.advanceTimersByTimeAsync(60000);done(batch());await flush();expect(f.engine.run?.status).toBe('expired');expect(f.engine.run?.hits).toHaveLength(0);expect(f.api()).toHaveLength(2);});
  it('keeps successful empty searches distinct from failures, and rejects empty fetch body',async()=>{const f=fixture(async a=>a.operation==='search'?batch(0):{title:'',content:''});await f.engine.start('技术','mixed');await flush();expect(f.engine.run?.status).toBe('empty');f.engine.stop();const g=fixture(async a=>a.operation==='search'?batch(1):{title:'',content:' \n '});await g.engine.start('技术','mixed');await flush();expect(g.engine.run?.hits[0].fetchStatus).toBe('empty');expect(g.engine.run?.hits[0].content?.trim()).toBe('');g.engine.stop();});
});

describe('additional offline race and budget checks',()=>{
  beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
  it('caps all retries at fourteen attempts, including manual fetches',async()=>{const seen=new Map<string,number>();const f=fixture(async a=>{const p=a.payload as Record<string,unknown>;const id=String(p.query??p.url);const n=(seen.get(id)??0)+1;seen.set(id,n);if(n===1)throw{kind:'network'};return a.operation==='search'?batch():{title:'',content:'body'};});await f.engine.start('技术','mixed');await vi.advanceTimersByTimeAsync(4000);await flush();for(const h of f.engine.run!.hits)f.engine.fetch(h.id);await vi.advanceTimersByTimeAsync(3000);await flush();expect(f.engine.run?.attempts).toBe(14);expect(f.engine.run?.logicalSearch).toBe(2);expect(f.engine.run?.logicalFetch).toBe(5);expect(Math.max(...seen.values())).toBe(2);f.engine.stop();});
  it('starts a new run after completion and restores history without a new API call',async()=>{const f=fixture(async a=>a.operation==='search'?batch(0):{title:'',content:'body'});await f.engine.start('技术','mixed');await flush();const old=structuredClone(f.engine.run!);await f.engine.start('技术','mixed');await flush();expect(f.engine.run?.id).not.toBe(old.id);const count=f.api().length;f.engine.restore(old);await flush();expect(f.api()).toHaveLength(count);expect(f.engine.run?.id).toBe(old.id);f.engine.stop();});
  it('does not let changing a draft or showing results enqueue network work',async()=>{const f=fixture(async a=>a.operation==='search'?batch():{title:'',content:'body'});await f.engine.start('技术','mixed');await flush();const count=f.api().length;f.engine.action('query_edited');f.engine.action('source_copied');expect(f.api()).toHaveLength(count);f.engine.stop();});
});

describe('terminal history and manual reading status',()=>{
  beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
  it('preserves the terminal history status when starting another completed round',async()=>{const f=fixture(async()=>batch(0));await f.engine.start('旧任务','mixed');await flush();const id=f.engine.run!.id;await f.engine.start('新任务','mixed');await flush();const saves=f.calls.filter(c=>c.command==='save_run'&&(c.args.run as {id:string}).id===id);expect((saves.at(-1)!.args.run as {status:string}).status).toBe('empty');f.engine.stop();});
  it('marks manual fetch as reading before transport completes',async()=>{let resolve!:(v:unknown)=>void;let fetches=0;const f=fixture(async a=>a.operation==='search'?batch():++fetches<=3?{title:'',content:'body'}:new Promise(r=>{resolve=r;}));await f.engine.start('技术','mixed');await flush();expect(f.engine.run?.status).toBe('complete');f.engine.fetch(f.engine.run!.hits[3].id);expect(f.engine.run?.status).toBe('reading');resolve({title:'',content:'body'});await flush();expect(f.engine.run?.status).toBe('complete');f.engine.stop();});
});

describe('restored snapshots and additional failure races',()=>{
  beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
  it('restores an in-progress snapshot as stopped without reopening its network budget',async()=>{
    const f=fixture(async a=>a.operation==='search'?batch(4):new Promise(()=>{}));await f.engine.start('公开技术','mixed');await flush();
    const snapshot=structuredClone(f.engine.run!);expect(snapshot.hits.some(h=>h.fetchStatus==='loading')).toBe(true);
    const count=f.api().length;f.engine.restore(snapshot);f.engine.fetch(f.engine.run!.hits[3].id);await flush();
    expect(f.engine.run?.status).toBe('stopped');expect(f.engine.run?.hits.some(h=>['queued','loading'].includes(h.fetchStatus))).toBe(false);expect(f.api()).toHaveLength(count);f.engine.stop();
  });
  it('does not repeat a successful or failed Fetch when its card is clicked repeatedly',async()=>{
    const f=fixture(async a=>{if(a.operation==='search')return batch(4);throw{kind:'http',status:403};});await f.engine.start('公开技术','mixed');await flush();
    const failed=f.engine.run!.hits[0];expect(failed.fetchStatus).toBe('failed');const count=f.api().length;for(let i=0;i<10;i++)f.engine.fetch(failed.id);await flush();expect(f.api()).toHaveLength(count);f.engine.stop();
  });
  it('retains returned content after stop and ignores a delayed Fetch completion',async()=>{
    let finish!:(v:unknown)=>void;let count=0;const f=fixture(async a=>a.operation==='search'?batch(4):++count===1?{title:'',content:'real fixture body'}:new Promise(r=>{finish=r;}));
    await f.engine.start('公开技术','mixed');await flush();const before=f.engine.run!.hits[0].content;f.engine.stop();finish({title:'',content:'late fixture body'});await flush();
    expect(f.engine.run?.hits[0].content).toBe(before);expect(f.engine.run?.hits.filter(h=>h.content==='late fixture body')).toHaveLength(0);expect(f.engine.run?.hits.some(h=>h.fetchStatus==='cancelled')).toBe(true);
  });
  it('distinguishes a partial Search failure from an empty successful round',async()=>{
    const f=fixture(async a=>{const p=a.payload as Record<string,unknown>;if(a.operation==='fetch')return{title:'',content:'body'};if(p.query===p.ori_question)throw{kind:'http',status:403};return batch(1);});
    await f.engine.start('公开技术','mixed');await flush();expect(f.engine.run?.status).toBe('partial');expect(f.engine.run?.hits).toHaveLength(1);f.engine.stop();
  });
  it('stops both search and fetch scheduling on 402 and does not query balance automatically',async()=>{
    const f=fixture(async()=>{throw{kind:'http',status:402};});await f.engine.start('公开技术','mixed');await flush();expect(f.engine.run?.status).toBe('stopped');expect(f.engine.run?.errors.join()).toContain('账户余额不足');expect(f.calls.some(c=>c.command==='query_balance')).toBe(false);
  });
});


describe('Search to Fetch contract audit with synthetic responses only',()=>{
  beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
  it('passes the first original Search URL unchanged to automatic and manual Fetch',async()=>{
    const urls=['https://patents.google.com/patent/JPH07314219A/en?ref=a%2Fb#2','https://patents.google.com/patent/JPH07314219A/ja','https://example.com/patent%20copy.pdf#page=2','https://example.com/article?q=%E5%A4%B9%E7%88%AA&x=a%2Fb#part','https://example.com/manual?x=1&x=2'];
    const results=urls.map(url=>({url,title:'public fixture',snippet:'search summary only',summary:'long search summary only'}));
    const f=fixture(async a=>a.operation==='search'?{results}:{title:'fetched fixture',content:'fixture body'});
    await f.engine.start('公开技术','mixed');await flush();expect(f.engine.run?.hits).toHaveLength(4);
    expect(f.engine.run?.hits[0].matches.some(m=>m.url===urls[1])).toBe(true);
    const manual=f.engine.run!.hits[3];f.engine.fetch(manual.id);await flush();
    const fetched=f.api().filter(c=>c.args.operation==='fetch');
    expect(fetched.map(c=>c.args.payload)).toEqual([urls[0],urls[2],urls[3],urls[4]].map(url=>({url})));
    expect(fetched.every(c=>c.args.attemptIndex===0)).toBe(true);expect(f.engine.run?.logicalFetch).toBe(4);f.engine.stop();
  });
  it('uses only Fetch content for a successful body and preserves the returned Markdown',async()=>{
    const content='# Public fixture\n\nFirst fetched paragraph.\n\n<script>literal text</script>';
    const f=fixture(async a=>a.operation==='search'?batch(1):{title:'Fetched title',content});
    await f.engine.start('公开技术','mixed');await flush();const h=f.engine.run!.hits[0];
    expect(h.fetchStatus).toBe('available');expect(h.content).toBe(content);expect(h.preview).toBe('# Public fixture');
    expect(h.preview).not.toContain(h.snippet);expect(h.fetchedAt).toBeTypeOf('number');
    const count=f.api().length;f.engine.fetch(h.id);await flush();expect(f.api()).toHaveLength(count);
    const saved=f.calls.filter(c=>c.command==='save_run').at(-1)?.args.run as {hits:{content?:string}[]};expect(saved.hits[0].content).toBe(content);f.engine.stop();
  });
  it('keeps Search summaries after Fetch 404, without retrying or inventing a body',async()=>{
    const f=fixture(async a=>{if(a.operation==='search')return batch(1);throw{kind:'http',status:404};});
    await f.engine.start('公开技术','mixed');await flush();await vi.advanceTimersByTimeAsync(2000);
    const h=f.engine.run!.hits[0];expect(h.snippet).toBe('summary');expect(h.fetchStatus).toBe('failed');expect(h.content).toBeUndefined();expect(h.preview).toBeUndefined();
    expect(f.engine.run?.status).toBe('partial');expect(f.api().filter(c=>c.args.operation==='fetch')).toHaveLength(1);
    f.engine.fetch(h.id);await flush();expect(f.api().filter(c=>c.args.operation==='fetch')).toHaveLength(1);f.engine.stop();
  });
});
