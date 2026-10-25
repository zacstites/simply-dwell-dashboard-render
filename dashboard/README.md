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
- `dashboard/private-data/mls-backlog.csv`
- `dashboard/private-data/run-state/*.json`

Refresh that snapshot from the Simply Dwell lead-generation source files with:

```sh
npm run sync:data
```

The sync builds a clean go-live snapshot from:

- `/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/agent-database/agents.csv`
- `/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/agent-database/properties.csv`
- `/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/agent-database/interactions.csv`
- `/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/agent-database/archive/go-live-2026-10-11-full/*.csv`
- `/Users/zac/.openclaw/workspace-simply-dwell-lead-generation/data/nightly-leads/.run-state/`
- `/Users/zac/.openclaw/workspace-simply-dwell-lead-generation-backlog/state/backlog-example-state.json`
- `/Users/zac/.openclaw/workspace-simply-dwell-lead-generation-backlog/state/realMLS-active-vacant-residential-backlog-2026-10-06.csv`

The live dashboard snapshot intentionally keeps only the audited Oct. 10-11 customer-ready batch in the agent/property/interaction tables. Older derived dashboard rows are excluded from the live snapshot without deleting raw source files, MLS exports, archive evidence, or quarantine files.

Do not mutate these shared files without explicit approval and a parse-check before/after.

Set `DATA_DIR` to point at another directory with `agents.csv`, `properties.csv`, `interactions.csv`, and `mls-backlog.csv`.
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
- `/api/mls-backlog`
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
- pre-stage intake disk: `prestage-intakes`, mounted at `/var/data`
- pre-stage storage env var: `PRESTAGE_STORAGE_DIR=/var/data/prestage-intakes`
- optional transcription env vars: `OPENAI_API_KEY=<set in Render secret env>` and `OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe`

Start private/basic-auth by default. Do not deploy publicly or change production settings without explicit approval.

## Data Repository

The deployed app serves the committed or bundled CSV/run-state snapshot in `dashboard/private-data/` behind basic auth.

`npm run sync:data` refreshes `dashboard/private-data/` from the Simply Dwell lead-generation CSVs and run-state files.

Download endpoints:

- `/api/downloads/agents.csv`
- `/api/downloads/properties.csv`
- `/api/downloads/interactions.csv`
- `/api/downloads/mls-backlog.csv`
- `/api/downloads/simply-dwell-data.xls`

## ZIP campaigns
The authenticated /campaigns.html page creates isolated research jobs with exact ZIP, inclusive price and days-on-market ranges, and a maximum reviewer lead count. The minimum price remains $200,000. No customer/agent blast delivery is enabled. Reviewer emails remain Zac-only through the shared guarded sender; rejected contacts are retained in campaign results.
Campaign records are stored in CAMPAIGN_STORAGE_DIR or PRESTAGE_STORAGE_DIR/campaigns on the existing persistent disk, separate from snapshot publication. No new paid disk/service is required. Browser endpoints use dashboard Basic auth plus JSON and same-origin write checks. Worker endpoints require a distinct CAMPAIGN_WORKER_TOKEN provisioned as a Render secret and mode-0600 local worker secret; never commit it.
The simply-dwell-campaigns worker polls read-only, claims a 25-minute lease and can resume a campaign via queued status. Cancel prevents further claims/updates; in-flight already-submitted email cannot be recalled. Unknown DOM cannot qualify. Existing backlog/nightly workers and their schedules are unchanged. Shared sent history prevents cross-bot duplicates. Run node --test tests/campaigns.test.cjs for validation and API lifecycle coverage.

## Lead Source provenance
Property records, agent property drilldowns and CSV/Excel exports include `lead_source` with exact labels `New MLS Listing`, `MLS Backlog`, and `Zip Code Blast`. Multiple evidenced discovery workflows remain joined rather than overwriting one another. `lead_source_history` stores the evidence for each attribution. Unknown origins display `Source not recorded`, never a guessed default.
The snapshot sync derives provenance from specific email/campaign workflow evidence paths and the backlog worker's actual processed/skipped MLS registry, plus matching interaction evidence. Generic backlog status, a property merely appearing in an export, and a pricing corroboration source do not establish discovery origin. Earlier published snapshot provenance is merged on subsequent syncs, preserving multi-source history as live row evidence changes. No send routing or source CSV schema is altered.

### Campaign research and customer projection
`campaign-policy.js` is the customer visibility boundary. Worker endpoints retain full audit rows; browser endpoints return only recently verified Active Residential, in-filter rows with source evidence and an attributed agent. Legacy rows without this evidence remain internal, not deleted. Customer counts refer to visible listings; historical sent counts remain separate.
Campaign updates accept at most one changed property and never delete existing research/send history. `retryAfterSeconds` on queued updates persists `retryAt`; both next and claim enforce it. The worker's local `research-control.py` retains a single current property and serial request/cooldown state across runs. These controls do not change other agents' provider quotas.
