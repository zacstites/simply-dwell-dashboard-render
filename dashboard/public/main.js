const state = {
  overview: null,
  agentDrilldown: null,
  emailOperations: null,
  view: "overview",
  selectedAgentId: "",
  selectedAgentSection: "properties",
  activePrestageJobId: "",
  prestagePollTimer: null,
};

const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function $(id) {
  return document.getElementById(id);
}

function text(value) {
  return String(value || "").trim() || "-";
}

function labelForHeader(header) {
  const labels = {
    email_sent_to_zac: "Sent to Dwell",
    mls_id: "MLS",
    lead_source: "Lead Source",
    next_action: "Next Action",
    photo_status: "AI Pictures Sent",
    property_address: "Property Address",
  };
  return labels[header] || header.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(header, value, record = {}, headers = []) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  if (header === "listing_price" && Number.isFinite(Number(raw))) return new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 0}).format(Number(raw));
  if (header === "property_address" && headers.includes("city")) return raw.split(",")[0].trim() || raw;
  if (header === "email_sent_to_zac") return raw.toLowerCase() === "yes" ? "Yes" : "No";
  if (header === "photo_status") {
    const normalized = raw.toLowerCase();
    return normalized.includes("panel") || normalized.includes("before/after") || normalized.includes("ai") ? "Yes" : "No";
  }
  if (["draft_type", "message_status", "next_action", "photo_status"].includes(header)) {
    return raw.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return raw;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateFormat.format(date);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }

  return data;
}

function setMetric(id, value) {
  $(id).textContent = numberFormat.format(Number(value || 0));
}

function renderBars(id, rows) {
  const container = $(id);
  const max = Math.max(1, ...rows.map((row) => row.count));
  container.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement("div");
      item.className = "bar-row";
      const label = document.createElement("span");
      label.textContent = text(row.name);
      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = `${(row.count / max) * 100}%`;
      track.append(fill);
      const count = document.createElement("strong");
      count.textContent = numberFormat.format(row.count);
      item.replaceChildren(label, track, count);
      return item;
    }),
  );
}

function renderPie(id, rows) {
  const container = $(id);
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const palette = ["#7291c4", "#37465f"];
  let cursor = 0;
  const stops = rows.map((row, index) => {
    const value = total ? (Number(row.count || 0) / total) * 100 : 0;
    const start = cursor;
    cursor += value;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  });
  const chart = document.createElement("div");
  chart.className = "pie-chart";
  chart.style.background = total
    ? `conic-gradient(${stops.join(", ")})`
    : "var(--brand-3)";

  const legend = document.createElement("div");
  legend.className = "pie-legend";
  legend.replaceChildren(
    ...rows.map((row, index) => {
      const item = document.createElement("div");
      item.className = "pie-legend-row";
      const swatch = document.createElement("span");
      swatch.className = "pie-swatch";
      swatch.style.background = palette[index % palette.length];
      const label = document.createElement("span");
      label.textContent = row.name;
      const count = document.createElement("strong");
      count.textContent = numberFormat.format(row.count);
      item.replaceChildren(swatch, label, count);
      return item;
    }),
  );

  const wrap = document.createElement("div");
  wrap.className = "pie-wrap";
  wrap.replaceChildren(chart, legend);
  container.replaceChildren(wrap);
}

function renderTableRows(id, rows, cells) {
  const body = $(id);
  body.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      tr.replaceChildren(
        ...cells.map((cell) => {
          const td = document.createElement("td");
          td.textContent = text(cell(row));
          return td;
        }),
      );
      return tr;
    }),
  );
}

function renderEmailOperations() {
  const telemetry = state.emailOperations; if (!telemetry) return;
  $("emailScope").textContent = telemetry.mode === "production-only"
    ? "Production only · verified direct-to-listing-agent emails since October 28, 2026 at 8:00 PM Eastern. Historical review/test activity is excluded."
    : "Historical review activity · production-only reporting begins October 28, 2026 at 8:00 PM Eastern.";
  setMetric("emailSent", telemetry.metrics.sent); setMetric("emailQueued", telemetry.metrics.queued); setMetric("emailFailures", telemetry.metrics.failures); setMetric("emailReplies", telemetry.metrics.confirmedReplies);
  $("emailReplyRate").textContent = telemetry.metrics.replyRate === null ? "Rate unavailable" : (telemetry.metrics.replyRate * 100).toFixed(1) + "% reply rate";
  renderReplyChart(telemetry.engagement, telemetry.metrics.sent);
  const production = telemetry.mode === "production-only";
  $("emailBotPanel").hidden = !production;
  $("emailBotControls").hidden = !production;
  const counts = telemetry.byBot || [
    {botId:"cortona",bot:"Backlog / Cortona",sent:0},
    {botId:"lead-generation",bot:"Daily MLS Email",sent:0},
    {botId:"campaigns",bot:"ZIP Campaign",sent:0},
    {botId:"unknown",bot:"Unknown",sent:0},
  ];
  $("emailBotCounts").replaceChildren(...counts.map(row => {
    const card = document.createElement("article");
    const label = document.createElement("span"); label.textContent = row.bot;
    const count = document.createElement("strong"); count.textContent = numberFormat.format(row.sent);
    card.append(label, count); return card;
  }));
  const selected = $("emailBotFilter").value;
  const rows = telemetry.events.filter(row => !production || selected === "all" || row.botId === selected);
  $("emailBotResult").textContent = rows.length
    ? `Showing ${rows.length} ${selected === "all" ? "emails" : "emails for this bot"} from the latest 200 verified deliveries. Counts above cover all verified deliveries.`
    : "No verified production emails for this selection.";
  renderTableRows("emailOperationRows", rows, [(row)=>formatDate(row.eventAt),(row)=>row.eventType === "failure" ? "Delivery follow-up" : row.eventType,(row)=>row.bot,(row)=>row.campaign,(row)=>row.segment,(row)=>row.propertyAddress,(row)=>row.agentName]);
}

function renderReplyChart(engagement, sent) {
  const target = $("replyChart"); if (!target) return;
  const replied = Number(engagement?.replied || 0); const noRecordedReply = Math.max(0, Number(engagement?.noRecordedReply || 0));
  const total = replied + noRecordedReply; const replyPercent = total ? (replied / total) * 100 : 0;
  const chart = document.createElement("div"); chart.className = "reply-chart";
  const ring = document.createElement("div"); ring.className = "reply-ring"; ring.style.setProperty("--reply-percent", replyPercent + "%");
  ring.innerHTML = "<strong>" + (total ? replyPercent.toFixed(1) + "%" : "—") + "</strong><span>replied</span>";
  const legend = document.createElement("div"); legend.className = "reply-legend";
  legend.innerHTML = "<p><i class=\"reply-dot replied\"></i><span>Recorded reply</span><strong>" + numberFormat.format(replied) + "</strong></p><p><i class=\"reply-dot no-reply\"></i><span>No recorded reply</span><strong>" + numberFormat.format(noRecordedReply) + "</strong></p><small>Based on " + numberFormat.format(sent) + " sent emails. Recipient opens are not tracked.</small>";
  chart.replaceChildren(ring, legend); target.replaceChildren(chart);
}

function renderValidationStatus() {
  const validation = state.overview.validation;
  const datasetLabels = Object.fromEntries(state.overview.repository.map((dataset) => [dataset.key, dataset.label]));
  const rows = Object.entries(validation.datasets).map(([key, dataset]) => ({
    key,
    label: datasetLabels[key] || key,
    ...dataset,
  }));
  $("sourceStatus").textContent = validation.ok
    ? `Snapshots loaded from ${state.overview.source.dataDir}`
    : "One or more source snapshots are missing required headers";

  $("validationRows").replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement("article");
      item.className = row.validation.ok ? "status-card" : "status-card warning";
      const title = document.createElement("strong");
      title.textContent = row.label;
      const count = document.createElement("span");
      count.textContent = `${numberFormat.format(row.rows)} rows, ${numberFormat.format(row.columns)} columns`;
      const detail = document.createElement("small");
      detail.textContent = row.validation.ok
        ? "Required headers present"
        : `Missing: ${row.validation.missingHeaders.join(", ")}`;
      item.replaceChildren(title, count, detail);
      return item;
    }),
  );
}

function renderOverview() {
  const overview = state.overview;
  const { metrics } = overview;
  setMetric("agentCount", metrics.agentCount);
  setMetric("propertyCount", metrics.propertyCount);
  setMetric("interactionCount", metrics.interactionCount);
  setMetric("backlogCount", metrics.backlogCount);
  $("agentDetail").textContent = `${numberFormat.format(metrics.needsReviewAgents)} need review`;
  $("reviewDetail").textContent = `${numberFormat.format(metrics.internalReviewCount)} sent/internal review records`;
  $("backlogDetail").textContent =
    `${numberFormat.format(metrics.backlogNotStartedCount)} not started, ${numberFormat.format(metrics.backlogReadyCount)} ready`;
  $("updatedAt").textContent = `Updated ${formatDate(overview.generatedAt)}`;

  renderPie("overviewBatchPie", overview.distributions.backlogCustomerBatchStatus);
  renderBars("marketCoverageBars", overview.distributions.backlogCityCoverage);
  renderBars("listingAgeBars", overview.distributions.backlogAgeBuckets);
  renderBars("emailActivityBars", overview.distributions.emailReviewActivity);
  renderBars("backlogProcessingBars", overview.distributions.backlogProcessingStatus);
  renderPie("backlogBatchBars", overview.distributions.backlogCustomerBatchStatus);
  renderValidationStatus();

  $("backlogStatus").textContent =
    `${numberFormat.format(metrics.backlogProcessedCount)} processed or seen, ` +
    `${numberFormat.format(metrics.backlogHoldCount)} holds, ${numberFormat.format(metrics.backlogNotStartedCount)} not started`;
  renderTableRows("backlogRows", overview.recent.mlsBacklog, [
    (row) => row.mls_number,
    (row) => row.address,
    (row) => row.listing_agent,
    (row) => row.processing_status,
    (row) => row.customer_batch_status,
    (row) => row.status_note,
  ]);
}

function renderDownloadCards() {
  const cards = $("downloadCards");
  cards.replaceChildren(
    ...state.overview.repository.map((dataset) => {
      const card = document.createElement("article");
      card.className = "download-card";
      card.innerHTML = `
        <div>
          <strong>${dataset.label}</strong>
          <p class="muted">${numberFormat.format(dataset.rows)} rows, ${numberFormat.format(dataset.columns)} columns</p>
          <p class="muted">Updated ${formatDate(dataset.updatedAt)}</p>
        </div>
        <div class="download-actions">
          <a class="button" href="/api/downloads/${dataset.slug}.csv">CSV</a>
        </div>
      `;
      return card;
    }),
  );
}

function selectAgent(agentId, section = state.selectedAgentSection) {
  state.selectedAgentId = agentId;
  state.selectedAgentSection = section;
  renderAgentDrilldown();
}

function renderAgentDrilldown() {
  const container = $("agentDrilldown");
  if (!state.agentDrilldown) return;

  const agents = state.agentDrilldown.agents || [];
  if (!agents.length) {
    container.textContent = "No agent rows loaded.";
    return;
  }

  if (!state.selectedAgentId || !agents.some((agent) => agent.agent_id === state.selectedAgentId)) {
    state.selectedAgentId = agents[0].agent_id;
  }

  const selected = agents.find((agent) => agent.agent_id === state.selectedAgentId) || agents[0];
  const rows = state.selectedAgentSection === "emails" ? selected.emails : selected.properties;
  const headers =
    state.selectedAgentSection === "emails"
      ? ["date", "property_address", "draft_type", "message_status", "no_send_reason", "next_action"]
      : ["property_address", "city", "mls_id", "lead_source", "listing_price", "photo_status", "email_sent_to_zac", "no_send_reason"];

  const listTable = document.createElement("table");
  listTable.className = "agent-list-table";
  const listHead = document.createElement("thead");
  listHead.innerHTML = "<tr><th>Agent</th><th>Market</th><th>Properties</th><th>Emails</th></tr>";
  const listBody = document.createElement("tbody");
  listBody.replaceChildren(
    ...agents.map((agent) => {
      const tr = document.createElement("tr");
      tr.className = agent.agent_id === selected.agent_id ? "active-row" : "";

      const agentCell = document.createElement("td");
      const agentButton = document.createElement("button");
      agentButton.type = "button";
      agentButton.className = "link-button agent-name-button";
      agentButton.textContent = text(agent.agent_name);
      agentButton.addEventListener("click", () => selectAgent(agent.agent_id, "properties"));
      const brokerage = document.createElement("small");
      brokerage.textContent = text(agent.brokerage);
      agentCell.replaceChildren(agentButton, brokerage);

      const marketCell = document.createElement("td");
      marketCell.textContent = text(agent.market_city);

      const propertiesCell = document.createElement("td");
      const propertyButton = document.createElement("button");
      propertyButton.type = "button";
      propertyButton.className = "link-button count-button";
      propertyButton.textContent = numberFormat.format(agent.propertyCount);
      propertyButton.addEventListener("click", () => selectAgent(agent.agent_id, "properties"));
      propertiesCell.append(propertyButton);

      const emailsCell = document.createElement("td");
      const emailButton = document.createElement("button");
      emailButton.type = "button";
      emailButton.className = "link-button count-button";
      emailButton.textContent = numberFormat.format(agent.emailCount);
      emailButton.addEventListener("click", () => selectAgent(agent.agent_id, "emails"));
      emailsCell.append(emailButton);

      tr.replaceChildren(agentCell, marketCell, propertiesCell, emailsCell);
      return tr;
    }),
  );
  listTable.replaceChildren(listHead, listBody);

  const detail = document.createElement("div");
  detail.className = "agent-detail";
  const detailHead = document.createElement("div");
  detailHead.className = "agent-detail-head";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = text(selected.agent_name);
  const meta = document.createElement("p");
  meta.className = "muted";
  meta.textContent = `${text(selected.brokerage)} | ${text(selected.market_city)} | ${text(selected.contactCoverage)}`;
  titleWrap.replaceChildren(title, meta);

  const switcher = document.createElement("div");
  switcher.className = "section-switch";
  [
    ["properties", `Properties (${numberFormat.format(selected.propertyCount)})`],
    ["emails", `Emails (${numberFormat.format(selected.emailCount)})`],
  ].forEach(([section, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = state.selectedAgentSection === section ? "section-button active" : "section-button";
    button.textContent = label;
    button.addEventListener("click", () => selectAgent(selected.agent_id, section));
    switcher.append(button);
  });
  detailHead.replaceChildren(titleWrap, switcher);

  const detailTable = document.createElement("table");
  renderGenericTable(detailTable, headers, rows);
  if (!rows.length) {
    const emptyBody = document.createElement("tbody");
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = headers.length;
    td.textContent = "No matching records for this agent.";
    tr.append(td);
    emptyBody.append(tr);
    detailTable.append(emptyBody);
  }

  const detailTableWrap = document.createElement("div");
  detailTableWrap.className = "table-wrap";
  detailTableWrap.append(detailTable);
  detail.replaceChildren(detailHead, detailTableWrap);

  const listWrap = document.createElement("div");
  listWrap.className = "agent-list-wrap table-wrap";
  listWrap.append(listTable);

  const layout = document.createElement("div");
  layout.className = "agent-layout";
  layout.replaceChildren(listWrap, detail);
  container.replaceChildren(layout);
}

function renderGenericTable(table, headers, records) {
  const head = document.createElement("thead");
  const body = document.createElement("tbody");
  const headerRow = document.createElement("tr");

  headerRow.replaceChildren(
    ...headers.map((header) => {
      const th = document.createElement("th");
      th.textContent = labelForHeader(header);
      return th;
    }),
  );
  head.append(headerRow);

  body.replaceChildren(
    ...records.map((record) => {
      const tr = document.createElement("tr");
      tr.replaceChildren(
        ...headers.map((header) => {
          const td = document.createElement("td");
          td.textContent = displayValue(header, record[header], record, headers);
          return td;
        }),
      );
      return tr;
    }),
  );

  table.replaceChildren(head, body);
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.dataset.view === view));
  document.querySelector(".metrics").hidden = view === "prestage";
}

const prestageProgress = {
  uploaded: 35,
  queued: 45,
  extracting: 58,
  transcribing: 70,
  summarizing: 88,
  ready: 100,
  failed: 100,
};

function setPrestageStatus(message, progress) {
  $("prestageJobStatus").textContent = message;
  $("prestageMeterBar").style.width = `${progress}%`;
}

function setPrestageBusy(isBusy) {
  document.querySelectorAll("#prestageForm button, #prestageForm input, #prestageForm select, #prestageForm textarea").forEach(
    (field) => {
      field.disabled = isBusy;
    },
  );
}

function renderPrestageWarnings(warnings = []) {
  const container = $("prestageWarnings");
  container.replaceChildren(
    ...(warnings.length ? warnings : ["Draft only until reviewed."]).map((warning) => {
      const item = document.createElement("p");
      item.textContent = warning;
      return item;
    }),
  );
}

function renderPrestageJob(job) {
  const progress = prestageProgress[job.status] || 20;
  const label =
    {
      uploaded: "Uploaded. Transcription is not configured yet.",
      queued: "Queued for transcription.",
      extracting: "Extracting audio from video.",
      transcribing: "Transcribing walkthrough.",
      summarizing: "Building room and furniture summary.",
      ready: "Room and furniture summary ready.",
      failed: "Walkthrough processing failed.",
    }[job.status] || text(job.status);

  setPrestageStatus(label, progress);
  $("prestageJobMeta").textContent = [
    `Job ${job.id}`,
    job.file?.originalName ? `File: ${job.file.originalName}` : "",
    job.updatedAt ? `Updated ${new Date(job.updatedAt).toLocaleString()}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  $("prestageOutput").value = job.notesDraft || job.transcript || "";
  $("prestageCopyOutput").disabled = !$("prestageOutput").value;
  renderPrestageWarnings(job.warnings || []);

  if (job.id) {
    $("prestageTranscriptLink").href = `/api/prestage/intakes/${job.id}/transcript.txt`;
    $("prestageTranscriptLink").classList.remove("disabled");
    $("prestageTranscriptLink").setAttribute("aria-disabled", "false");
  }

  if (job.error) {
    $("prestageOutput").value = `Error: ${job.error}`;
    $("prestageCopyOutput").disabled = true;
  }
}

async function pollPrestageJob(id) {
  try {
    const job = await fetchJson(`/api/prestage/intakes/${id}`);
    if (id !== state.activePrestageJobId) return;
    renderPrestageJob(job);

    if (job.status !== "ready" && job.status !== "failed") {
      state.prestagePollTimer = window.setTimeout(() => pollPrestageJob(id), 2500);
    }
  } catch (error) {
    setPrestageStatus(error.message || "Could not refresh intake status.", 100);
  }
}

async function initPrestage() {
  try {
    const health = await fetchJson("/api/prestage/health");
    $("prestageConfigStatus").textContent = health.transcriptionConfigured
      ? `Room summaries enabled. Upload limit ${health.maxUploadMb} MB.`
      : `Uploads enabled. AI processing needs OPENAI_API_KEY. Limit ${health.maxUploadMb} MB.`;
  } catch {
    $("prestageConfigStatus").textContent = "Upload settings unavailable.";
  }

  renderPrestageWarnings();
}

async function load() {
  $("refresh").disabled = true;
  try {
    const [overviewResponse, agentDrilldownResponse, emailOperations] = await Promise.all([
      fetch("/api/overview"),
      fetch("/api/agent-drilldown"),
      fetch("/api/email-operations"),
    ]);
    state.overview = await overviewResponse.json();
    state.agentDrilldown = await agentDrilldownResponse.json();
    state.emailOperations = await emailOperations.json();
    renderOverview();
    renderDownloadCards();
    renderAgentDrilldown();
    renderEmailOperations();
    await initPrestage();
  } finally {
    $("refresh").disabled = false;
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

$("emailBotFilter").addEventListener("change", renderEmailOperations);
$("refresh").addEventListener("click", load);

$("prestageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  window.clearTimeout(state.prestagePollTimer);
  const formData = new FormData(event.currentTarget);
  setPrestageBusy(true);
  setPrestageStatus("Uploading walkthrough...", 15);
  $("prestageOutput").value = "";
  $("prestageJobMeta").textContent = "Uploading";

  try {
    const job = await fetchJson("/api/prestage/intakes", {
      method: "POST",
      body: formData,
    });
    state.activePrestageJobId = job.id;
    renderPrestageJob(job);

    if (job.status !== "ready" && job.status !== "failed") {
      pollPrestageJob(job.id);
    }
  } catch (error) {
    setPrestageStatus(error.message || "Upload failed.", 100);
  } finally {
    setPrestageBusy(false);
  }
});

$("prestageCopyOutput").addEventListener("click", async () => {
  if (!$("prestageOutput").value) return;
  await navigator.clipboard.writeText($("prestageOutput").value);
  $("prestageCopyOutput").textContent = "Copied";
  window.setTimeout(() => {
    $("prestageCopyOutput").textContent = "Copy";
  }, 1200);
});

load();
// Refresh the email view on the cutover boundary even in an already-open tab.
async function refreshEmailOperations() {
  if (Date.now() >= Date.parse("2026-10-28T20:00:00-04:00") && state.emailOperations?.mode !== "production-only") {
    state.emailOperations = {mode:"production-only",metrics:{sent:0,queued:0,failures:0,confirmedReplies:0,replyRate:null},engagement:{replied:0,noRecordedReply:0},events:[]};
    renderEmailOperations();
  }
  try { state.emailOperations = await fetchJson("/api/email-operations"); renderEmailOperations(); }
  catch { /* Retain the last confirmed response; no invented delivery metrics. */ }
}
setInterval(refreshEmailOperations, 30000);
const emailCutoverDelay = Date.parse("2026-10-28T20:00:00-04:00") - Date.now();
if (emailCutoverDelay > 0 && emailCutoverDelay < 2147483647) setTimeout(refreshEmailOperations, emailCutoverDelay + 50);
