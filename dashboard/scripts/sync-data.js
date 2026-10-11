#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");

const root = path.resolve(__dirname, "..", "..");
const sourceDir = "/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/agent-database";
const archiveDir =
  "/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/agent-database/archive/go-live-2026-10-11-full";
const sourceRunStateDir =
  "/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/nightly-leads/.run-state";
const backlogStateFile =
  "/Users/zac/.openclaw/workspace-simply-dwell-lead-generation-backlog/state/backlog-example-state.json";
const backlogCsvFile =
  "/Users/zac/.openclaw/workspace-simply-dwell-lead-generation-backlog/state/realMLS-active-vacant-residential-backlog-2026-10-06.csv";
const targetDir = path.join(root, "dashboard", "private-data");
const targetRunStateDir = path.join(targetDir, "run-state");
const targetBacklogFile = path.join(targetDir, "mls-backlog.csv");

const READY_ADDRESSES = [
  "194 Salida Way",
  "15 San Nueve Cir",
  "148 Pescado Dr",
  "3020 Mac Rd",
  "316 Willow Lake Dr",
  "247 Los Alamos St",
  "367 Trellis Bay Dr",
  "761 Nocatee Village Dr",
  "606 Gulfstream Trail S",
  "4406 Lane Ave S",
  "59 Cane Garden Way",
  "5630 Temple Road",
  "29 Lone Cypress Way",
  "126 Phoenetia Drive",
  "763 Battersea Dr",
  "421 Permento Ave S",
  "207 Hinson Ave",
  "5645 Wandering Trail",
  "381 Seamark Drive",
  "3050 Breve Dr",
  "5133 Palmer Avenue",
  "6515 W La Mirada Drive #2",
  "2527 Sandlewood Circle",
  "10153 Roman Ln",
  "5327 Saginaw Avenue",
  "615 Fairway Drive #206",
  "7023 Shindler Dr",
  "3554 Brockway Road",
  "37091 Southern Glen Way",
  "1111 Inwood Terrace",
  "175 Alava Court",
  "8808 Norfolk Boulevard",
  "208 Cowry Rd",
  "146 Sunset Circle",
  "8048 Kilwinning Lane",
  "3591 Kernan Boulevard S Unit 705",
  "1071 Edgewood Ave S #409",
  "1603 W 27th Street",
  "12145 Versailles Street",
  "12606 Point Park Drive",
  "13703 N Richmond Park Drive N Unit 2109",
  "3270 Ricky Drive Unit 202",
  "791 Assisi Lane Unit 1501",
  "709 Lake Sinclair Street",
  "617 Birchbark Trl",
  "9852 Lemon Balm Way",
  "11356 Canvasback Court",
  "507 Worcester Court",
  "1454 Cove Landing Drive",
];

const HOLD_ADDRESSES = new Set([normalizeAddress("5541 Milmar Drive N"), normalizeAddress("1418 W 19TH Street")]);
const READY_ADDRESS_KEYS = new Set(READY_ADDRESSES.map(normalizeAddress));

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

function isReadyAddress(recordAddress) {
  return [...READY_ADDRESS_KEYS].some((allowedKey) => addressMatches(recordAddress, allowedKey));
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

function readCombinedCsv(file, idField) {
  const primaryRows = readCsv(path.join(sourceDir, file));
  const archiveFile = path.join(archiveDir, file);
  const archiveRows = fs.existsSync(archiveFile) ? readCsv(archiveFile) : [];
  const seen = new Set();
  const rows = [];

  for (const row of [...primaryRows, ...archiveRows]) {
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
const readyProperties = properties
  .filter((row) => isReadyAddress(row.property_address))
  .map((row) => ({
    ...row,
    customer_batch_status: "customer_ready_candidate",
    mls_backlog_status: row.mls_id ? "processed_sent_internal_review" : "not_linked",
    processing_status: "ready_for_customer_forward",
  }));

if (readyProperties.length !== READY_ADDRESSES.length) {
  throw new Error(`Expected ${READY_ADDRESSES.length} ready property rows, found ${readyProperties.length}.`);
}

const readyPropertyKeys = new Set(readyProperties.map((row) => normalizeAddress(row.property_address)));
const readyAgentKeys = new Set(readyProperties.map((row) => `${row.listing_agent}|||${row.brokerage}`.toLowerCase()));
const readyAgents = readCombinedCsv("agents.csv", "agent_id")
  .filter(
    (row) =>
      readyAgentKeys.has(`${row.agent_name}|||${row.brokerage}`.toLowerCase()) ||
      readyPropertyKeys.has(normalizeAddress(row.last_property_matched)),
  )
  .map((row) => ({
    ...row,
    customer_batch_status: "customer_ready_candidate",
    processing_status: "ready_for_customer_forward",
  }));

const readyInteractions = readCombinedCsv("interactions.csv", "interaction_id")
  .filter((row) => isReadyAddress(row.property_address))
  .map((row) => ({
    ...row,
    customer_batch_status: "customer_ready_candidate",
    processing_status: "ready_for_customer_forward",
  }));

const propertyColumns = [
  ...Object.keys(properties[0] || {}),
  "customer_batch_status",
  "mls_backlog_status",
  "processing_status",
];
const agentSource = readCombinedCsv("agents.csv", "agent_id");
const interactionSource = readCombinedCsv("interactions.csv", "interaction_id");
writeCsv(path.join(targetDir, "properties.csv"), readyProperties, propertyColumns);
writeCsv(path.join(targetDir, "agents.csv"), readyAgents, [
  ...Object.keys(agentSource[0] || {}),
  "customer_batch_status",
  "processing_status",
]);
writeCsv(path.join(targetDir, "interactions.csv"), readyInteractions, [
  ...Object.keys(interactionSource[0] || {}),
  "customer_batch_status",
  "processing_status",
]);

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
const propertyByMls = new Map(readyProperties.map((row) => [String(row.mls_id || ""), row]));
const backlogRows = readCsv(backlogCsvFile).map((row, index) => {
  const sent = propertyByMls.get(String(row.mls_number || ""));
  const skipped = skippedByMls.get(String(row.mls_number || ""));
  const derivedAddress = fullAddress(row);
  let processingStatus = "not_started";
  let customerBatchStatus = "";
  let statusNote = "";

  if (sent) {
    processingStatus = "processed_sent_internal_review";
    customerBatchStatus = "customer_ready_candidate";
    statusNote = `In clean go-live batch as ${sent.property_address}`;
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

console.log(`Synced clean dashboard snapshot: ${readyProperties.length} properties, ${readyAgents.length} agents, ${readyInteractions.length} interactions`);
console.log(`Synced MLS backlog status rows: ${backlogRows.length}`);
