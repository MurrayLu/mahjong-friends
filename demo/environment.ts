import app from '../src/api/index';
import type { Env } from '../src/api/auth';
import { SQLiteDatabase } from './sqlite';
export const origin = 'http://localhost:8787';
export function environment() {
  const db = new SQLiteDatabase();
  // Deliberately no cloud client, OAuth secret, persistent account or remote database.
  const env = {
    DB: db, APP_ORIGIN: origin, DEV_AUTH: 'false',
    GROUP_REALTIME: { idFromName: (x: string) => x, get: () => ({fetch: async () => new Response('{}')}) },
    IMAGES: {put: async () => {throw new Error('ImagesDisabledInOfflineDemo')},getWithMetadata:async()=>({value:null}),delete:async()=>{}}
  } as unknown as Env;
  return {db, env, request: (path: string, method='GET', body?: unknown, cookie='', requestOrigin=origin) =>
    app.request(origin+path,{method,headers:{Origin:requestOrigin,Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)},env)};
}
export async function seed(f: ReturnType<typeof environment>) {
  const bootstrap = await f.request('/api/auth/anonymous','POST',{DisplayName:'合成玩家 A'});
  if(bootstrap.status!==200 && bootstrap.status!==201) throw new Error(await bootstrap.text());
  const cookie=bootstrap.headers.get('set-cookie')!.split(';')[0];
  const call=async(path:string,method='GET',body?:unknown)=>{
    const r=await f.request(path,method,body,cookie);
    if(!r.ok)throw new Error(`${r.status}: ${await r.text()}`);
    return r.json() as Promise<any>;
  };
  const group=await call('/api/groups','POST',{Name:'工程展示｜合成測試群組'});
  for(const DisplayName of ['合成玩家 B','合成玩家 C','合成玩家 D']) await call(`/api/groups/${group.Id}/players`,'POST',{DisplayName});
  const players=await call(`/api/groups/${group.Id}/players`);
  const session=await call(`/api/groups/${group.Id}/sessions`,'POST',{RecordDate:'2026-10-20',Name:'離線驗收牌局',RateMajor:50,RateMinor:20});
  const Results=players.map((p:any,i:number)=>({PlayerId:p.Id,NetAmount:[600,-100,-200,-300][i]}));
  return {cookie,group,players,session,Results,call};
}
