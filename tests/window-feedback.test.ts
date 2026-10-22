import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Architectural regression: native hide routes must never require user acknowledgement.
// Native repeated-hide evidence is recorded separately; this does not claim OS execution.
const native = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
describe('quiet window transitions, source contract only', () => {
  it('contains no hide acknowledgement or native message dialog', () => {
    expect(native).not.toContain('窗口已收起');
    expect(native).not.toMatch(/\.dialog\(\)\s*\.message\(/);
    expect(native).not.toContain('hidden_notice');
  });
  it('keeps normal success silent while retaining actionable errors and consent', () => {
    for (const message of ['密钥已保存在本机', '已清除本地密钥', '快捷键已更新', '历史已清空', '已导出诊断记录']) expect(ui).not.toContain(message);
    expect(ui).not.toContain('className="toast"');
    for (const message of ['无法保存密钥', '无法清除本地密钥', '复制失败', '暂时无法收起窗口', '同意并搜索']) expect(ui).toContain(message);
  });
});
