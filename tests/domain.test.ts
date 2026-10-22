import { describe,it,expect } from 'vitest';
import { normalize,validateInput,plan,safeUrl,identity,parseHits,mergeHits,message,hasExplicitSite,resultScope } from '../src/domain';
const hit=(url:string)=>({url,title:'公开资料',snippet:'检索摘要',summary:'长摘要'});
describe('offline product contracts',()=>{
  it('normalizes line endings and counts Unicode code points without truncation',()=>{expect(normalize(' 夹爪\r\n弹簧 ')).toBe('夹爪 弹簧');expect(validateInput('😀'.repeat(100))).toBe('');expect(validateInput('😀'.repeat(101))).toContain('100');expect(validateInput(' \n ')).toContain('请输入');});
  it('passes every documented advanced operator unchanged, including quoted literals',()=>{
    for(const q of ['site:github.com','技术 -site:abc','a lang:zh,en','before:2000','after:2020-01-01','"弹性夹爪" -塑料 -"release notes"','夹爪 site:github.com OR site:wikipedia.org','"lang:zh"'])expect(validateInput(q)).toBe('');
  });
  it('lets explicit sites override automatic scope without recognizing quoted literal operators',()=>{
    for(const q of ['夹爪 site:github.com OR site:wikipedia.org','夹爪 -site:patents.google.com','site:github.com','x SITE:github.com']){
      expect(hasExplicitSite(q)).toBe(true);expect(plan(q,'patents')).toEqual([q]);expect(plan(q,'mixed')).toEqual([q]);expect(resultScope(q,'patents')).toBe('mixed');
    }
    for(const q of ['"site:github.com"','夹爪 -"site:github.com release"','website:demo','parasite:yes','"abc"site:x'])expect(hasExplicitSite(q)).toBe(false);
    expect(plan('夹爪 lang:zh after:2025','patents')).toEqual(['夹爪 lang:zh after:2025 site:patents.google.com']);
    expect(()=>plan('😀'.repeat(101),'mixed')).toThrow('invalid_input');
    expect(plan(' 夹爪\n-site:example.com ','patents')).toEqual(['夹爪 -site:example.com']);
  });
  it('builds only the approved query plan',()=>{expect(plan('弹性夹爪','mixed')).toEqual(['弹性夹爪 site:patents.google.com','弹性夹爪']);expect(plan('夹爪','patents')).toHaveLength(1);expect([...plan('😀'.repeat(100),'patents')[0]].length).toBeLessThanOrEqual(128);});
  it('rejects executable URLs and credentials while preserving legitimate query parameters',()=>{for(const s of ['javascript:alert(1)','file:///tmp/a','https://u:p@example.com','https://'])expect(safeUrl(s)).toBeUndefined();expect(identity('HTTPS://Example.COM:443/a?q=1#frag')?.key).toBe('https://example.com/a?q=1');expect(identity('https://example.com/a?q=2')?.key).not.toBe(identity('https://example.com/a?q=1')?.key);});
  it('merges language versions, preserves kinds and original order and match provenance',()=>{const a=parseHits({results:[hit('https://patents.google.com/patent/CN123456A1/zh'),hit('https://example.com/a')]},'mixed',0).hits;const b=parseHits({results:[hit('https://patents.google.com/patent/CN123456A1/en'),hit('https://patents.google.com/patent/CN123456B2/en')]},'mixed',1).hits;mergeHits(a,b);expect(a).toHaveLength(3);expect(a[0].matches).toHaveLength(2);expect(a[1].domain).toBe('example.com');expect(a[2].publication).toBe('CN123456B2');});
  it('isolates malformed items and filters patent lists without forging empty responses',()=>{expect(parseHits({results:[hit('javascript:evil'),{},hit('https://example.com')]},'mixed',0).invalid).toBe(2);expect(parseHits({results:[hit('https://patents.google.com/'),hit('https://patents.google.com/patent/CN123A/en')]},'patents',0).hits).toHaveLength(1);expect(()=>parseHits({error:'bad'},'mixed',0)).toThrow('protocol');});
  it('recognizes Japanese era publication URLs without accepting arbitrary document paths',()=>{const a=parseHits({results:[hit('https://patents.google.com/patent/JPH07314219A/en#2'),hit('https://patents.google.com/patent/JPH07314219A/ja'),hit('https://patents.google.com/patent/JPH07314219B2/ja'),hit('https://patents.google.com/patent/not-a-publication'),hit('https://patents.google.com/search?q=clamp')]},'patents',0).hits;const merged:typeof a=[];mergeHits(merged,a);expect(merged.map(h=>h.publication)).toEqual(['JPH07314219A','JPH07314219B2']);expect(merged[0].matches).toHaveLength(2);expect(merged[0].originalUrl).toContain('#2');for(const era of ['S','H','T','R'])expect(identity(`https://patents.google.com/patent/JP${era}123456A/ja`)?.publication).toBe(`JP${era}123456A`);});
  it('distinguishes HTTP failures without exposing response bodies',()=>{expect(message({kind:'http',status:404})).toContain('未找到结果');expect(message({kind:'http',status:403})).toContain('拒绝访问');expect(message({kind:'http',status:400})).toContain('修改');expect(message({kind:'http',status:408})).toContain('超时');expect(message({kind:'http',status:503})).toContain('暂时异常');expect(message({kind:'network'})).toContain('网络连接失败或超时');});
  it('accepts at most fifty candidates from a single response',()=>{const results=Array.from({length:70},(_,i)=>hit(`https://example.com/${i}`));expect(parseHits({results},'mixed',0).hits).toHaveLength(50);});
});
