# DataHub Browser

`datahub-browser` is a lightweight React app for exploring DataHub entity neighborhoods from a URN.

It supports:
- URN-based navigation through parent/dependency relationships
- Breadcrumb navigation stack
- Structure view for large neighborhoods (grouped by aspect)
- Graph view for visual context
- Clickable URNs inside entity JSON

## Prerequisites

- Node.js 18+ (20 recommended)
- npm
- Access to a running DataHub GMS instance

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open the app (typically `http://localhost:5173`).

## Configuration

The app builds the GMS base URL from host/port/path.

Environment variables:
- `VITE_DATAHUB_HOST`
- `VITE_DATAHUB_PORT`
- `VITE_DATAHUB_GMS_API_PATH`

Defaults:
- `host`: current browser host
- `port`: current browser port
- `gms api path`: `/gms`

### Typical local DataHub setup

`vite.config.ts` proxies `/gms/*` to `http://localhost:8080/*`.

So with default settings, browser calls like `/gms/openapi/...` are forwarded to local GMS.

### Example overrides

Direct to local GMS without proxy path:

```bash
VITE_DATAHUB_HOST=localhost VITE_DATAHUB_PORT=8080 VITE_DATAHUB_GMS_API_PATH='' npm run dev
```

## How To Use

1. Enter a URN and click `Connect` (or press `Enter`).
2. Use `Structure` view for scale:
   - grouped sections (`Previous`, `Parents`, and aspect groups)
   - filter box for urn/type/name/aspect
   - click any item to navigate
3. Use `Graph` view for visual context on smaller neighborhoods.
4. Click breadcrumbs to jump back to prior nodes.
5. Click URNs in the JSON panel to navigate to referenced entities.

## API Behavior

Entity fetch attempts:
1. `/openapi/entities/v1/latest?urns=...&withSystemMetadata=false`
2. `/openapi/entities/v1/latest?urns=...`
3. `/entitiesV2/{urn}`

Relationship fetch attempts:
1. `/openapi/relationships/v1/?...`
2. `/openapi/relationships/v1?...`
3. `/relationships?...&types=...` (legacy fallback)

## Auth Notes

This app does not hardcode tokens.

It relies on network/path access to GMS from the browser (or Vite proxy). If your GMS requires auth headers, add auth at your proxy/gateway layer or extend the app fetch logic.

## Scripts

- `npm run dev`: start local dev server
- `npm run build`: production build
- `npm run preview`: preview production build
- `npm run lint`: run ESLint on `src/`
- `npm run typecheck`: run TypeScript checks (`tsc --noEmit`)

## macOS Tooling Notes

If you installed GNU make with Homebrew, it is available as `gmake`.
To use GNU make as `make`, add this to your shell profile:

```bash
export PATH="/opt/homebrew/opt/make/libexec/gnubin:$PATH"
```

Then reload your shell:

```bash
source ~/.zshrc
```

## Troubleshooting

- `404 /openapi/relationships/v1`: older DataHub version; app falls back to legacy `/relationships`.
- `400 Parameter 'types' is required`: legacy relationship endpoint; app includes fallback `types`.
- `400 invalid SystemMetadata`: app first requests entities with `withSystemMetadata=false`.
- Empty results: verify URN exists and your GMS endpoint/env config is correct.

## Team Onboarding (macOS)

Copy/paste setup for first day:

```bash
# 1) Clone
git clone https://github.com/nate-in-hutch/datahub-browser.git
cd datahub-browser

# 2) Install dependencies
npm install

# 3) Start the app
npm run dev
```

If your local GMS is at `localhost:8080` without `/gms` proxy path:

```bash
VITE_DATAHUB_HOST=localhost VITE_DATAHUB_PORT=8080 VITE_DATAHUB_GMS_API_PATH='' npm run dev
```
