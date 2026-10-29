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

## GitHub/Render publication recovery

The live remote is `render-live` (`zacstites/simply-dwell-dashboard-render`, branch `main`), serving https://simply-dwell-dashboards.onrender.com (Render `srv-db5broh42hec738dllk0`). The campaign checkout is `/Users/zac/.openclaw/workspace/simply-dwell-campaign-fix`; the reconciliation checkout is `/Users/zac/.openclaw/workspace/simply-dwell-deploy-recovery`. These share the Git config in `/Users/zac/.openclaw/workspace-simply-dwell-dashboards/.git`.

The repo-local URL-scoped credential helper for the live repository clears inherited helpers and obtains the native `zacstites` GitHub CLI credential with `env -u GH_TOKEN -u GITHUB_TOKEN gh auth token --hostname github.com`. Never print the token. Plain `git fetch render-live main` and `git push render-live HEAD:main` use that helper. Do not run `gh auth setup-git`: inherited environment credentials can select a different read-only account. Do not change global helpers. Config was backed up beside `.git/config` before repair.

Fetch and compare `render-live/main` before every push; reconcile divergent changes in a clean worktree, preserve existing tests and unrelated work, and never force push. Run `npm run check` and `node --test tests/*.test.cjs` in `dashboard/`. Render auto-deploy may be disabled: inspect current service/deploys before triggering a single deploy, normalize Render responses with `record.deploy ?? record`, and follow the matching SHA to live. The local `campaign-deploy-admin.py verify` creates a campaign; do not use it for read-only verification.

Require a GitHub deployment status for the exact SHA and authenticated byte matching of `/`, `/main.js`, `/styles.css`, plus read-only `/api/email-operations` and `/api/summary`. Check missing/wrong authentication returns 401. Never send mail, create campaigns, replace the service, or refresh snapshots as part of a deployment smoke check.

For loopback integration tests under an agent with inherited proxy variables, use `env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy NO_PROXY=localhost,127.0.0.1 NODE_USE_ENV_PROXY=0 node --test tests/*.test.cjs` from `dashboard/`. Install locked dependencies with `npm ci` in a new checkout before testing.


## Production email cutover (2026-10-28)

Email Operations switches on server time at **2026-10-28 20:00 America/New_York** (2026-10-29T00:00Z). Before that, the API exposes `productionCutover` alongside legacy reporting. After it, CSV interaction/test/uncertain records and legacy collector events cannot contribute to the email view. Existing browser tabs refresh at the boundary and every 30 seconds. A missing production snapshot fails closed to no counted sends, with unavailable coverage.

`production-policy.json` mirrors the shared private policy `/Users/zac/.openclaw/customer-mail/simply-dwell/production-policy.json`; sync refuses a mismatch. First eligible direct-send evidence is **2026-10-29 09:00 Eastern**. The separate `private-data/email-production.json` projection accepts only `simply-dwell-production-v1` journals in `sent-items-verified`, a mailbox message ID/time, exact single-recipient To agreement, the expected sender, no CC/BCC, and no internal reviewer recipient. Duplicate message IDs count once. Existing journals are read-only and never replayed. Replies/opens remain unavailable without independent collection.

The local snapshot publisher includes the JSON in its protected Render secret archive, permits its intentionally empty events array, hashes it, and verifies exact bytes using the authenticated `/api/downloads/email-production.json` route. No source data enters Git publication.

Private historical display evidence was copied to `/Users/zac/.openclaw/workspace-simply-dwell-dashboards/data/production-cutover-archive-20261028/` (ignored by Git, parent mode 0700), with CSV SHA-256 manifest, run-state and original journals. Canonical business CSVs, full duplicate/no-resend/uncertain history, source queues and eligible unsent work remain intact. Other dashboard sections, pre-stage intake and campaigns are unchanged. The archive is not a queue and grants no send authorization.

Verify with `node --test tests/email-production.test.cjs` and `python3 tests/email-cutover-http.py`; the latter uses synthetic fixtures to prove authenticated APIs at one second before cutover, exactly at cutover, and next-morning opening without sending mail or starting workers.

### Production originating bot attribution

`email-production.js` reads explicit `sourceBot` from the verified transport journal: `cortona` → Backlog / Cortona; `lead-generation` → Daily MLS Email; `campaigns` → ZIP Campaign (the `simply-dwell-` prefixed agent IDs are also accepted). Transport must set this from its validated source workspace, never request-supplied display text. Missing/unrecognized identity is Unknown; no guess from property, campaign, subject, CSV, or legacy `bot` field is made. The private snapshot retains `botProvenance` with the journal source identity; API output normalizes that identity again instead of trusting a display label. Existing journal snapshot sync carries this automatically. Historical journals are not rewritten.

Production `byBot` counts cover all verified, deduplicated message IDs and sum to the Sent total. The originating-bot selector filters the latest 200 displayed deliveries; the UI states that scope explicitly. Counts and filters are hidden in the pre-cutover historical view. The 8 PM October 28 cutoff and 9 AM October 29 first-send boundary are unchanged. Historical reviewer/test exclusion from transport dedup is owned by transport, not this reporting projection.

## All customer reporting uses verified production sends (2026-10-29)
After the production cutoff, Overview, agents, properties, interactions, MLS Backlog reporting, drilldowns, repository and CSV/Excel downloads derive exclusively from verified events in email-production.json. Historical source CSVs and worker queues remain private and unchanged. Backlog reporting shows only properties contacted by the backlog source, not its internal research queue. Missing production evidence yields empty views with unavailable validation, never historical fallback. Properties and agents deduplicate by address/recipient; interactions deduplicate by verified message ID. Unavailable enrichment is blank, not borrowed from historical test rows.
The authenticated /api/snapshot-hashes returns backing snapshot hashes and row counts for the existing publisher, without exposing historical rows in customer downloads. The deployed publisher must verify this manifest rather than expecting the projected CSV exports to equal raw snapshots. Pre-stage and campaign execution/storage remain unchanged.
Checks: node --test tests/*.test.cjs; python3 tests/email-cutover-http.py; python3 tests/customer-production-http.py.
