# Dev Process — plex-tampermonkey-scripts

## What This Is

TamperMonkey userscript suite for automating quote management in Plex ERP.
Scripts run in the browser on Plex QuoteWizard pages.

All source lives in `TamperHost/tm-scripts/src/`. The F# project (`dotnet run`) is a static file host only — not script logic.

---

## Daily Script Development

All commands run from `TamperHost/`.

### Start the local file server
```bash
dotnet run
```
Serves `wwwroot/` on `http://localhost:5000`. Required for dev builds and `tm:install`.

### Build (dev mode — unminified, localhost CDN)
```bash
npm run dev
```
Output: `TamperHost/wwwroot/*.user.js`

Dev builds point `@require` at `localhost:5000`. Production builds point at jsDelivr CDN pinned to a git tag.

### Live reload
`lt-dev-reload.user.js` is installed in TamperMonkey. It watches for file changes and reloads scripts in the browser automatically — no manual TM reinstall needed during a dev session.

### Build a single module
```bash
node build-plus.js --release --patch --emit --ids QT10
```

---

## Releasing

```bash
# Bump version and build all modules
npm run release:all

# Bump only (no build)
npm run bump:patch
npm run bump:minor
npm run bump:major

# Set an explicit version
node build-plus.js --set 1.2.3
```

All modules share one version (`tmVersions.ALL` in `tm-scripts/package.json`). CDN distribution uses GitHub tags (`v{semver}`).

Versions follow CalVer: `YYYY.MM.DD.N`. The first release on a given day is `.0`; a second release the same day auto-increments to `.1`, and so on.

### Git flow
`feature/*` → `develop` → `release/*` → `master`

Release commit message pattern: `chore(release): build userscripts for X.Y.Z`

### Deploy to master

**1. Commit and push to develop**
```bash
git add TamperHost/build-plus.js TamperHost/tm-scripts/package.json \
        TamperHost/tm-scripts/src/shared/ TamperHost/wwwroot/
git commit -m "chore(release): build userscripts for YYYY.MM.DD.N"
git push
```

**2. Merge to master and tag**
```bash
git checkout master
git merge --no-ff develop -m "Merge develop into master for YYYY.MM.DD.N"
git tag vYYYY.MM.DD.N
git push origin master
git push origin vYYYY.MM.DD.N
git checkout develop
```

**3. Merge master back to develop**
```bash
git merge --no-ff master -m "Merge master back to develop after vYYYY.MM.DD.N"
git push
```

jsDelivr serves `@latest` automatically once the tag is on GitHub. TamperMonkey checks for updates every 6 hours and applies them silently.

---

## Playwright Tests

### Architecture Summary

- Tests live in `TamperHost/tests/`
- Config: `TamperHost/playwright.config.js` — target: `https://lyntron.test.on.plex.com`
- **No real TamperMonkey at runtime** — `helpers/injectScripts.js` uses `page.addInitScript()` to inject built `wwwroot/*.user.js` files directly. TM extension is only needed for the one-time profile setup.
- **GM_* polyfill** — `helpers/gmPolyfill.js` shims `GM_getValue`/`GM_setValue` so scripts work without the TM sandbox.
- **Auth session** — `auth.setup.js` logs in once and saves cookies to `tests/.auth/plex-session.json`. Reused across runs until session expires.
- **Persistent Chrome profile** — `tests/.chrome-profile/` is used by `fixtures.js` for tests that need the real TM extension. `qt05.spec.js` does NOT use this — it imports from `@playwright/test` directly and relies on script injection.

### Environment Variables

Create `TamperHost/.env`:
```
PLEX_USER=your-username
PLEX_PASS=your-password
PLEX_API_KEY=your-api-key   # optional, for GM_getValue-based auth
```

### One-Time Profile Setup

Only needed once per machine / fresh profile.

**Step 1 — Configure TamperMonkey in the test Chrome profile:**
```bash
npm run tm:setup-profile
```
Chrome opens. In TM options → Settings → set Config Mode to "Advanced" → Save. Press Enter in terminal.

**Step 2 — Install scripts into the test profile:**
```bash
# Requires dev server running (dotnet run in separate terminal)
npm run tm:install
```
Chrome opens and loads each script from localhost. Accept each TM install prompt. Press Enter when done.

### Running Tests

```bash
# All tests
npm test

# Interactive UI (recommended for debugging — time-travel, step replay, locator picker)
npm run test:ui

# Single spec file
npx playwright test qt05 --project=qt-tests

# Single test by name
npx playwright test qt05 -g "contact form can be filled" --project=qt-tests
```

`--project=qt-tests` automatically runs the `setup` (auth) dependency first due to `dependencies: ['setup']` in the config.

### Debugging a Failing Test

1. Run `npm run test:ui` for step-by-step replay and network inspection.
2. Ensure `wwwroot/` is built: `npm run dev`.
3. If auth fails, delete `tests/.auth/plex-session.json` to force re-login.
4. Add `await page.pause()` in the spec to drop into interactive inspector mid-test.

### Test Files

| File | Purpose |
|------|---------|
| `auth.setup.js` | One-time Plex login, saves session to `.auth/plex-session.json` |
| `fixtures.js` | Custom `test` fixture — launches persistent Chrome context with TM extension loaded |
| `tm.setup-profile.js` | One-time: configures TM Advanced mode in test Chrome profile |
| `tm.install.js` | One-time: installs scripts from localhost into test Chrome profile |
| `helpers/injectScripts.js` | `injectQT05()` — injects built scripts via `addInitScript` (no TM needed) |
| `helpers/gmPolyfill.js` | Shims `GM_getValue`/`GM_setValue` for test context |
| `qt05.spec.js` | QT05 feature tests (hub mounts, New Contact button, contact form flow) |

---

## Key File Locations

| Path | Purpose |
|------|---------|
| `TamperHost/tm-scripts/src/shared/` | Shared libraries (`lt-plex-tm-utils`, `lt-plex-auth`, `lt-core`, etc.) |
| `TamperHost/tm-scripts/src/quote-tracking/qt*/` | Feature scripts (one folder per QT script) |
| `TamperHost/wwwroot/` | Build output — served by dotnet and read by Playwright tests |
| `TamperHost/build-plus.js` | Build orchestrator |
| `TamperHost/tm-scripts/package.json` | Version (`tmVersions.ALL`) and module definitions |
| `TamperHost/playwright.config.js` | Playwright config — projects, baseURL, auth dependency |
| `TamperHost/tests/.auth/` | Saved Plex session (gitignored) |
| `TamperHost/tests/.chrome-profile/` | Persistent Chrome profile for TM-extension tests |
