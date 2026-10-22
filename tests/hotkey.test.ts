import { describe,it,expect } from 'vitest';
import { captureHotkey,formatHotkey,hotkeyParts,hotkeyWarning,defaultHotkey } from '../src/hotkey';
const press=(props:Partial<KeyboardEvent>={})=>({key:'k',code:'KeyK',ctrlKey:true,altKey:true,metaKey:false,shiftKey:false,isComposing:false,repeat:false,keyCode:75,...props});
describe('shortcut capture and native platform labels',()=>{
  it('records physical chords and localized Mac labels without changing the default',()=>{
    expect(captureHotkey(press())).toEqual({kind:'captured',value:'Ctrl+Alt+KeyK'});expect(formatHotkey('Ctrl+Alt+KeyK',true)).toBe('⌃ ⌥ K');
    expect(captureHotkey(press({key:' ',code:'Space',ctrlKey:false,metaKey:true}))).toEqual({kind:'captured',value:'Alt+Super+Space'});
    expect(defaultHotkey(true)).toBe('Alt+Super+Space');expect(formatHotkey(defaultHotkey(true),true)).toBe('⌥ ⌘ 空格');expect(hotkeyParts(defaultHotkey(true),true)).toEqual(['Option','Command','空格']);
  });
  it('supports legacy aliases and readable Windows names',()=>{
    expect(formatHotkey('Option+Command+Space',true)).toBe('⌥ ⌘ 空格');expect(formatHotkey('Ctrl+Alt+Space',false)).toBe('Ctrl + Alt + 空格');expect(formatHotkey('CmdOrCtrl+KeyK',false)).toBe('Ctrl + K');expect(formatHotkey('Shift+Super+ArrowDown',true)).toBe('⇧ ⌘ ↓');
  });
  it('never commits modifier-only, repeats, IME or AltGraph text input',()=>{
    expect(captureHotkey(press({key:'Control',code:'ControlLeft'}))).toEqual({kind:'modifiers'});
    for(const v of [{repeat:true},{isComposing:true},{keyCode:229},{key:'Process'},{key:'€',getModifierState:(name:string)=>name==='AltGraph'}])expect(captureHotkey(press(v))).toEqual({kind:'ignore'});
  });
  it('requires modifiers and accepts physical navigation/punctuation/function keys',()=>{
    expect(captureHotkey(press({ctrlKey:false,altKey:false})).kind).toBe('invalid');expect(captureHotkey(press({code:'Escape'})).kind).toBe('invalid');
    for(const code of ['F12','ArrowUp','Quote','Space','Digit3'])expect(captureHotkey(press({code})).kind).toBe('captured');
  });
  it('explains Finder/Spotlight conflicts without choosing a different binding',()=>{
    expect(hotkeyWarning('Alt+Super+Space',true)).toContain('Finder');expect(hotkeyWarning('Super+Space',true)).toContain('聚焦');expect(hotkeyWarning('Ctrl+Alt+KeyK',true)).toBe('');expect(defaultHotkey(true)).toBe('Alt+Super+Space');
  });
});
