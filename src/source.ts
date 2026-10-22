import { safeUrl } from './domain';
import type { Bridge } from './types';
// Validate without serializing URL.href: preserve the first Search URL exactly.
export async function openOriginalSource(bridge:Bridge,url:string){
  if(!safeUrl(url))throw new Error('invalid_source_url');
  await bridge('open_source',{url});
}
