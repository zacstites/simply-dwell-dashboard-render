'use strict';
(function (root) {
  const campaignLabels = {queued: 'Bot Working', running: 'Bot Working', completed: 'Search complete', blocked: 'Search paused', cancelled: 'Cancelled'};
  function campaignLabel(status) { return campaignLabels[status] || 'Status unavailable'; }
  function campaignExplanation(status) {
    return ({queued: 'Your search will continue automatically. No action is needed from you. You can leave this page; your progress is saved.', running: 'Listings and contacts are being checked. Only qualifying leads are emailed.', completed: 'This search has finished. Only verified active listings matching your filters appear below.', blocked: 'A search-level issue needs attention before research can continue. Saved results and previously sent emails are retained.', cancelled: 'This search was cancelled. Saved results are retained.'})[status] || 'Refresh to check the current search status.';
  }
  function outcome(result) {
    if (result.emailSent === true && result.sentItemsMessageId) return {label: 'Sent for review', explanation: 'Reviewer email verified in Sent Items.'};
    if (result.status === 'sent' || result.emailSent === true || result.sentItemsMessageId) return {label: 'Delivery needs verification', explanation: 'The saved record does not contain complete delivery confirmation.'};
    if (result.status === 'excluded') return {label: 'Not eligible', explanation: result.reason || 'This property does not meet the search requirements.'};
    if (result.status !== 'held') return {label: 'Research recorded', explanation: 'Email eligibility has not yet been confirmed.'};
    const reason = result.reason || '';
    const checks = [];
    if (/ZIP.*conflict|conflict.*ZIP/i.test(reason)) checks.push('Confirm property ZIP with the listing source');
    if (/virtual versus physical|virtual.*physical.*unresolved|furnishing.*unresolved/i.test(reason)) checks.push('Confirm whether the pictured furniture is real or virtual');
    if (/status\/price\/DOM|current.*status.*unverified/i.test(reason)) checks.push('Find and verify the current active listing');
    else if (/DOM.*(?:not verified|unverified|cumulative)|days.on.market.*unverified/i.test(reason)) checks.push('Verify days on market');
    if (/vacancy unverified|occupancy.*unverified/i.test(reason)) checks.push('Confirm vacancy');
    if (/gallery not.*reviewed|gallery.*not yet.*reviewed/i.test(reason)) checks.push('Complete property photo review');
    if (!result.agentEmail && !(result.agent && result.agent.email)) checks.push('Find a verified listing-agent email');
    return {label: 'Research in progress', explanation: checks.length ? checks.join(' · ') : 'Additional listing evidence is needed before an email can be sent.'};
  }
  const api = {campaignLabel, campaignExplanation, outcome};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampaignPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
