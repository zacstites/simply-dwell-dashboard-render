const state = {
  overview: null,
  repository: null,
  agentDrilldown: null,
  view: "overview",
  dataset: "properties",
  exceptionKey: "",
  selectedAgentId: "",
  selectedAgentSection: "properties",
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

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateFormat.format(date);
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

function renderValidationStatus() {
  const validation = state.overview.validation;
  const rows = Object.entries(validation.datasets).map(([key, dataset]) => ({ key, ...dataset }));
  $("sourceStatus").textContent = validation.ok
    ? `Snapshots loaded from ${state.overview.source.dataDir}`
    : "One or more source snapshots are missing required headers";

  $("validationRows").replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement("article");
      item.className = row.validation.ok ? "status-card" : "status-card warning";
      const title = document.createElement("strong");
      title.textContent = row.key;
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

function renderRepositoryTable() {
  if (!state.repository) return;
  const table = $("repositoryTable");
  const dataset = state.repository[state.dataset];
  const visibleHeaders = dataset.headers.slice(0, 10);
  $("datasetStatus").textContent =
    `${dataset.label}: ${numberFormat.format(dataset.rows)} rows, ${numberFormat.format(dataset.columns)} columns, ` +
    `${dataset.validation.ok ? "headers ok" : `missing ${dataset.validation.missingHeaders.join(", ")}`}`;

  renderGenericTable(table, visibleHeaders, dataset.records.slice(0, 120));
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
      ? ["date", "property_address", "draft_type", "message_status", "next_action", "notes"]
      : ["property_address", "city", "mls_id", "photo_status", "email_sent_to_zac", "dashboard_status", "customer_batch_status"];

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
      th.textContent = header.replaceAll("_", " ");
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
          td.textContent = text(record[header]);
          return td;
        }),
      );
      return tr;
    }),
  );

  table.replaceChildren(head, body);
}

function renderExceptionControls() {
  const select = $("exceptionSelect");
  const categories = state.overview.exceptions;
  if (!state.exceptionKey && categories.length) {
    state.exceptionKey = categories[0].key;
  }

  select.replaceChildren(
    ...categories.map((category) => {
      const option = document.createElement("option");
      option.value = category.key;
      option.textContent = `${category.label} (${numberFormat.format(category.count)})`;
      return option;
    }),
  );
  select.value = state.exceptionKey;
  renderExceptionTable();
}

function renderExceptionTable() {
  const category = state.overview.exceptions.find((item) => item.key === state.exceptionKey);
  if (!category) return;
  $("exceptionStatus").textContent =
    `${category.label}: ${numberFormat.format(category.count)} total, showing up to ${numberFormat.format(category.records.length)}`;
  const headers = Object.keys(category.records[0] || { status: "", note: "" });
  renderGenericTable($("exceptionTable"), headers, category.records);
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.dataset.view === view));
}

async function load() {
  $("refresh").disabled = true;
  try {
    const [overviewResponse, repositoryResponse, agentDrilldownResponse] = await Promise.all([
      fetch("/api/overview"),
      fetch("/api/repository"),
      fetch("/api/agent-drilldown"),
    ]);
    state.overview = await overviewResponse.json();
    state.repository = await repositoryResponse.json();
    state.agentDrilldown = await agentDrilldownResponse.json();
    renderOverview();
    renderDownloadCards();
    renderAgentDrilldown();
    renderRepositoryTable();
    renderExceptionControls();
  } finally {
    $("refresh").disabled = false;
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

$("datasetSelect").addEventListener("change", (event) => {
  state.dataset = event.target.value;
  renderRepositoryTable();
});

$("exceptionSelect").addEventListener("change", (event) => {
  state.exceptionKey = event.target.value;
  renderExceptionTable();
});

$("refresh").addEventListener("click", load);

load();
