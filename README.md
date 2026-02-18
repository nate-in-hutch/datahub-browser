# ts-react-app

A minimal Vite + React + TypeScript starter.

## Quick start

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

## DataHub GMS integration

This app connects to DataHub GMS with OpenAPI endpoints:

- `/openapi/entities/v1/latest`
- `/openapi/relationships/v1`

By default, the app connects using:

- `host`: current browser host
- `port`: current browser port
- `gms api path`: `/gms`

Configure these via environment variables:

- `VITE_DATAHUB_HOST`
- `VITE_DATAHUB_PORT`
- `VITE_DATAHUB_GMS_API_PATH`

In local development, Vite proxies `/gms/*` to `http://localhost:8080/*` (configured in `vite.config.ts`).
Run your local DataHub instance first, then run `npm run dev`.

If your GMS is not behind `/gms` on the dev server, set the env vars before running:

```bash
VITE_DATAHUB_HOST=localhost VITE_DATAHUB_PORT=8080 VITE_DATAHUB_GMS_API_PATH='' npm run dev
```

Build:

```bash
npm run build
```

Preview build locally:

```bash
npm run preview
```
