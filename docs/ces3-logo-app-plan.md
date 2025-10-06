# CES3 Logo Selection Experience — Technical Plan

## Goals

- Present an authenticated logo-selection experience tailored to CES3 team needs.
- Provide a lightweight alias-only sign-in flow, with optional per-alias passwords stored as salted SHA-256 hashes.
- Remove TanStack demo scaffolding and align the UI with CES3 branding.
- Provide clear documentation so future contributors can configure credentials and run the project quickly.
- Expose an account hub so teammates can self-manage their display name, password, and logo history.

## Information Architecture

| Route | Purpose | Notes |
|-------|---------|-------|
| `/` | Landing page with quick access to the gallery and key actions. | Displays a hero, CTA to explore logos, and highlights brand pillars. |
| `/gallery` | Primary catalog of available logo variants with filtering. | Grid view with search/filter chips for colorway, background, usage tags. |
| `/gallery/$logoId` | Focus view for a specific logo variant. | Shows previews, download links, usage guidance. Route guarded by auth. |
| `/guidelines` | Brand guidelines overview. | Static content with downloadable PDF (placeholder) and key do/don't lists. |
| `/favorites` | Personal shortlist saved client-side per user. | Uses local storage keyed by the authenticated alias. Auth required. |
| `/vote` | Pairwise ELO voting flow. | Presents two logos at a time, records preference, updates rankings. Auth required. |
| `/account` | Self-service account management. | Update display name, manage alias password, and review submitted/owned logos. |
| `/admin/uploads` *(optional in future)* | Placeholder for future admin upload tooling. | Omitted from first implementation but reserved in nav feature flags. |

> Authenticated routes render inline sign-in prompts when access is required instead of redirecting users away from the current context.

## Component Overview

- `AppShell` — Wraps header, footer, and outlet; handles auth-driven layout adjustments.
- `Header` — CES3 branding, responsive nav, and an avatar menu exposing account + sign-out actions.
- `LogoGallery` — Fetches catalog data, manages filters, renders `LogoCard` items.
- `LogoCard` — Preview tile with quick actions (view details, add/remove favorite, copy asset link).
- `LogoDetailPanel` — Detailed view with metadata, download buttons, compliance reminders.
- `GuidelinesPage` — Rich text/markdown content with highlight cards.
- `FavoritesPage` — Renders saved logos with same `LogoCard` component in compact layout.
- `VoteMatchup` — Pulls two logo candidates based on ELO delta rules and captures winner selection.
- `AuthContext` — Handles roster lookups, local storage, and alias/password validation with salted SHA-256 hashes.
- `AuthForms` — Shared login component that first checks the alias, then prompts for a password only when the roster demands it.
- `AccessDeniedPage` — Friendly messaging instructing teammates how to request roster access when alias validation fails.
- `AccountPage` — Self-service area for updating display name, password, and reviewing submitted/owned logos.

## Data & State

- `src/data/logo-catalog.ts` — Static list for launch containing id, title, description, colorway, background, asset filenames, download variants, and tags. Images will live in `public/logos/*` with both SVG and PNG available.
- Local storage namespace: `ces3-logo-favorites::<accountId>` storing array of logo ids. Falls back to empty array when signed out.
- Favorite state managed via React context (`FavoritesProvider`) to reuse across pages.
- Local storage namespace: `ces3-logo-elo-ratings` storing the most recent rating snapshot and match history to persist across sessions until backend exists.
- Roster stored in `server/data/allowed-users.json`; each entry may include `passwordHash` (SHA-256 of `<password><alias>`), which determines whether the sign-in flow requires a password.

## Styling Direction

- Keep Tailwind; define CES3 palette utilities via `tailwind.config` tokens: primary navy (`#152843`), accent cyan (`#32c5ff`), warm accent (`#ff9a62`), neutrals.
- Global background gradient + card shadows consistent across pages.
- Reduce reliance on default Tailwind animations; focus on smooth hover states.

## Authentication

- Authentication is handled locally by `AuthContext`, which cross-checks aliases against the roster JSON served from `/api/allowed-users`.
- The sign-in panel always starts with an alias check. If the roster entry includes `passwordHash`, the UI prompts for a password and compares the salted hash (`SHA-256(<password><alias>)`) on the client.
- Successful logins persist to `localStorage` (`ces3-auth-user`) so refreshes keep context without an external identity provider.
- Admin roles are inferred entirely from the roster (`"role": "admin"`)—no shared admin password exists anymore.
- The `/account` route lets teammates update their display name and password via PATCH calls to `/api/allowed-users`, which rewrites the roster JSON.
- Updating roster access still happens through edits to `server/data/allowed-users.json`; changes are read without rebuilding the client bundle.

## Routing & Guarding Strategy

- Root route still wraps providers in `router.tsx`, but gating now happens at the page level by rendering the shared sign-in panel when `useAuth()` reports unauthenticated.
- `Vote`, `Scores`, `Favorites`, and `My Logos` routes reuse the `SignInPrompt` component instead of redirecting, so the flow stays inline.
- The `/access-denied` route remains available for hard-denied aliases and educates teammates on how to request roster access.
- `VoteMatchup` continues to rotate opponents based on the ELO engine, independent of authentication changes.

## Cleanup Tasks

- Remove all `demo.*` routes, stores, devtools panels, and API mocks.
- Delete `src/lib/demo-store*`, `src/routes/api.demo-*`, and associated entries in the devtools bundle.
- Update `Header` to new nav scheme and drop TanStack-specific wording.

## Documentation & Ops

- README: document the alias-first login flow, how to edit `server/data/allowed-users.json`, and explain the salted password hashing scheme.
- Include troubleshooting tips for alias mismatches, password prompts, and how to reset the persisted session in `localStorage`.
- Provide deployment notes covering Bun-based build commands and the write-access requirements for mutating the roster JSON in production.

## Future Enhancements (Not in Scope but Anticipated)

- Admin upload workflow with Azure Storage integration.
- Usage analytics via Application Insights.
- Role-based access control for advanced features once tenant restrictions are in place.
