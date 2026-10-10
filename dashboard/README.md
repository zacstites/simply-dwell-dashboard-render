# Simply Dwell Dashboards

Private dashboard surface for Simply Dwell lead sales data and reporting work.

## Intended Scope

- pipeline counts by source, status, and review/send state
- property table with address, price, listing links, photo status, furniture set, listing agent, and latest interaction
- agent table with contact coverage and interaction history
- MLS backlog progress for vacant-home review
- email-review history, including concept-panel attachment status
- data-quality exceptions and human-review queues

## Data Sources

The app is read-only. By default it reads from the local snapshot directory:

- `dashboard/private-data/agents.csv`
- `dashboard/private-data/properties.csv`
- `dashboard/private-data/interactions.csv`
- `dashboard/private-data/run-state/*.json`

Refresh that snapshot from the Simply Dwell lead-generation source files with:

```sh
npm run sync:data
```

The sync copies from:

- `/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/agent-database/agents.csv`
- `/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/agent-database/properties.csv`
- `/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/agent-database/interactions.csv`
- `/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/nightly-leads/.run-state/`

Do not mutate these shared files without explicit approval and a parse-check before/after.

Set `DATA_DIR` to point at another directory with `agents.csv`, `properties.csv`, and `interactions.csv`.
Set `RUN_STATE_DIR` to point at another nightly run-state directory.

## Local Development

```sh
cd dashboard
npm install
npm run sync:data
npm start
```

Open `http://localhost:3000`.

Local development allows access without a password when `NODE_ENV` is not `production` and `DASHBOARD_PASSWORD` is empty.

Useful commands:

```sh
npm run check
npm run sync:data
PORT=3001 npm start
```

Validation/status is visible in the dashboard and includes row counts, required-header checks, run-state counts, and exception counts.

API endpoints:

- `/api/summary`
- `/api/properties`
- `/api/agents`
- `/api/interactions`
- `/api/run-state`
- `/api/exceptions`
- `/api/repository`

## Deployment

Target host: Render.

The dashboard is a Node web service:

- build command: `npm install`
- start command: `npm start`
- username env var: `DASHBOARD_USERNAME=simplydwell`
- password env var: `DASHBOARD_PASSWORD=<set in Render secret env>`
- set `NODE_ENV=production` so missing `DASHBOARD_PASSWORD` blocks access
- optional `DATA_DIR=/opt/render/project/src/dashboard/private-data`
- optional `RUN_STATE_DIR=/opt/render/project/src/dashboard/private-data/run-state`

Start private/basic-auth by default. Do not deploy publicly or change production settings without explicit approval.

## Data Repository

The deployed app serves the committed or bundled CSV/run-state snapshot in `dashboard/private-data/` behind basic auth.

`npm run sync:data` refreshes `dashboard/private-data/` from the Simply Dwell lead-generation CSVs and run-state files.

Download endpoints:

- `/api/downloads/agents.csv`
- `/api/downloads/properties.csv`
- `/api/downloads/interactions.csv`
- `/api/downloads/simply-dwell-data.xls`
