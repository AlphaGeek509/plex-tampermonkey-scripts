# Developer Workflow

## Prerequisites

- **TamperMonkey** installed in your browser
- **Visual Studio** (for the local dev server)
- **Node.js** (for the build system)

### One-time TamperMonkey setup

Install these scripts manually — they are dev-only and never part of a production build:

| Script | URL (server must be running) |
|--------|------------------------------|
| `lt-dev-reload.user.js` | `http://localhost:5000/lt-dev-reload.user.js` |

---

## Dev Loop

Follow this order — it matters.

**1. Start the dev server**
Press **F5** in Visual Studio. This starts Kestrel on `localhost:5000` serving `wwwroot/`.

**2. Start the build watcher**
From `TamperHost/`:
```bash
node build-plus.js --bump --emit --watch --ids QT05
```
Replace `QT05` with the module you are working on (`QT10`, `QT20`, etc.).
The `--bump` advances the date version so TM recognises it as a new install.

**3. Open a QuoteWizard tab**
Navigate to any QuoteWizard page in Plex. This activates `lt-dev-reload.user.js`,
which connects to the WebSocket and listens for rebuild signals.

**4. Accept the initial TM install**
The first build fires immediately and opens the TM install dialog in the foreground.
Click **Update**.

**5. Edit → Save → Update → done**
Each time you save a source file in VS:
- esbuild rebuilds automatically
- TM install dialog opens in the foreground (may appear twice — dismiss the duplicate)
- Click **Update**, switch back to the QuoteWizard tab
- The tab reloads automatically with your new code

---

## Build Commands

All commands run from `TamperHost/`:

```bash
# Dev: watch a single module (most common)
node build-plus.js --bump --emit --watch --ids QT05

# Dev: watch all modules
node build-plus.js --bump --emit --watch

# Production build (minified, jsDelivr CDN)
npm run build

# Bump version and build all modules for release
npm run release:all
```

---

## Production Deployment

Versions follow CalVer: `YYYY.MM.DD.N`. The first release on a given day is `.0`;
a second release the same day auto-increments to `.1`, and so on.

**1. Build the release**
From `TamperHost/tm-scripts/`:
```bash
npm run release:all
```
This bumps the version, minifies all modules, and writes to `wwwroot/`.

**2. Commit and push to develop**
```bash
git add TamperHost/build-plus.js TamperHost/tm-scripts/package.json \
        TamperHost/tm-scripts/src/shared/ TamperHost/wwwroot/
git commit -m "chore(release): build userscripts for YYYY.MM.DD.N"
git push
```

**3. Merge to master and tag**
```bash
git checkout master
git merge --no-ff develop -m "Merge develop into master for YYYY.MM.DD.N"
git tag vYYYY.MM.DD.N
git push origin master
git push origin vYYYY.MM.DD.N
git checkout develop
```

jsDelivr serves `@latest` automatically once the tag is on GitHub. TamperMonkey
checks for updates every 6 hours and applies them silently.

---

## Install Page (`docs/index.html`)

The team install page is served via GitHub Pages from `master/docs/`.
URL: `https://alphageek509.github.io/plex-tampermonkey-scripts/`

### Updating the page

Edit `docs/index.html` directly (it is a plain HTML file — no build step).

```bash
git add docs/index.html
git commit -m "feat(docs): describe your change"
git push

git checkout master
git merge --no-ff develop -m "Merge develop: describe your change"
git push
git checkout develop
```

GitHub Pages updates within ~1 minute of the master push. No tag is needed.

### Adding a new script group

Copy an existing `<div class="group">` block and update:
- `group-header-title` — group name (e.g. `CRS — Scheduling`)
- `group-header-sub` — one-line description
- Add `<div class="card">` entries inside the group for each script

### Adding a script card

```html
<div class="card">
  <div class="card-body">
    <div class="card-id">QT##</div>
    <div class="card-title">Script Name</div>
    <div class="card-desc">One sentence description.</div>
  </div>
  <a class="btn" href="https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@latest/TamperHost/wwwroot/qt##.user.js">Install</a>
</div>
```

---

## Troubleshooting

**TM shows no update prompt**
- Make sure the server was started *before* the build command.
- Make sure a QuoteWizard tab is open *before* saving a change.
- If the initial build signal was missed, resave your source file to trigger a watch rebuild.

**TM prompts twice**
Known cosmetic issue — dismiss both. Only one reinstall happens.

**`lt-dev-reload.user.js` needs updating**
If the script is changed, reinstall it from `http://localhost:5000/lt-dev-reload.user.js`.
