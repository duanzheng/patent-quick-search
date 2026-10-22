import { describe,it,expect } from 'vitest';
import { inspectWindowsPayload } from '../scripts/verify-windows-artifacts.mjs';
function fixture(machine=0x8664,subsystem=2){const bytes=Buffer.alloc(0x80+24+240);bytes.writeUInt16LE(0x5a4d);bytes.writeUInt32LE(0x80,0x3c);bytes.writeUInt32LE(0x4550,0x80);bytes.writeUInt16LE(machine,0x84);bytes.writeUInt16LE(240,0x94);bytes.writeUInt16LE(2,0x96);bytes.writeUInt16LE(0x20b,0x98);bytes.writeUInt16LE(subsystem,0x98+68);return bytes;}
describe('Windows artifact header verifier with synthetic bytes, not a real installer',()=>{
  it('recognizes x64 GUI PE32+ headers',()=>{expect(inspectWindowsPayload(fixture())).toMatchObject({architecture:'x86_64',machine:0x8664,subsystem:2});});
  it.each([0x14c,0xaa64])('rejects other architecture 0x%s',machine=>{expect(()=>inspectWindowsPayload(fixture(machine))).toThrow('x86_64');});
  it('rejects non-PE/truncated/invalid-offset data',()=>{const broken=fixture();broken.writeUInt32LE(0xffffffff,0x3c);for(const bytes of [Buffer.alloc(0),Buffer.alloc(64),broken])expect(()=>inspectWindowsPayload(bytes)).toThrow();});
  it('rejects a console release payload while allowing explicit debug header inspection',()=>{expect(()=>inspectWindowsPayload(fixture(0x8664,3))).toThrow('GUI subsystem');expect(inspectWindowsPayload(fixture(0x8664,3),{expectGui:false}).subsystem).toBe(3);});
});
