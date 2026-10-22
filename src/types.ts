export type Scope = 'mixed' | 'patents';
export type Status = 'searching'|'complete'|'partial'|'empty'|'failed'|'stopped'|'expired';
export interface Hit {
  id:string; originalUrl:string; canonicalKey:string; title:string; domain:string; publication?:string;
  snippet:string; summary:string; retrievedAt:number; matches:{url:string;queryIndex:number;rank:number}[];
}
export interface Run {
  schemaVersion:1; id:string; revision:number; query:string; scope:Scope; createdAt:number; deadlineAt:number;
  status:Status; cancelledAt?:number; hits:Hit[]; errors:string[]; searchDone:number; searchTotal:number;
  logicalSearch:number; attempts:number;
}
export interface Settings { schemaVersion:1; hotkey:string; historyEnabled:boolean; serviceNoticeAccepted:boolean; }
export interface Bootstrap { settings:Settings; configured:boolean; history:Run[]; hotkeyError?:string; credentialError?:string; }
export interface ApiError { kind:string; status?:number; retryAfter?:number; }
export interface BalanceInfo { currency:'CNY'|'USD'; total_balance:string; granted_balance:string; topped_up_balance:string; }
export interface Balance { credentialGeneration:number; requestId:number; fetchedAt:number; isAvailable:boolean; infos:BalanceInfo[]; }
export type Bridge = <T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
