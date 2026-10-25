const test = require('node:test');
const assert = require('node:assert/strict');
const {annotateProperties} = require('../lead-sources');
test('specific workflow evidence maps to exact customer labels', () => {
 const rows = annotateProperties([
  {source_evidence_path:'/Users/zac/.openclaw/workspace-simply-dwell-campaigns/runs/abc/evidence.json'},
  {source_evidence_path:'/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/runs/20261025T012518Z-email/123-review.json'},
  {source_evidence_path:'state/backlog-example-state.json'},
 ]);
 assert.deepEqual(rows.map(x=>x.lead_source),['Zip Code Blast','New MLS Listing','MLS Backlog']);
});
test('generic statuses, MLS/price corroboration and unproven labels never imply source', () => {
 const [row] = annotateProperties([{mls_backlog_status:'reviewer_sent',listing_price_source:'/workspace-simply-dwell-lead-generation-backlog/state/export.csv',lead_source:'MLS Backlog'}]);
 assert.equal(row.lead_source,'Source not recorded');
});
test('history survives a source overwrite and multiple discovery workflows are retained', () => {
 const previous = annotateProperties([{property_id:'a',source_evidence_path:'state/backlog-example-state.json'}]);
 const rows = annotateProperties([{property_id:'a',source_evidence_path:'/workspace-simply-dwell-campaigns/runs/run/evidence.json'}],[],previous);
 assert.equal(rows[0].lead_source,'MLS Backlog · Zip Code Blast');
 const again = annotateProperties(rows,[],rows);
 assert.equal(again[0].lead_source_history,rows[0].lead_source_history);
});
test('only matching interaction provenance contributes', () => {
 const rows=annotateProperties([{property_id:'a'},{property_id:'b'}],[{property_id:'a',notes:'Source /workspace-simply-dwell-campaigns/runs/test/proof.json'}]);
 assert.equal(rows[0].lead_source,'Zip Code Blast');assert.equal(rows[1].lead_source,'Source not recorded');
});
