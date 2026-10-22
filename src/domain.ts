import type { Hit, Scope } from './types';
export const SEARCH_RESULT_LIMIT=50;
export const normalize = (s:string) => s.replace(/\r\n|[\r\n\u2028\u2029]/gu,' ').trim();
export function validateInput(s:string):string {
  const q=normalize(s);
  if (!q) return '请输入一个技术点或公开号';
  if ([...q].length>100) return '最多输入 100 个字符，请缩短描述';
  return '';
}
// Only inspect operators outside quoted literals; never rewrite the user's syntax.
export function hasExplicitSite(query:string):boolean {
  let quoted=false,escaped=false,outside='';
  for(const char of query){
    if(escaped){outside+=quoted?'x':char;escaped=false;continue;}
    if(char==='\\'){escaped=true;outside+=quoted?'x':char;continue;}
    if(char==='"'){quoted=!quoted;outside+='x';continue;}
    outside+=quoted?'x':char;
  }
  return /(?:^|[\s(])-?site:/iu.test(outside);
}
export function resultScope(query:string,scope:Scope):Scope {
  return hasExplicitSite(query)?'mixed':scope;
}
export function plan(q:string,scope:Scope):string[] {
  q=normalize(q);
  if(validateInput(q)) throw new Error('invalid_input');
  const p=hasExplicitSite(q)?[q]:[`${q} site:patents.google.com`,...(scope==='mixed'?[q]:[])];
  if(p.some(s=>[...s].length>128)) throw new Error('invalid_plan');
  return p;
}
export function safeUrl(s:string):URL|undefined {
  try { if(s.trim()!==s||[...s].some(c=>c.codePointAt(0)!<32||c.codePointAt(0)===127))return undefined; const u=new URL(s); return [...s].length<=8192 && ['https:','http:'].includes(u.protocol)&&u.hostname&&!u.username&&!u.password ? u:undefined; } catch { return undefined; }
}
export function identity(raw:string) {
  const u=safeUrl(raw); if(!u) return undefined;
  const publication=u.hostname==='patents.google.com'?u.pathname.match(/^\/patent\/((?:JP[SHTR]|[A-Z]{2})\d+[A-Z]\d?)(?:\/[a-zA-Z-]+)?\/?$/)?.[1]:undefined;
  u.hash='';
  return {domain:u.hostname,publication,key:publication?`patent:${publication}`:u.href};
}
export function parseHits(raw:unknown,scope:Scope,queryIndex:number):{hits:Hit[];invalid:number} {
  if(!raw||typeof raw!=='object'||!('results'in raw)||!Array.isArray(raw.results)) throw new Error('protocol');
  let invalid=0;
  const hits:Hit[]=[];
  raw.results.slice(0,SEARCH_RESULT_LIMIT).forEach((r:unknown,rank:number)=>{
    if(!r||typeof r!=='object') {invalid++;return;}
    const v=r as Record<string,unknown>;
    if(typeof v.url!=='string'||typeof v.title!=='string'||typeof v.snippet!=='string'||typeof v.summary!=='string') {invalid++;return;}
    const id=identity(v.url); if(!id) {invalid++;return;}
    if(scope==='patents'&&!id.publication) return;
    hits.push({id:crypto.randomUUID(),originalUrl:v.url,canonicalKey:id.key,title:v.title||`${id.domain} · ${v.url}`,domain:id.domain,publication:id.publication,snippet:v.snippet,summary:v.summary,retrievedAt:Date.now(),matches:[{url:v.url,queryIndex,rank}]});
  });
  return {hits,invalid};
}
export function mergeHits(existing:Hit[],incoming:Hit[]) {
  for(const h of incoming) {const old=existing.find(x=>x.canonicalKey===h.canonicalKey); if(old) old.matches.push(...h.matches);else existing.push(h);}
}
export function message(e:{kind:string;status?:number}) {
  if(e.status===401) return '检索服务密钥无效，请在设置中更新';
  if(e.status===402) return 'DeepSeek 账户余额不足，可查看账户余额';
  if(e.status===400) return '检索请求不合规，请修改后重新搜索';
  if(e.status===403) return '服务拒绝访问此资料，可尝试打开来源';
  if(e.status===404) return '检索服务未找到结果，请修改后重新搜索';
  if(e.status===408) return '请求超时，请稍后重新搜索';
  if(e.status===429) return '检索服务繁忙，请稍后重新搜索';
  if((e.status??0)>=500) return '检索服务暂时异常，请稍后重新搜索';
  if(e.kind==='network') return '网络连接失败或超时，已保留返回的结果';
  if(e.kind==='protocol') return '服务返回的内容无法读取，请重试或打开来源';
  if(e.kind==='too_large') return '搜索响应过大，请缩小检索范围后重试';
  if(e.kind==='cancelled') return '搜索已停止';
  return '暂时无法完成请求，已保留返回的结果';
}
