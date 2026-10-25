'use strict';
const LABELS = ['New MLS Listing', 'MLS Backlog', 'Zip Code Blast'];
function history(row) {
  try { const value = JSON.parse(row.lead_source_history || '[]'); return Array.isArray(value) ? value.filter(x => LABELS.includes(x.source) && typeof x.evidence === 'string' && x.evidence) : []; }
  catch { return []; }
}
function evidenceFrom(row) {
  const found = history(row);
  for (const field of ['source_evidence_path', 'listing_price_source', 'notes', 'source_file']) {
    const text = String(row[field] || '');
    // These identify discovery workflows, not generic review statuses, pricing lookups or backlog membership.
    const rules = [
      ['Zip Code Blast', /(?:\/|\b)workspace-simply-dwell-campaigns\/(?:runs|state)\/[^\s|]+/g],
      ['New MLS Listing', /(?:data\/email-cortona\/sources\/[^\s|]+|workspace-simply-dwell-lead-generation\/runs\/\d{8}T\d{6}Z-email\/[^\s|]+)/g],
      ['MLS Backlog', /(?:workspace-simply-dwell-lead-generation-backlog\/(?:runs|state)\/[^\s|]+|state\/backlog-example-state\.json)/g],
    ];
    // Price references can be secondary corroboration, not discovery provenance.
    if (field === 'listing_price_source') continue;
    for (const [source, pattern] of rules) for (const match of text.matchAll(pattern)) found.push({source, evidence: `${field}: ${match[0]}`});
  }
  return found;
}
function keys(row) { return [row.property_id && `id:${row.property_id}`, row.mls_id && `mls:${row.mls_id}`, row.property_address && `address:${row.property_address.trim().toLowerCase()}`].filter(Boolean); }
function annotateProperties(properties, interactions = [], previous = []) {
  const index = new Map();
  for (const row of [...previous, ...interactions]) for (const key of keys(row)) {
    if (!index.has(key)) index.set(key, []);
    // Previous snapshots contribute saved provenance only; do not reinterpret stale raw fields.
    index.get(key).push(...(previous.includes(row) ? history(row) : evidenceFrom(row)));
  }
  return properties.map(row => {
    const entries = [...evidenceFrom(row), ...keys(row).flatMap(key => index.get(key) || [])];
    const unique = [...new Map(entries.map(entry => [`${entry.source}\0${entry.evidence}`,entry])).values()];
    const sources = LABELS.filter(label => unique.some(entry => entry.source === label));
    return {...row, lead_source: sources.join(' · ') || 'Source not recorded', lead_source_history: JSON.stringify(unique)};
  });
}
module.exports = {LABELS, annotateProperties, evidenceFrom};
