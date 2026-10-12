#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");

const root = path.resolve(__dirname, "..", "..");
const sourceDir = "/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/agent-database";
const sourceRunStateDir =
  "/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/nightly-leads/.run-state";
const backlogStateFile =
  "/Users/zac/.openclaw/workspace-simply-dwell-lead-generation-backlog/state/backlog-example-state.json";
const backlogCsvFile =
  "/Users/zac/.openclaw/workspace-simply-dwell-lead-generation-backlog/state/realMLS-active-vacant-residential-backlog-2026-10-06.csv";
const targetDir = path.join(root, "dashboard", "private-data");
const targetRunStateDir = path.join(targetDir, "run-state");
const targetBacklogFile = path.join(targetDir, "mls-backlog.csv");

const HOLD_ADDRESSES = new Set([normalizeAddress("5541 Milmar Drive N"), normalizeAddress("1418 W 19TH Street")]);

fs.mkdirSync(targetDir, { recursive: true });

function normalizeAddress(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/#/g, " unit ")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\bcircle\b/g, "cir")
    .replace(/\blane\b/g, "ln")
    .replace(/\broad\b/g, "rd")
    .replace(/\btrail\b/g, "trl")
    .replace(/\bplace\b/g, "pl")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function addressMatches(recordAddress, allowedKey) {
  const recordKey = normalizeAddress(recordAddress);
  return recordKey === allowedKey || recordKey.startsWith(`${allowedKey} `);
}

function isHoldAddress(recordAddress) {
  return [...HOLD_ADDRESSES].some((holdKey) => addressMatches(recordAddress, holdKey));
}

function readCsv(file) {
  return parse(fs.readFileSync(file, "utf8"), {
    bom: true,
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
  });
}

function writeCsv(file, rows, columns) {
  fs.writeFileSync(file, stringify(rows, { header: true, columns }), "utf8");
}

function uniqueColumns(columns) {
  return [...new Set(columns.filter(Boolean))];
}

function readCombinedCsv(file, idField) {
  const primaryRows = readCsv(path.join(sourceDir, file));
  const seen = new Set();
  const rows = [];

  for (const row of primaryRows) {
    const key = row[idField] || JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  return rows;
}

function fullAddress(row) {
  return [
    row.street_number,
    row.street_dir_prefix,
    row.street_name,
    row.street_suffix,
    row.street_dir_suffix,
    row.unit ? `Unit ${row.unit}` : "",
    row.city,
    row.state,
    row.postal_code,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const properties = readCombinedCsv("properties.csv", "property_id");
const dashboardProperties = properties.map((row) => ({
  ...row,
  processing_status:
    row.customer_batch_status === "customer_sent" || row.customer_batch_status === "customer_test_sent"
      ? "customer_sent"
      : row.customer_batch_status === "customer_ready_candidate"
        ? "ready_for_customer_forward"
        : row.mls_backlog_status || row.outreach_status || "",
}));

const dashboardPropertyKeys = new Set(dashboardProperties.map((row) => normalizeAddress(row.property_address)));
const dashboardAgentKeys = new Set(
  dashboardProperties.map((row) => `${row.listing_agent}|||${row.brokerage}`.toLowerCase()),
);
const dashboardAgents = readCombinedCsv("agents.csv", "agent_id").map((row) => {
  const hasDashboardLead =
    dashboardAgentKeys.has(`${row.agent_name}|||${row.brokerage}`.toLowerCase()) ||
    dashboardPropertyKeys.has(normalizeAddress(row.last_property_matched));

  return {
    ...row,
    customer_batch_status: hasDashboardLead ? "customer_sent" : row.customer_batch_status || "",
    processing_status: hasDashboardLead ? "customer_sent" : row.processing_status || "",
  };
});

const dashboardInteractions = readCombinedCsv("interactions.csv", "interaction_id").map((row) => ({
  ...row,
  processing_status: String(row.message_status || "").includes("customer_sent")
    ? "customer_sent"
    : row.processing_status || "",
}));

const propertyColumns = uniqueColumns([
  ...Object.keys(properties[0] || {}),
  "customer_batch_status",
  "mls_backlog_status",
  "processing_status",
]);
const agentSource = readCombinedCsv("agents.csv", "agent_id");
const interactionSource = readCombinedCsv("interactions.csv", "interaction_id");
writeCsv(path.join(targetDir, "properties.csv"), dashboardProperties, propertyColumns);
writeCsv(path.join(targetDir, "agents.csv"), dashboardAgents, uniqueColumns([
  ...Object.keys(agentSource[0] || {}),
  "customer_batch_status",
  "processing_status",
]));
writeCsv(path.join(targetDir, "interactions.csv"), dashboardInteractions, uniqueColumns([
  ...Object.keys(interactionSource[0] || {}),
  "customer_batch_status",
  "processing_status",
]));

fs.rmSync(targetRunStateDir, { force: true, recursive: true });
fs.mkdirSync(targetRunStateDir, { recursive: true });

const runStateFiles = fs
  .readdirSync(sourceRunStateDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
  .map((entry) => entry.name)
  .sort();

for (const file of runStateFiles) {
  fs.copyFileSync(path.join(sourceRunStateDir, file), path.join(targetRunStateDir, file));
}

console.log(`Synced ${runStateFiles.length} run-state files`);

const backlogState = JSON.parse(fs.readFileSync(backlogStateFile, "utf8"));
const processedIds = new Set(backlogState.processed_mls_ids || []);
const skippedByMls = new Map((backlogState.skipped || []).map((row) => [String(row.mls_id || ""), row]));
const propertyByMls = new Map(dashboardProperties.map((row) => [String(row.mls_id || ""), row]));
const backlogRows = readCsv(backlogCsvFile).map((row, index) => {
  const sent = propertyByMls.get(String(row.mls_number || ""));
  const skipped = skippedByMls.get(String(row.mls_number || ""));
  const derivedAddress = fullAddress(row);
  let processingStatus = "not_started";
  let customerBatchStatus = "";
  let statusNote = "";

  if (sent) {
    processingStatus = sent.customer_batch_status === "customer_sent" ? "customer_sent" : "processed_sent_internal_review";
    customerBatchStatus = sent.customer_batch_status || "customer_ready_candidate";
    statusNote = `Matched dashboard lead as ${sent.property_address}`;
  } else if (skipped) {
    processingStatus = "reviewed_skipped";
    customerBatchStatus = isHoldAddress(skipped.address) ? "do_not_outreach" : "hold_not_customer_ready";
    statusNote = skipped.reason || "";
  } else if (processedIds.has(String(row.mls_number || ""))) {
    processingStatus = "processed_seen";
    customerBatchStatus = "hold_not_customer_ready";
  }

  return {
    backlog_row: index + 2,
    mls_number: row.mls_number || "",
    address: derivedAddress,
    city: row.city || "",
    state: row.state || "",
    postal_code: row.postal_code || "",
    list_price: row.list_price || "",
    days_on_market: row.days_on_market || "",
    occupant_type: row.occupant_type || "",
    furnished: row.furnished || "",
    listing_agent: row.listing_agent || "",
    agency_name: row.agency_name || "",
    photo_url: row.photo_url || "",
    processing_status: processingStatus,
    customer_batch_status: customerBatchStatus,
    status_note: statusNote,
    source_file: row.source_file || "",
  };
});

writeCsv(targetBacklogFile, backlogRows, [
  "backlog_row",
  "mls_number",
  "address",
  "city",
  "state",
  "postal_code",
  "list_price",
  "days_on_market",
  "occupant_type",
  "furnished",
  "listing_agent",
  "agency_name",
  "photo_url",
  "processing_status",
  "customer_batch_status",
  "status_note",
  "source_file",
]);

console.log(
  `Synced dashboard snapshot: ${dashboardProperties.length} properties, ${dashboardAgents.length} agents, ${dashboardInteractions.length} interactions`,
);
console.log(`Synced MLS backlog status rows: ${backlogRows.length}`);
