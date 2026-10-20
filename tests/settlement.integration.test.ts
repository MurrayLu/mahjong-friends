import {test} from 'node:test';
import assert from 'node:assert/strict';
import {environment,seed,origin} from '../demo/environment';
test('HTTP → service → SQL: settlement updates leaderboard; invalid replacement cannot corrupt saved results',async t=>{
 const f=environment();t.after(()=>f.db.close());const s=await seed(f);
 const path=`/api/sessions/${s.session.Id}/settlement`;
 const good=await f.request(path,'PUT',{Results:s.Results},s.cookie);
 assert.equal(good.status,200,await good.clone().text());
 const saved=()=>f.db.raw.prepare('SELECT PlayerId,NetAmount FROM SessionResult WHERE SessionId=? ORDER BY PlayerId').all(s.session.Id);
 const before=saved();assert.equal(before.length,4);
 const leaderboard=await s.call(`/api/groups/${s.group.Id}/leaderboard?period=all`);
 assert.equal(leaderboard.length,4);assert.equal(leaderboard.reduce((n:number,x:any)=>n+x.NetAmount,0),0);
 const unbalanced=await f.request(path,'PUT',{Results:s.Results.map((r:any,i:number)=>({...r,NetAmount:r.NetAmount+(i===0?1:0)}))},s.cookie);
 assert.equal(unbalanced.status,400);assert.deepEqual(saved(),before);
 const duplicate=await f.request(path,'PUT',{Results:[s.Results[0],s.Results[0],s.Results[2],s.Results[3]]},s.cookie);
 assert.equal(duplicate.status,400);assert.deepEqual(saved(),before);
 const outsider=await f.request('/api/auth/anonymous','POST',{DisplayName:'合成外部使用者'});
 const strangerCookie=outsider.headers.get('set-cookie')!.split(';')[0];
 assert.equal((await f.request(path,'PUT',{Results:s.Results},strangerCookie)).status,403);
 const otherGroup=await (await f.request('/api/groups','POST',{Name:'另一個合成隔離群組'},strangerCookie)).json() as any;
 const otherPlayers=await (await f.request(`/api/groups/${otherGroup.Id}/players`,'GET',undefined,strangerCookie)).json() as any[];
 const crossGroup=s.Results.map((r:any,i:number)=>i===3?{...r,PlayerId:otherPlayers[0].Id}:r);
 const invalidGroup=await f.request(path,'PUT',{Results:crossGroup},s.cookie);
 assert.equal(invalidGroup.status,400);assert.match(await invalidGroup.text(),/CrossGroupPlayer/);
 assert.deepEqual(saved(),before);
 assert.equal((await f.request(path,'PUT',{Results:s.Results},s.cookie,'https://example.invalid')).status,403);
 assert.equal((await f.request(path,'PUT',{Results:s.Results})).status,401);
 assert.deepEqual(saved(),before);
});
test('SQL atomic batch rolls back all earlier writes when a later statement fails',async t=>{
 const f=environment();t.after(()=>f.db.close());
 const before=f.db.raw.prepare('SELECT COUNT(*) AS n FROM UserAccount').get();
 await assert.rejects(()=>f.db.batch([
  f.db.prepare("INSERT INTO UserAccount(Id,DisplayName,CreatedAt,UpdatedAt) VALUES ('synthetic-rollback','synthetic','2026-10-20','2026-10-20')"),
  f.db.prepare("INSERT INTO AuthSession(TokenHash,UserId,ExpiresAt) VALUES ('synthetic-token','missing-user','2027-01-01')")
 ]));
 assert.deepEqual(f.db.raw.prepare('SELECT COUNT(*) AS n FROM UserAccount').get(),before);
});
