const state = {
  overview: null,
  repository: null,
  view: "overview",
  dataset: "properties",
  exceptionKey: "",
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
  setMetric("exceptionCount", metrics.exceptionCount);
  setMetric("runStateCount", metrics.runStateCount);
  $("agentDetail").textContent = `${numberFormat.format(metrics.needsReviewAgents)} need review`;
  $("reviewDetail").textContent = `${numberFormat.format(metrics.internalReviewCount)} sent/internal review records`;
  $("exceptionDetail").textContent =
    `${numberFormat.format(metrics.missingAgentCount)} missing agents, ${numberFormat.format(metrics.missingContactCount)} missing contacts`;
  $("runStateDetail").textContent =
    `${numberFormat.format(metrics.blockedRunStateCount)} blocked, ${numberFormat.format(metrics.currentRunStateCount)} current`;
  $("updatedAt").textContent = `Updated ${formatDate(overview.generatedAt)}`;

  renderBars("pipelineBars", overview.distributions.propertyOutreach);
  renderBars("photoBars", overview.distributions.propertyPhotoStatus);
  renderBars("runStateBars", overview.distributions.runStateStatus);
  renderBars(
    "exceptionBars",
    overview.exceptions.map((category) => ({ name: category.label, count: category.count })),
  );
  renderValidationStatus();

  renderTableRows("propertyRows", overview.recent.properties, [
    (row) => row.property_address,
    (row) => row.listing_agent,
    (row) => row.photo_status,
    (row) => row.email_sent_to_zac,
    (row) => row.outreach_status,
  ]);

  renderTableRows("interactionRows", overview.recent.interactions, [
    (row) => row.date,
    (row) => row.agent_name,
    (row) => row.property_address,
    (row) => row.message_status,
    (row) => row.next_action,
  ]);

  renderTableRows("runStateRows", overview.recent.runStates, [
    (row) => row.runType,
    (row) => row.status,
    (row) => row.file,
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
          <a class="button" href="/api/downloads/${dataset.key}.csv">CSV</a>
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
    const [overviewResponse, repositoryResponse] = await Promise.all([
      fetch("/api/overview"),
      fetch("/api/repository"),
    ]);
    state.overview = await overviewResponse.json();
    state.repository = await repositoryResponse.json();
    renderOverview();
    renderDownloadCards();
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
