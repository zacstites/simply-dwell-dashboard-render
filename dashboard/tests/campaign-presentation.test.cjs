const test = require('node:test');
const assert = require('node:assert/strict');
const {outcome, campaignLabel} = require('../public/campaign-presentation.js');
test('held results remain explicitly unsent with multiple unresolved checks', () => {
  const display = outcome({status:'held',reason:'vacancy unverified; displayed DOM may be cumulative',agentEmail:''});
  assert.equal(display.label,'Needs verification');
  assert.match(display.explanation,/Verify days on market/);
  assert.match(display.explanation,/Confirm vacancy/);
  assert.match(display.explanation,/verified listing-agent email/);
});
test('a partial send marker never presents verified delivery', () => {
  assert.equal(outcome({status:'sent',emailSent:true}).label,'Delivery needs verification');
  assert.equal(outcome({status:'sent',sentItemsMessageId:'proof'}).label,'Delivery needs verification');
  assert.equal(outcome({status:'sent',emailSent:true,sentItemsMessageId:'proof'}).label,'Sent for review');
});
test('specific furnishing and ZIP blockers are not concealed', () => {
  assert.match(outcome({status:'held',agentEmail:'known',reason:'ZIP source conflict: A 31401 versus B 31402; gallery not visually reviewed'}).explanation,/Confirm property ZIP.*Complete property photo review/);
  assert.match(outcome({status:'held',agentEmail:'known',reason:'virtual versus physical furnishing remains unresolved'}).explanation,/real or virtual/);
  assert.equal(campaignLabel('blocked'),'Search paused');
  assert.equal(campaignLabel('queued'),'Waiting to continue');
});
