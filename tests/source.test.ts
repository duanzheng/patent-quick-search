import { describe, expect, it } from 'vitest';
import { openOriginalSource } from '../src/source';
import type { Bridge } from '../src/types';
describe('original source opening, synthetic bridge only',()=>{
  it('preserves query encoding, repeated parameters, case and fragment exactly',async()=>{const calls:unknown[]=[];const bridge:Bridge=async<T,>(command:string,args?:Record<string,unknown>)=>{calls.push({command,args});return undefined as T;};for(const url of ['HTTPS://Example.COM:443/a%20b?x=a%2Fb&x=2#part','https://example.com/paper.pdf#page=2'])await openOriginalSource(bridge,url);expect(calls).toEqual([{command:'open_source',args:{url:'HTTPS://Example.COM:443/a%20b?x=a%2Fb&x=2#part'}},{command:'open_source',args:{url:'https://example.com/paper.pdf#page=2'}}]);});
  it('rejects unsafe protocols, credentials and controls before the bridge',async()=>{let called=0;const bridge:Bridge=async<T,>()=>{called++;return undefined as T;};for(const url of ['javascript:alert(1)','file:///tmp/a','data:text/html,hello','https://u:p@example.com','\nhttps://example.com','https://example.com/\nfoo','https://'])await expect(openOriginalSource(bridge,url)).rejects.toThrow('invalid_source_url');expect(called).toBe(0);});
  it('propagates browser launch failures for an actionable UI error',async()=>{const bridge:Bridge=async()=>{throw new Error('launch failed');};await expect(openOriginalSource(bridge,'https://example.com')).rejects.toThrow('launch failed');});
});
