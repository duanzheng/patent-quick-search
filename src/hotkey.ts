export const defaultHotkey=(mac:boolean)=>mac?'Alt+Super+Space':'Ctrl+Alt+Space';
type Press=Pick<KeyboardEvent,'key'|'code'|'ctrlKey'|'altKey'|'shiftKey'|'metaKey'|'isComposing'|'repeat'|'keyCode'>&{getModifierState?:(name:string)=>boolean};
export type Capture={kind:'ignore'|'modifiers'}|{kind:'invalid';message:string}|{kind:'captured';value:string};
const modifierKeys=new Set(['Shift','Control','Alt','Meta','OS','AltGraph']);
const allowed=/^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/;
export function captureHotkey(event:Press):Capture {
  if(event.isComposing||event.keyCode===229||event.repeat||event.key==='Process'||(event.getModifierState?.('AltGraph')&&event.key.length===1&&event.key.charCodeAt(0)>127))return {kind:'ignore'};
  if(modifierKeys.has(event.key)||/^(?:Shift|Control|Alt|Meta)(?:Left|Right)$/.test(event.code))return {kind:'modifiers'};
  if(!event.ctrlKey&&!event.altKey&&!event.metaKey)return {kind:'invalid',message:'请同时按下 Command、Option 或 Control 等修饰键'};
  if(!allowed.test(event.code))return {kind:'invalid',message:'这个按键暂不支持，请选择字母、数字、空格或功能键'};
  return {kind:'captured',value:[event.ctrlKey&&'Ctrl',event.altKey&&'Alt',event.shiftKey&&'Shift',event.metaKey&&'Super',event.code].filter(Boolean).join('+')};
}
// Legacy accelerator spellings continue to display correctly without rewriting saved data.
export function hotkeyParts(value:string,mac:boolean):string[] {
  return value.split('+').filter(Boolean).map(part=>{
    const key=part.toLowerCase();
    if(['super','meta','cmd','command'].includes(key))return mac?'Command':'Windows';
    if(['ctrl','control'].includes(key))return 'Control';
    if(['alt','option'].includes(key))return mac?'Option':'Alt';
    if(['cmdorctrl','cmdorcontrol','commandorcontrol'].includes(key))return mac?'Command':'Control';
    if(key==='shift')return 'Shift';if(key==='space')return '空格';
    const names:Record<string,string>={arrowup:'↑',arrowdown:'↓',arrowleft:'←',arrowright:'→',enter:'Enter',escape:'Esc',backspace:mac?'Delete':'Backspace',delete:'Delete',minus:'−',equal:'=',bracketleft:'[',bracketright:']',backslash:'\\',semicolon:';',quote:"'",comma:',',period:'.',slash:'/',backquote:'`'};
    return names[key]??part.replace(/^(?:Key|Digit)/,'');
  });
}
export function formatHotkey(value:string,mac:boolean):string {
  const names=hotkeyParts(value,mac),symbols:Record<string,string>={Control:'⌃',Option:'⌥',Shift:'⇧',Command:'⌘'};
  return names.map(name=>mac?(symbols[name]??name):name==='Control'?'Ctrl':name).join(mac?' ':' + ');
}
export function hotkeyWarning(value:string,mac:boolean):string {
  if(!mac)return '';
  const parts=hotkeyParts(value,mac).sort().join('+');
  if(parts===['Command','Option','空格'].sort().join('+'))return '此组合也用于 Finder 搜索；如无响应，请录制其他组合。';
  if(parts===['Command','空格'].sort().join('+'))return '此组合用于系统聚焦搜索，建议选择其他组合。';
  return '';
}
