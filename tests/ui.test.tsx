import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App, escapeDestination } from '../src/App';
import { Engine } from '../src/engine';
import type { Bootstrap, Bridge, Run } from '../src/types';
const bridge:Bridge=async()=>{throw new Error('No services in render tests');};
const boot:Bootstrap={configured:false,history:[],settings:{schemaVersion:1,hotkey:'Alt+Super+Space',historyEnabled:true,serviceNoticeAccepted:false}};
const render=(props:Partial<Parameters<typeof App>[0]>={})=>renderToStaticMarkup(<App bridge={bridge} engine={new Engine(bridge)} initialBoot={boot} {...props}/>);
describe('compact search panel, render checks only',()=>{
  it('starts with a single search entry and useful keyboard hints, without engineering copy',()=>{
    const html=render();expect(html).toContain('搜索技术点、关键词或公开号');expect(html).toContain('试试：');expect(html).toContain('<kbd>esc</kbd>');
    for(const text of ['逻辑 Search','逻辑 Fetch','网络尝试','14 次','60 秒','PUBLIC TECH SEARCH','本轮请求与费用'])expect(html).not.toContain(text);
    expect(html).not.toContain('<h1');
  });
  it('explains the local credential lifetime and does not expose a configured value',()=>{
    const html=render({initialPanel:'settings',initialBoot:{...boot,configured:true}});
    expect(html).toContain('已配置');expect(html).toContain('重启后自动连接');expect(html).toContain('明文保存在');expect(html).toContain('清除密钥');
    expect(html).not.toContain('Keychain');expect(html).not.toContain('Credential Manager');expect(html).not.toContain('value="synthetic');
    expect(html).not.toContain('balance-total');
  });
  it('keeps credential entry masked and balance unavailable without a session',()=>{
    const html=render({initialPanel:'settings'});expect(html).toContain('type="password"');expect(html).toContain('保存密钥');expect(html).toMatch(/button disabled="">查看余额/);
  });
  it('renders loading, empty and error as different user-facing states',()=>{
    const engine=new Engine(bridge);const run:Run={schemaVersion:1,id:'render-fixture',revision:1,query:'公开技术',scope:'mixed',createdAt:1,deadlineAt:60001,status:'searching',hits:[],errors:[],searchDone:0,searchTotal:2,logicalSearch:2,attempts:0};engine.run=run;
    expect(render({engine})).toContain('找到的资料会陆续显示');run.status='empty';expect(render({engine})).toContain('试试缩短描述');run.status='failed';run.errors=['请检查网络后重试。'];const html=render({engine});expect(html).toContain('请检查网络后重试');expect(html).not.toContain('试试缩短描述');
  });
  it('keeps one lightweight settings entry on the home toolbar',()=>{
    const html=render();const header=html.match(/<header[^>]*>[\s\S]*?<\/header>/)?.[0]??'';
    expect((header.match(/<button/g)??[]).length).toBe(1);
    expect(header).toContain('aria-label="设置"');expect(header).toContain('aria-haspopup="dialog"');
    expect(header).not.toContain('搜索历史');expect(header).not.toContain('收起窗口');
    expect(html).toContain('aria-label="检索范围"');expect(html).toContain('aria-label="搜索"');
  });
  it('puts history and local management inside settings without losing their controls',()=>{
    const html=render({initialPanel:'settings'});const dialog=html.slice(html.indexOf('id="settings-panel"'));
    for(const text of ['aria-label="搜索历史"','账户余额','全局快捷键','清空历史','导出诊断记录'])expect(dialog).toContain(text);
    expect(html).toContain('aria-expanded="true"');expect(html).toContain('<kbd>esc</kbd> 返回搜索');
  });
  it('provides a settings parent and a close control for history',()=>{
    const html=render({initialPanel:'history'});
    expect(html).toContain('aria-label="返回设置"');expect(html).toContain('aria-label="关闭面板"');
    expect(html).toContain('还没有搜索历史');expect(html).toContain('<kbd>esc</kbd> 返回设置');
  });
  it('returns through the current context before hiding the search window',()=>{
    expect(escapeDestination('settings',true)).toBe('balance');
    expect(escapeDestination('history',false)).toBe('settings');
    expect(escapeDestination('settings',false)).toBe('search');
    expect(escapeDestination('notice',false)).toBe('search');
    expect(escapeDestination(null,false)).toBe('hide');
  });
  it('shows Search summaries and external-source actions without any built-in body UI',()=>{
    const engine=new Engine(bridge);const legacy={schemaVersion:1,id:'legacy-ui',revision:1,query:'公开技术',scope:'mixed',createdAt:1,deadlineAt:60001,status:'reading',searchDone:2,searchTotal:2,logicalSearch:2,logicalFetch:3,attempts:2,errors:['正文不可用'],hits:[{id:'public-hit',originalUrl:'https://example.com/a?x=a%2Fb#part',canonicalKey:'public-hit',title:'公开结果标题',domain:'example.com',snippet:'搜索返回的摘要',summary:'服务返回的较长摘要',matches:[],retrievedAt:1,content:'不应展示的旧正文',preview:'不应展示的旧预览',fetchStatus:'failed',error:'抓取失败'}]} as unknown as Run;
    engine.restore(legacy);const html=render({engine});expect(html).toContain('公开结果标题');expect(html).toContain('搜索返回的摘要');expect(html).toContain('打开原网页');
    for(const text of ['查看原文','获取正文','正文不可用','抓取失败','不应展示的旧正文','不应展示的旧预览','正文查找'])expect(html).not.toContain(text);
  });
  it('renders malicious Search text literally without images or executable markup',()=>{
    const engine=new Engine(bridge);engine.run={schemaVersion:1,id:'safe-text',revision:1,query:'公开主题',scope:'mixed',createdAt:1,deadlineAt:60001,status:'complete',hits:[{id:'safe-hit',originalUrl:'https://example.com',canonicalKey:'safe-hit',domain:'example.com',title:'<script>literal</script>',snippet:'<img src="https://example.com/track" onerror="evil()">',summary:'',retrievedAt:1,matches:[]}],errors:[],searchDone:2,searchTotal:2,logicalSearch:2,attempts:2};
    const html=render({engine});expect(html).toContain('&lt;script&gt;literal&lt;/script&gt;');expect(html).toContain('&lt;img');expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).not.toContain('onerror="evil()"');
  });
});
