#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { parse } = require("csv-parse/sync");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "private-data"));
const RUN_STATE_DIR = path.resolve(
  process.env.RUN_STATE_DIR || path.join(__dirname, "private-data", "run-state"),
);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DASHBOARD_USERNAME = process.env.DASHBOARD_USERNAME || "simplydwell";
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "";

const DATASETS = {
  agents: {
    label: "Agents",
    slug: "agents",
    file: "agents.csv",
    idField: "agent_id",
    requiredHeaders: [
      "agent_id",
      "agent_name",
      "brokerage",
      "email",
      "phone",
      "market_city",
      "review_status",
      "outreach_status",
      "data_confidence",
    ],
    sensitiveFields: ["email", "phone"],
  },
  properties: {
    label: "Properties",
    slug: "properties",
    file: "properties.csv",
    idField: "property_id",
    requiredHeaders: [
      "property_id",
      "property_address",
      "city",
      "state",
      "mls_id",
      "primary_listing_url",
      "listing_agent",
      "photo_status",
      "outreach_status",
    ],
    sensitiveFields: ["agent_email", "agent_phone"],
  },
  interactions: {
    label: "Email Reviews",
    slug: "interactions",
    file: "interactions.csv",
    idField: "interaction_id",
    requiredHeaders: [
      "interaction_id",
      "agent_id",
      "agent_name",
      "date",
      "property_address",
      "draft_type",
      "message_status",
      "next_action",
    ],
    sensitiveFields: [],
  },
  mlsBacklog: {
    label: "MLS Backlog",
    slug: "mls-backlog",
    file: "mls-backlog.csv",
    idField: "mls_number",
    requiredHeaders: [
      "backlog_row",
      "mls_number",
      "address",
      "city",
      "state",
      "postal_code",
      "list_price",
      "days_on_market",
      "listing_agent",
      "agency_name",
      "photo_url",
      "processing_status",
      "customer_batch_status",
      "status_note",
      "source_file",
    ],
    sensitiveFields: [],
  },
};

function isAuthorized(req) {
  if (!DASHBOARD_PASSWORD && !IS_PRODUCTION) return true;
  if (!DASHBOARD_PASSWORD && IS_PRODUCTION) return false;

  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const username = separator === -1 ? "" : decoded.slice(0, separator);
  const password = separator === -1 ? "" : decoded.slice(separator + 1);
  return username === DASHBOARD_USERNAME && password === DASHBOARD_PASSWORD;
}

function requireAuth(req, res) {
  if (isAuthorized(req)) return true;

  res.writeHead(401, {
    "www-authenticate": 'Basic realm="Simply Dwell Dashboard", charset="UTF-8"',
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(
    !DASHBOARD_PASSWORD && IS_PRODUCTION
      ? "Dashboard password is not configured. Set DASHBOARD_PASSWORD before running in production."
      : "Authentication required.",
  );
  return false;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

function readDataset(key) {
  const dataset = DATASETS[key];
  if (!dataset) {
    throw Object.assign(new Error("Unknown dataset."), { statusCode: 404 });
  }

  const filePath = path.join(DATA_DIR, dataset.file);
  const stat = fs.statSync(filePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const records = parse(raw, {
    bom: true,
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
  });
  const headers = records[0] ? Object.keys(records[0]) : parse(raw, { bom: true, to_line: 1 })[0] || [];
  const missingHeaders = dataset.requiredHeaders.filter((header) => !headers.includes(header));
  const parsed = { headers, records };
  return {
    ...dataset,
    key,
    filePath,
    updatedAt: stat.mtime.toISOString(),
    bytes: stat.size,
    raw,
    ...parsed,
    validation: {
      ok: missingHeaders.length === 0,
      requiredHeaders: dataset.requiredHeaders,
      missingHeaders,
      status: missingHeaders.length === 0 ? "ok" : "missing_headers",
    },
  };
}

function publicDataset(key) {
  const loaded = readDataset(key);
  return {
    key: loaded.key,
    label: loaded.label,
    headers: loaded.headers,
    records: loaded.records,
    updatedAt: loaded.updatedAt,
    rows: loaded.records.length,
    columns: loaded.headers.length,
    validation: loaded.validation,
  };
}

function countBy(records, field) {
  const counts = new Map();
  for (const record of records) {
    const value = String(record[field] || "Unknown").trim() || "Unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function backlogBatchPie(records) {
  const counts = {
    Pending: 0,
    "Email Sent": 0,
  };

  for (const record of records) {
    const status = String(record.customer_batch_status || "").trim();
    if (status === "do_not_outreach") continue;
    if (status === "customer_ready_candidate") {
      counts["Email Sent"] += 1;
    } else {
      counts.Pending += 1;
    }
  }

  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}

function backlogAgeBuckets(records) {
  const buckets = [
    { name: "0-30 days", count: 0, min: 0, max: 30 },
    { name: "31-60 days", count: 0, min: 31, max: 60 },
    { name: "61-90 days", count: 0, min: 61, max: 90 },
    { name: "91-180 days", count: 0, min: 91, max: 180 },
    { name: "181+ days", count: 0, min: 181, max: Infinity },
  ];

  for (const record of records) {
    const days = Number(record.days_on_market || 0);
    const bucket = buckets.find((row) => days >= row.min && days <= row.max);
    if (bucket) bucket.count += 1;
  }

  return buckets.map(({ name, count }) => ({ name, count }));
}

function dateCounts(records, field, limit = 10) {
  return countBy(records, field)
    .filter((row) => row.name !== "Unknown")
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(-limit);
}

function includesText(record, patterns) {
  const haystack = Object.values(record).join(" ").toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function sentEmailRecord(record) {
  return String(record.message_status || record.draft_type || "").toLowerCase().includes("sent");
}

function propertyMatchesAgent(property, agent) {
  const propertyEmail = normalizeText(property.agent_email);
  const agentEmail = normalizeText(agent.email);
  if (propertyEmail && agentEmail && propertyEmail === agentEmail) return true;

  const propertyPhone = normalizePhone(property.agent_phone);
  const agentPhone = normalizePhone(agent.phone);
  if (propertyPhone && agentPhone && propertyPhone === agentPhone) return true;

  const listingAgent = normalizeText(property.listing_agent);
  const agentName = normalizeText(agent.agent_name);
  if (!listingAgent || !agentName || listingAgent !== agentName) return false;

  const propertyBrokerage = normalizeText(property.brokerage);
  const agentBrokerage = normalizeText(agent.brokerage);
  return !propertyBrokerage || !agentBrokerage || propertyBrokerage === agentBrokerage;
}

function readRunStateHealth() {
  if (!fs.existsSync(RUN_STATE_DIR)) {
    return {
      exists: false,
      directory: RUN_STATE_DIR,
      total: 0,
      byStatus: [],
      byRunType: [],
      records: [],
      recent: [],
    };
  }

  const files = fs
    .readdirSync(RUN_STATE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const parsed = files.map((name) => {
    const match = name.match(/^(.+?)\.(\d{8}T\d{6}Z)\.([^.]+)\.json$/);
    const currentMatch = name.match(/^(.+?)\.(current)\.json$/);
    return {
      file: name,
      runType: match ? match[1] : currentMatch ? currentMatch[1] : "unknown",
      timestamp: match ? match[2] : "",
      status: match ? match[3] : currentMatch ? currentMatch[2] : "unknown",
    };
  });

  return {
    exists: true,
    directory: RUN_STATE_DIR,
    total: parsed.length,
    byStatus: countBy(parsed, "status"),
    byRunType: countBy(parsed, "runType"),
    records: parsed,
    recent: parsed.slice(-20).reverse(),
  };
}

function compactRecord(record, fields) {
  return Object.fromEntries(fields.map((field) => [field, record[field] || ""]));
}

function buildExceptions(loaded = loadAllData()) {
  const { agents, properties, mlsBacklog } = loaded;
  const runState = readRunStateHealth();
  const categories = [
    {
      key: "properties_missing_listing_agent",
      label: "Properties missing listing agent",
      records: properties.records
        .filter((record) => !String(record.listing_agent || "").trim())
        .map((record) => compactRecord(record, ["property_id", "property_address", "city", "state", "outreach_status"])),
    },
    {
      key: "properties_missing_agent_contact",
      label: "Properties missing agent email and phone",
      records: properties.records
        .filter((record) => !String(record.agent_email || "").trim() && !String(record.agent_phone || "").trim())
        .map((record) =>
          compactRecord(record, ["property_id", "property_address", "listing_agent", "brokerage", "outreach_status"]),
        ),
    },
    {
      key: "agents_missing_contact",
      label: "Agents missing email and phone",
      records: agents.records
        .filter((record) => !String(record.email || "").trim() && !String(record.phone || "").trim())
        .map((record) => compactRecord(record, ["agent_id", "agent_name", "brokerage", "market_city", "review_status"])),
    },
    {
      key: "agents_need_review",
      label: "Agents needing review",
      records: agents.records
        .filter((record) => String(record.review_status || "").trim() === "needs_review")
        .map((record) => compactRecord(record, ["agent_id", "agent_name", "brokerage", "data_confidence", "notes"])),
    },
    {
      key: "blocked_run_states",
      label: "Blocked run-state files",
      records: runState.records.filter((record) => record.status === "blocked"),
    },
    {
      key: "backlog_do_not_outreach",
      label: "Backlog do-not-outreach holds",
      records: mlsBacklog.records
        .filter((record) => record.customer_batch_status === "do_not_outreach")
        .map((record) =>
          compactRecord(record, ["mls_number", "address", "listing_agent", "processing_status", "status_note"]),
        ),
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    total: categories.reduce((sum, category) => sum + category.records.length, 0),
    categories: categories.map((category) => ({
      key: category.key,
      label: category.label,
      count: category.records.length,
      records: category.records.slice(0, 25),
    })),
  };
}

function loadAllData() {
  return Object.fromEntries(Object.keys(DATASETS).map((key) => [key, readDataset(key)]));
}

function buildAgentDrilldown(
  loaded = {
    agents: readDataset("agents"),
    properties: readDataset("properties"),
    interactions: readDataset("interactions"),
  },
) {
  const { agents, properties, interactions } = loaded;

  const rows = agents.records.map((agent) => {
    const agentId = String(agent.agent_id || "");
    const agentName = normalizeText(agent.agent_name);
    const matchedProperties = properties.records
      .filter((property) => propertyMatchesAgent(property, agent))
      .map((property) =>
        compactRecord(property, [
          "property_id",
          "property_address",
          "city",
          "state",
          "mls_id",
          "listing_agent",
          "brokerage",
          "photo_status",
          "email_sent_to_zac",
          "dashboard_status",
          "customer_batch_status",
          "approval_status",
        ]),
      );
    const matchedInteractions = interactions.records
      .filter((interaction) => {
        if (agentId && interaction.agent_id === agentId) return true;
        return agentName && normalizeText(interaction.agent_name) === agentName;
      })
      .map((interaction) =>
        compactRecord(interaction, [
          "interaction_id",
          "date",
          "property_address",
          "draft_type",
          "message_status",
          "next_action",
          "next_action_date",
          "notes",
        ]),
      );

    return {
      agent_id: agent.agent_id,
      agent_name: agent.agent_name,
      brokerage: agent.brokerage,
      market_city: agent.market_city,
      contactCoverage: agent.email && agent.phone ? "Email + phone" : agent.email ? "Email" : agent.phone ? "Phone" : "Missing",
      propertyCount: matchedProperties.length,
      emailCount: matchedInteractions.filter(sentEmailRecord).length,
      properties: matchedProperties,
      emails: matchedInteractions,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    agents: rows.sort(
      (a, b) =>
        b.propertyCount - a.propertyCount ||
        b.emailCount - a.emailCount ||
        String(a.agent_name || "").localeCompare(String(b.agent_name || "")),
    ),
  };
}

function buildOverview() {
  const loaded = loadAllData();
  const { agents, properties, interactions, mlsBacklog } = loaded;
  const runState = readRunStateHealth();
  const exceptions = buildExceptions(loaded);

  const beforeAfterCount = properties.records.filter((record) =>
    includesText(record, ["before/after", "panels attached", "concept panels attached"]),
  ).length;
  const missingAgentCount = properties.records.filter((record) => !String(record.listing_agent || "").trim()).length;
  const missingContactCount = agents.records.filter((record) => !record.email && !record.phone).length;
  const internalReviewCount = interactions.records.filter((record) =>
    String(record.message_status || record.draft_type || "").toLowerCase().includes("sent"),
  ).length;
  const needsReviewAgents = agents.records.filter((record) => record.review_status === "needs_review").length;
  const backlogReadyCount = mlsBacklog.records.filter(
    (record) => record.customer_batch_status === "customer_ready_candidate",
  ).length;
  const backlogNotStartedCount = mlsBacklog.records.filter((record) => record.processing_status === "not_started").length;
  const backlogProcessedCount = mlsBacklog.records.filter((record) =>
    String(record.processing_status || "").startsWith("processed"),
  ).length;
  const backlogHoldCount = mlsBacklog.records.filter(
    (record) => record.customer_batch_status && record.customer_batch_status !== "customer_ready_candidate",
  ).length;
  const downloadSets = Object.entries(DATASETS).map(([key, dataset]) => {
    const loadedDataset = loaded[key];
    return {
      key,
      slug: dataset.slug,
      label: dataset.label,
      rows: loadedDataset.records.length,
      columns: loadedDataset.headers.length,
      updatedAt: loadedDataset.updatedAt,
      bytes: loadedDataset.bytes,
      validation: loadedDataset.validation,
    };
  });
  const loadedDatasets = Object.values(loaded);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      dataDir: DATA_DIR,
      runStateDir: RUN_STATE_DIR,
    },
    validation: {
      ok: loadedDatasets.every((dataset) => dataset.validation.ok),
      datasets: Object.fromEntries(
        loadedDatasets.map((dataset) => [
          dataset.key,
          {
            rows: dataset.records.length,
            columns: dataset.headers.length,
            updatedAt: dataset.updatedAt,
            validation: dataset.validation,
          },
        ]),
      ),
      runState: {
        exists: runState.exists,
        total: runState.total,
      },
    },
    metrics: {
      agentCount: agents.records.length,
      propertyCount: properties.records.length,
      interactionCount: interactions.records.length,
      backlogCount: mlsBacklog.records.length,
      backlogReadyCount,
      backlogNotStartedCount,
      backlogProcessedCount,
      backlogHoldCount,
      runStateCount: runState.total,
      blockedRunStateCount: (runState.byStatus.find((row) => row.name === "blocked") || { count: 0 }).count,
      currentRunStateCount: (runState.byStatus.find((row) => row.name === "current") || { count: 0 }).count,
      exceptionCount: exceptions.total,
      beforeAfterCount,
      internalReviewCount,
      needsReviewAgents,
      missingAgentCount,
      missingContactCount,
    },
    distributions: {
      propertyOutreach: countBy(properties.records, "outreach_status").slice(0, 8),
      propertyPhotoStatus: countBy(properties.records, "photo_status").slice(0, 8),
      agentReviewStatus: countBy(agents.records, "review_status").slice(0, 8),
      interactionNextAction: countBy(interactions.records, "next_action").slice(0, 8),
      backlogProcessingStatus: countBy(mlsBacklog.records, "processing_status").slice(0, 8),
      backlogCustomerBatchStatus: backlogBatchPie(mlsBacklog.records),
      backlogCityCoverage: countBy(mlsBacklog.records, "city").slice(0, 8),
      backlogAgeBuckets: backlogAgeBuckets(mlsBacklog.records),
      emailReviewActivity: dateCounts(interactions.records, "date", 10),
      runStateStatus: runState.byStatus,
    },
    recent: {
      properties: properties.records.slice(-12).reverse(),
      interactions: interactions.records.slice(-12).reverse(),
      mlsBacklog: mlsBacklog.records
        .filter((record) => record.processing_status !== "not_started")
        .slice(-12)
        .reverse(),
      runStates: runState.recent.slice(0, 8),
    },
    exceptions: exceptions.categories,
    repository: downloadSets,
  };
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function worksheetXml(name, headers, records) {
  const rows = [
    `<Row>${headers.map((header) => `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`).join("")}</Row>`,
    ...records.map((record) =>
      `<Row>${headers
        .map((header) => `<Cell><Data ss:Type="String">${escapeXml(record[header] || "")}</Data></Cell>`)
        .join("")}</Row>`,
    ),
  ].join("");

  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${rows}</Table></Worksheet>`;
}

function workbookXml() {
  const sheets = Object.entries(DATASETS)
    .map(([key, dataset]) => {
      const loaded = readDataset(key);
      return worksheetXml(dataset.label, loaded.headers, loaded.records);
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheets}
</Workbook>`;
}

function serveStatic(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath);
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
  };

  res.writeHead(200, {
    "content-type": contentTypes[ext] || "application/octet-stream",
    "cache-control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function route(req, res) {
  if (!requireAuth(req, res)) return;

  const url = new URL(req.url, "http://localhost");
  const csvMatch = url.pathname.match(/^\/api\/downloads\/([a-z-]+)\.csv$/);
  const datasetBySlug = Object.fromEntries(Object.entries(DATASETS).map(([key, dataset]) => [dataset.slug, key]));

  try {
    if (url.pathname === "/api/overview" || url.pathname === "/api/summary") {
      const overview = buildOverview();
      sendJson(
        res,
        200,
        url.pathname === "/api/summary"
          ? {
              generatedAt: overview.generatedAt,
              source: overview.source,
              validation: overview.validation,
              metrics: overview.metrics,
              distributions: overview.distributions,
            }
          : overview,
      );
    } else if (url.pathname === "/api/properties") {
      sendJson(res, 200, publicDataset("properties"));
    } else if (url.pathname === "/api/agents") {
      sendJson(res, 200, publicDataset("agents"));
    } else if (url.pathname === "/api/interactions") {
      sendJson(res, 200, publicDataset("interactions"));
    } else if (url.pathname === "/api/mls-backlog") {
      sendJson(res, 200, publicDataset("mlsBacklog"));
    } else if (url.pathname === "/api/run-state") {
      sendJson(res, 200, readRunStateHealth());
    } else if (url.pathname === "/api/exceptions") {
      sendJson(res, 200, buildExceptions());
    } else if (url.pathname === "/api/agent-drilldown") {
      sendJson(res, 200, buildAgentDrilldown());
    } else if (url.pathname === "/api/repository") {
      const payload = Object.fromEntries(
        Object.keys(DATASETS).map((key) => {
          const loaded = readDataset(key);
          return [
            key,
            {
              key: loaded.key,
              label: loaded.label,
              headers: loaded.headers,
              records: loaded.records,
              updatedAt: loaded.updatedAt,
              rows: loaded.records.length,
              columns: loaded.headers.length,
              validation: loaded.validation,
            },
          ];
        }),
      );
      sendJson(res, 200, payload);
    } else if (csvMatch && datasetBySlug[csvMatch[1]]) {
      const loaded = readDataset(datasetBySlug[csvMatch[1]]);
      sendText(res, 200, loaded.raw, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="simply-dwell-${DATASETS[loaded.key].slug}.csv"`,
      });
    } else if (url.pathname === "/api/downloads/simply-dwell-data.xls") {
      sendText(res, 200, workbookXml(), {
        "content-type": "application/vnd.ms-excel; charset=utf-8",
        "content-disposition": 'attachment; filename="simply-dwell-data.xls"',
      });
    } else {
      serveStatic(req, res);
    }
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Unexpected server error." });
  }
}

http.createServer(route).listen(PORT, () => {
  console.log(`Simply Dwell dashboard listening on ${PORT}`);
});
