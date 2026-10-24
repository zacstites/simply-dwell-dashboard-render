'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('campaignForm');
  const state = { selectedId: null, selected: null, loading: false, detailVersion: 0 };
  const active = (status) => ['queued', 'running'].includes(status);
  const money = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value)) : 'Not verified';
  const date = (value) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : 'Date unavailable';
  function element(tag, value, className) {
    const node = document.createElement(tag);
    if (value !== undefined && value !== null) node.textContent = String(value);
    if (className) node.className = className;
    return node;
  }
  function status(text, error = false) {
    $('formStatus').textContent = text;
    $('formStatus').classList.toggle('error', error);
  }
  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${response.status}). Please try again.`);
    if (!data) throw new Error('The server returned an unreadable response. Please refresh.');
    return data;
  }
  function filtersText(filters = {}) {
    return `${filters.zip || 'ZIP unavailable'} · ${money(filters.minPrice)}–${money(filters.maxPrice)} · ${filters.minDays ?? '—'}–${filters.maxDays ?? '—'} days`;
  }
  function renderHistory(campaigns) {
    const list = $('campaignHistory');
    list.replaceChildren();
    $('historyStatus').textContent = `${campaigns.length} ${campaigns.length === 1 ? 'search' : 'searches'}`;
    if (!campaigns.length) list.append(element('p', 'No searches yet. Choose your market above to begin.', 'muted'));
    for (const campaign of campaigns) {
      const row = element('article', null, `campaign-row${state.selectedId === campaign.id ? ' selected' : ''}`);
      const info = element('div');
      info.append(element('strong', filtersText(campaign.filters)), element('small', date(campaign.createdAt)));
      const actions = element('div', null, 'actions');
      const knownStatus = ['queued', 'running', 'completed', 'blocked', 'cancelled'].includes(campaign.status) ? campaign.status : 'unknown';
      actions.append(element('span', knownStatus, `campaign-badge ${knownStatus}`));
      const button = element('button', 'View results');
      button.type = 'button';
      button.setAttribute('aria-label', `View results for ${filtersText(campaign.filters)}`);
      button.addEventListener('click', () => select(campaign.id).catch((error) => status(error.message, true)));
      actions.append(button);
      row.append(info, actions);
      list.append(row);
    }
  }
  function renderDetail(campaign) {
    state.selected = campaign;
    $('campaignDetail').hidden = false;
    $('detailTitle').textContent = `Results · ${campaign.filters?.zip || 'Search'}`;
    $('detailStatus').textContent = `${campaign.status || 'Unknown'} · ${filtersText(campaign.filters)}`;
    $('cancelCampaign').hidden = !active(campaign.status);
    const results = Array.isArray(campaign.results) ? campaign.results : [];
    const summary = campaign.summary;
    const counts = summary && typeof summary === 'object' ? summary : {};
    const discovered = counts.discovered ?? campaign.discoveredCount ?? results.length;
    const sends = counts.sent ?? campaign.sentCount ?? results.filter((result) => result.emailSent === true || result.sentItemsMessageId).length;
    $('campaignSummary').replaceChildren(element('strong', `${discovered} properties discovered`), element('strong', `${sends} reviewer emails sent`));
    const message = typeof summary === 'string' ? summary : summary?.message;
    if (message) $('campaignSummary').append(element('p', message));
    const rows = $('campaignResults');
    rows.replaceChildren();
    if (!results.length) {
      const row = element('tr');
      const cell = element('td', active(campaign.status) ? 'Research is pending or underway. Results will appear here as they are saved.' : 'No properties recorded for this search.');
      cell.colSpan = 5;
      row.append(cell);
      rows.append(row);
    }
    for (const result of results) {
      const row = element('tr');
      const property = element('td');
      property.append(element('strong', result.address || 'Address not yet verified'));
      if (result.mls) property.append(element('small', `MLS ${result.mls}`));
      if (result.listingUrl) {
        try {
          const url = new URL(result.listingUrl);
          if (['https:', 'http:'].includes(url.protocol)) {
            const link = element('a', 'View listing');
            link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
            property.append(element('br'), link);
          }
        } catch { /* Invalid source links are not rendered. */ }
      }
      const detail = element('td', money(result.price));
      detail.append(element('small', result.daysOnMarket !== undefined && result.daysOnMarket !== null ? `${result.daysOnMarket} days on market` : 'Days on market not verified'));
      const agent = result.agent && typeof result.agent === 'object' ? result.agent : {};
      const agentCell = element('td', result.agentName || agent.name || 'Not yet found');
      const contact = element('td');
      contact.append(element('div', result.agentEmail || agent.email || 'Email not yet found'), element('small', result.agentPhone || agent.phone || 'Phone not yet found'));
      const outcome = element('td', result.status || 'Researching');
      if (result.reason) outcome.append(element('small', result.reason));
      row.append(property, detail, agentCell, contact, outcome);
      rows.append(row);
    }
  }
  async function select(id) {
    state.selectedId = id;
    const version = ++state.detailVersion;
    const data = await request(`/api/campaigns/${encodeURIComponent(id)}`);
    if (version !== state.detailVersion) return;
    renderDetail(data.campaign || data);
  }
  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    $('refresh').disabled = true;
    try {
      const data = await request('/api/campaigns');
      const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
      if (!state.selectedId && campaigns.length) state.selectedId = campaigns[0].id;
      renderHistory(campaigns);
      if (state.selectedId) await select(state.selectedId);
      $('updatedAt').textContent = `Updated ${new Date().toLocaleTimeString()}`;
      $('historyStatus').classList.remove('error');
    } catch (error) {
      $('historyStatus').textContent = `Could not refresh: ${error.message}`;
      $('historyStatus').classList.add('error');
    } finally {
      state.loading = false;
      $('refresh').disabled = false;
    }
  }
  form.addEventListener('input', () => {
    form.elements.maxPrice.setCustomValidity('');
    form.elements.maxDays.setCustomValidity('');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = new FormData(form);
    const body = { zip: String(fields.get('zip')).trim() };
    for (const key of ['minPrice', 'maxPrice', 'minDays', 'maxDays', 'maxLeads']) body[key] = Number(fields.get(key));
    form.elements.maxPrice.setCustomValidity(body.maxPrice < body.minPrice ? 'Maximum price must be at least the minimum price.' : '');
    form.elements.maxDays.setCustomValidity(body.maxDays < body.minDays ? 'Maximum days must be at least the minimum days.' : '');
    if (!form.reportValidity()) return;
    $('startCampaign').disabled = true;
    status('Starting your search…');
    try {
      const response = await request('/api/campaigns', { method: 'POST', body: JSON.stringify(body) });
      const campaign = response.campaign || response;
      if (!campaign.id) throw new Error('Search submitted, but its ID was not returned. Refresh history before trying again.');
      state.selectedId = campaign.id;
      renderDetail(campaign);
      status('Search queued. You can leave this page and return to see the results.');
      await refresh();
    } catch (error) { status(error.message, true); }
    finally { $('startCampaign').disabled = false; }
  });
  $('cancelCampaign').addEventListener('click', async () => {
    if (!state.selectedId || !window.confirm('Cancel this search? Results already collected will be kept. Emails already sent cannot be recalled.')) return;
    $('cancelCampaign').disabled = true;
    try {
      await request(`/api/campaigns/${encodeURIComponent(state.selectedId)}/cancel`, { method: 'POST', body: '{}' });
      status('Cancellation requested. Collected results will be kept.');
      await refresh();
    } catch (error) { status(error.message, true); }
    finally { $('cancelCampaign').disabled = false; }
  });
  $('refresh').addEventListener('click', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  refresh();
})();
