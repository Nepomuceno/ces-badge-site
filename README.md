# CES3 Badge Arena

> ⚠️ Fun project created with AI. There are no plans for ongoing maintenance or official support.

A React 19 + TanStack Router experience purpose-built for exploring, voting on, and managing CES3 badge contenders. Everything runs locally with Bun, Tailwind CSS, and a lightweight roster-backed authentication layer.

## Quick start (Bun-first)

```bash
bun install
bun run dev
```

- The dev server runs on <http://localhost:3000>.
- API routes such as `/api/allowed-users` are served by TanStack Start alongside the client bundle.

## Useful scripts

| Task | Command |
| --- | --- |
| Install dependencies | `bun install` |
| Start local dev server | `bun run dev` |
| Build for production | `bun run build` |
| Preview the production build | `bun run serve` |
| Run tests | `bun run test` |

Vitest powers the test runner; place specs under `src/**/__tests__` or next to modules using the `.test.ts(x)` suffix.

## Authentication model

- Every teammate signs in with **only their alias**. The UI normalises the value (lowercase, trimmed, and stripping `@example.com` if present).
- If the roster entry includes a `passwordHash`, the sign-in flow requests a password after the alias. The hash is computed as `SHA-256(<password><alias>)`, where `<alias>` is the normalised alias.
- Admin capabilities are granted purely through the roster by setting `"role": "admin"`. There is no global admin password anymore.
- Sessions persist via `localStorage` (`ces3-auth-user`) so refreshes keep a teammate signed in. Use the avatar menu → **Sign out** to clear it.
- The `/account` route lets each user update their display name, set or remove their password, and review logos they submitted or own.

## Roster management

The roster lives in `server/data/allowed-users.json`, surfaced by `/api/allowed-users`.

Each record can include optional profile details:

```json
{
  "alias": "sample.alias",
  "email": "sample.alias@example.com",
  "name": "Sample Alias",
  "role": "admin",
  "logos": ["sample-logo"],
  "passwordHash": "sha256-hash-goes-here"
}
```

- `passwordHash` is optional. When present, it must be the SHA-256 hash of `<password><alias>` using the normalised alias.
- Update entries manually or PATCH them via `/api/allowed-users` with `{ "alias": "…", "name": "…", "passwordHash": "…" }`.
- Admin routes and elevated UI automatically respect the `role` field.

### Import aliases from Microsoft Graph

Use `scripts/import-graph-users.ts` to pull an organisation tree from Microsoft Graph and merge it into `allowed-users.json`.

Requirements:

- A delegated or app-only access token with `User.Read.All` or `Directory.Read.All` scope.
- The user principal names (or emails) for one or more managers whose reporting chains you want to import.

Example (Bash / zsh):

```bash
export GRAPH_TOKEN="$(az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv)"
bun scripts/import-graph-users.ts \
  --token "$GRAPH_TOKEN" \
  --head manager.one@example.com \
  --head manager.two@example.com
```

- Managers listed with `--head` are persisted as `role: "admin"` by default; pass `--admin-head` to override or combine with `--no-include-managers` if you only want their reports.
- Add `--dry-run` to preview the changes without touching the JSON file.
- To sync into a different roster file, add `--file path/to/allowed-users.json`.

## Project layout highlights

- `src/routes` — File-based routes (landing page, gallery, vote flow, scores, favorites, account, etc.).
- `src/state/AuthContext.tsx` — Alias authentication provider, local storage persistence, and roster refresh helpers.
- `src/components/AuthPrompts.tsx` — Shared sign-in panel reused across routes and the header popover.
- `src/routes/account.tsx` — Account management page for updating profile and password settings.
- `src/state/LogoLibraryContext.tsx` — In-memory catalog store plus submission helpers.
- `server/data/allowed-users.json` — Roster "database" used by the authentication layer.

## Deployment notes

- Use Bun in pipelines (`bun run build`) to mimic the local setup.
- Ensure `server/data/allowed-users.json` is deployed alongside the build output. The `/api/allowed-users` route reads and writes this file directly.
- Password changes and display-name edits happen through `/api/allowed-users` on the server; the runtime must have write access to that JSON file in production.
- A production container image can be built via the included `Dockerfile`. Deploy to Azure Container Apps with `./scripts/deploy-container-app.sh` (creates a Basic ACR, log workspace, and container app in `uksouth` within the `ces3` resource group).
- Pass `AZURE_SUBSCRIPTION_ID=<your-subscription-id>` (or ensure the Azure CLI default subscription is already set) before running the deployment script so all resources land in the intended subscription.
- The deployment script now provisions an Azure Files share and mounts it into the container at `DATA_DIR` (default `/app/data`). This keeps `logos.json` and `votes.json` persistent across restarts. Override `STORAGE_ACCOUNT_NAME`, `STORAGE_SHARE_NAME`, or `DATA_DIR` in the environment if you need a different storage layout.
- The repository’s `.gitignore` excludes the default runtime data directory so generated files stay local. Examples that remain untracked:
  - `server/runtime-data/logos.json`
  - `server/runtime-data/votes.json`
  - Any other JSON the app writes under `server/runtime-data/`
  Add your custom `DATA_DIR` path to `.gitignore` if you move the storage location.
- If you need a clean redeploy, set `RESET_APP=true` (or `RESET_ENVIRONMENT=true`) when running the script to delete the existing Container App or the entire environment before provisioning.

## Vote audit logging

- Every recorded matchup now appends a structured line to `vote-events.ndjson` inside the configured `DATA_DIR`.
- Entries are newline-delimited JSON objects with the shape:
  - `type`: either `"vote-recorded"` or `"votes-reset"`
  - `occurredAt`: ISO-8601 timestamp of when the event was captured
  - `contestId`: contest the action belongs to
  - `winner` / `loser`: include ids, names, codenames, and Elo stats before/after the match
  - `voterHash`: hashed identifier if supplied by the client (may be `null`)
  - `matchTimestamp`: raw millisecond timestamp from the Elo history entry
- Vote resets (triggered via the admin UI or API) emit a `votes-reset` entry that notes why the reset happened and how many matches existed beforehand.
- Use `jq` or any log shipper that understands ndjson to stream the file for investigations when votes appear to go missing.

## Vote data backups

- Persistent data writes (`votes.json`, `logos.json`) are performed atomically and flushed to disk before replacing the original file, limiting the chance of partial writes.
- After every successful write, the final JSON snapshot is copied into `DATA_DIR/backups/<name>/` using a timestamp + UUID filename (for example: `backups/votes/2025-10-06T07-55-12-345Z-a1b2c3.json`). Votes throttle backups to roughly one snapshot every 15 seconds during heavy traffic (resets always force a snapshot) while retaining the latest ~200 entries; logos refreshes are less frequent (~5 minutes, max 24 entries).
- If the active `votes.json` or `logos.json` ever becomes unreadable (for example, truncated during a crash), the server automatically restores the newest valid backup on the next read.
- You can manually roll back by copying a snapshot from the backup folder over the live file; the next write will produce a fresh backup entry.
- Vote resets still preserve prior history—use the backup snapshots to recover the pre-reset standings if the action was accidental.

## Troubleshooting

- **Alias not found** → Confirm the alias exists in the roster (comparison uses the lowercased value). Update the JSON if the teammate is missing.
- **Password required** → The alias has `passwordHash` set. Use the account page to clear it or supply the matching password.
- **Wrong password** → Password hashes combine the raw password + normalised alias. Double-check the value or reset it from the account page.
- **Stuck session** → Clear `localStorage` entry `ces3-auth-user` or sign out via the avatar menu.

## Further reading

- [TanStack Router](https://tanstack.com/router)
- [TanStack Start](https://tanstack.com/router/latest/docs/framework/react/start/overview)
- [Tailwind CSS](https://tailwindcss.com/)
