# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A TamperMonkey userscript suite for automating quote management in the Plex ERP system. Scripts run in the browser on Plex QuoteWizard pages and enhance the UI with catalog lookups, stock checks, pricing application, attachment counts, and validation.

All work lives under `TamperHost/`. The F# project (`Program.fs`, `TamperHost.fsproj`) is only a static file host (Kestrel on localhost:5000) for local dev testing — it is not part of the script logic.

## Commands

All commands run from `TamperHost/`:

```bash
# Development build (unminified, uses localhost:5000 CDN)
npm run dev

# Production build (minified, uses jsDelivr CDN)
npm run build

# Bump version and build all modules
npm run release:all

# Bump version only (no build)
npm run bump:patch
npm run bump:minor
npm run bump:major

# Set explicit version
node build-plus.js --set 1.2.3

# Build a single module (from TamperHost/)
node build-plus.js --release --patch --emit --ids QT10
```

To run the local dev server (serves `wwwroot/` on localhost:5000):
```bash
dotnet run  # from TamperHost/
```

## Architecture

### Module Structure

Scripts are in `TamperHost/tm-scripts/src/`:

| Path | Purpose |
|------|---------|
| `shared/` | Shared libraries loaded via `@require` |
| `quote-tracking/qt*/` | Feature scripts (one folder per script) |
| `data/core/` | Storage abstraction layer |
| `domains/quote/` | Quote entity and repo |

**Shared libraries** (loaded in order via `@require`):
1. `lt-plex-tm-utils` — DOM utilities, KO binding helpers, Plex API wrappers
2. `lt-plex-auth` — Bearer token management via PlexAuth/PlexAPI
3. `lt-core` — HTTP, Plex DataSource API, toast/hub UI, pubsub bus
4. `lt-data-core` — Flat-scoped repos, storage backends
5. `lt-ui-hub` — Hub bar, toasts, modals, theme CSS

Libraries expose themselves as globals on `window`/`unsafeWindow` (e.g., `window.TMUtils`, `window.LTPlexAuth`).

### Build System

`TamperHost/build-plus.js` orchestrates everything:
- Reads module definitions and version from `tm-scripts/package.json` (`tmVersions.ALL`)
- Injects TamperMonkey headers from `tm-scripts/banners/_template.header.tpl.js`
- Replaces `__REQUIRES__` with localhost URLs (dev) or jsDelivr CDN URLs (prod)
- Bundles with esbuild (falls back to concat)
- Outputs to `TamperHost/wwwroot/*.user.js`

Dev builds point `@require` at `http://localhost:5000/*.user.js`. Release builds point at `https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v{VERSION}/TamperHost/wwwroot/`.

### Data Layer

`RepoBase` in `data/core/repo-base.js` provides generic CRUD with pluggable storage backends (`memory`, `session`, `local`, `gm`, `composite`). `DataContext` creates flat-scoped repos keyed by scope (e.g., customer key, part number). Scripts use these repos to persist intermediate state (draft data) across page navigations.

Pub/sub (`lt.core.bus`) coordinates events between scripts running on the same page.

### Script Pattern

Each QT script:
1. Runs at `document-start` or `document-idle` on matching Plex URLs
2. Waits for KO bindings and DOM anchor elements to be ready
3. Hooks into Knockout observables for quote data
4. Calls Plex DataSource API (DS numbers like 319, 172, 4809) with Bearer token
5. Stores results in a scoped repo
6. Updates Plex UI via KO bindings or direct DOM manipulation
7. Publishes pubsub events for other scripts

### Versioning

All modules share one version (`tmVersions.ALL` in `tm-scripts/package.json`). Bumping via `--patch/minor/major` updates this value and rewrites all relevant files. CDN distribution uses GitHub tags (e.g., `v4.2.4`).

### Git Workflow

Git-flow: `feature/*` → `develop` → `release/*` → `master`. Release commits follow the pattern `chore(release): build userscripts for X.Y.Z`. Tags are `v{semver}`.
