const test=require('node:test');
const assert=require('node:assert/strict');
const {journalEvent,buildProductionTelemetry,policy}=require('../email-production');
const now=Date.parse('2026-10-29T14:00:00Z');
const fixture=()=>({deliveryPolicy:policy.id,state:'sent-items-verified',address:'10 Example St',to:['agent@example.com'],message:{id:'verified-1',sentDateTime:'2026-10-29T13:00:00Z',from:{emailAddress:{address:policy.sender}},toRecipients:[{emailAddress:{address:'agent@example.com',name:'Example Agent'}}],ccRecipients:[],bccRecipients:[]}});
test('production starts at zero and never imports historical interaction rows',()=>{
 assert.equal(buildProductionTelemetry(null,Date.parse(policy.routingEffectiveAt)).metrics.sent,0);
 assert.deepEqual(buildProductionTelemetry({events:[{eventType:'sent',segment:'real'}]},now).events,[]);
});
test('only verified direct production recipients count, once per mailbox message',()=>{
 const event=journalEvent(fixture(),'journal.json',now);assert.ok(event);
 const out=buildProductionTelemetry({events:[event,event]},now);assert.equal(out.metrics.sent,1);assert.equal(out.events[0].segment,'real');assert.equal(out.coverage.opens,'unavailable');
});
test('rejects tests, unknown outcomes, old dates, invalid recipients and secondary recipients',()=>{
 const changes=[j=>delete j.deliveryPolicy,j=>j.state='uncertain',j=>j.message.sentDateTime='2026-10-28T20:00:00Z',j=>j.message.sentDateTime='2026-10-29T12:59:59Z',j=>j.message.sentDateTime='2026-10-30T13:00:00Z',j=>delete j.message.id,j=>j.to.push('other@example.com'),j=>j.message.toRecipients[0].emailAddress.address='other@example.com',j=>j.message.ccRecipients.push({emailAddress:{address:'copy@example.com'}}),j=>j.message.bccRecipients.push({emailAddress:{address:'copy@example.com'}}),j=>j.message.from.emailAddress.address='other@example.com',j=>{j.to=['zac@steadypace.ai'];j.message.toRecipients[0].emailAddress.address=j.to[0];}];
 for(const change of changes){const j=fixture();change(j);assert.equal(journalEvent(j,'x',now),null);}
});
test('cutover is 8PM Eastern and first delivery is next day 9AM Eastern',()=>{
 assert.equal(new Date(policy.routingEffectiveAt).toISOString(),'2026-10-29T00:00:00.000Z');
 assert.equal(new Date(policy.firstDirectSendAt).toISOString(),'2026-10-29T13:00:00.000Z');
 assert.equal(journalEvent(fixture(),'x',Date.parse(policy.routingEffectiveAt)),null);
});
test('tampered and legacy explicit telemetry cannot masquerade as production',()=>{
 const event=journalEvent(fixture(),'x',now);event.segment='test';assert.equal(buildProductionTelemetry({events:[event]},now).metrics.sent,0);
 event.segment='real';event.eventAt='2026-10-29T12:00:00Z';assert.equal(buildProductionTelemetry({events:[event]},now).metrics.sent,0);
});

test('journal source identity maps all three bots; unknown is explicit without guesses',()=>{
 const mapping={'cortona':'Backlog / Cortona','lead-generation':'Daily MLS Email','campaigns':'ZIP Campaign'};
 for(const [sourceBot,label] of Object.entries(mapping)) {
  const event=journalEvent({...fixture(),sourceBot},'source.json',now);
  assert.equal(event.bot,label);assert.equal(event.botId,sourceBot);
  assert.equal(buildProductionTelemetry({events:[event]},now).byBot.find(row=>row.botId===sourceBot).sent,1);
 }
 const guessed=journalEvent({...fixture(),bot:'cortona',campaign:'ZIP Campaign'},'unknown.json',now);
 assert.equal(guessed.bot,'Unknown');assert.equal(guessed.botProvenance,null);
 guessed.bot='Backlog / Cortona';guessed.botId='cortona';
 assert.equal(buildProductionTelemetry({events:[guessed]},now).events[0].bot,'Unknown');
 assert.equal(journalEvent({...fixture(),sourceBot:'unrecognized'},'unknown.json',now).bot,'Unknown');
});
test('per-bot totals include all deduplicated deliveries, including beyond the recent-200 table',()=>{
 const events=Array.from({length:205},(_,i)=>{const j=fixture();j.sourceBot=i%2?'cortona':'campaigns';j.message.id='id-'+i;return journalEvent(j,'j-'+i,now)});
 const out=buildProductionTelemetry({events:[...events,events[0]]},now);
 assert.equal(out.metrics.sent,205);assert.equal(out.events.length,200);
 assert.equal(out.byBot.reduce((sum,row)=>sum+row.sent,0),205);
 assert.equal(out.byBot.find(row=>row.botId==='lead-generation').sent,0);
 assert.equal(out.byBot.find(row=>row.botId==='unknown').sent,0);
});
