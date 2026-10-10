#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const sourceDir = "/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/agent-database";
const sourceRunStateDir =
  "/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/nightly-leads/.run-state";
const targetDir = path.join(root, "dashboard", "private-data");
const targetRunStateDir = path.join(targetDir, "run-state");
const files = ["agents.csv", "properties.csv", "interactions.csv"];

fs.mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  const source = path.join(sourceDir, file);
  const target = path.join(targetDir, file);
  fs.copyFileSync(source, target);
  console.log(`Synced ${file}`);
}

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
