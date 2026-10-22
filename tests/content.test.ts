import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe,it,expect } from 'vitest';
import { ContentText } from '../src/ContentText';
describe('actual Fetch content renderer, offline security checks',()=>{
  it('renders hostile HTML, images, scripts and links as literal selectable text',()=>{
    const content='</pre><script>window.__TAURI_INTERNALS__.invoke("delete_key")</script><img src="https://tracker.invalid/a"><iframe src="file:///private"></iframe> [run](javascript:alert(1))';
    const html=renderToStaticMarkup(createElement(ContentText,{content,find:''}));
    expect(html).toContain('&lt;script&gt;');expect(html).toContain('&lt;img');expect(html).not.toMatch(/<(script|img|iframe|a)\b/);expect(html).toContain('javascript:alert(1)');
  });
  it('uses literal case-sensitive matching and escapes the highlighted query too',()=>{
    const html=renderToStaticMarkup(createElement(ContentText,{content:'a.* b.* a.*',find:'a.*'}));
    expect(html.match(/<mark>/g)).toHaveLength(2);expect(html).toContain('<mark>a.*</mark> b.* <mark>a.*</mark>');
    const escaped=renderToStaticMarkup(createElement(ContentText,{content:'<img> body',find:'<img>'}));expect(escaped).toContain('<mark>&lt;img&gt;</mark>');expect(escaped).not.toContain('<img>');
  });
});
