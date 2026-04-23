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
node build-plus.js --patch --emit --watch --ids QT05
```
Replace `QT05` with the module you are working on (`QT10`, `QT20`, etc.).
The `--patch` bumps the version so TM recognises it as a new install.

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
node build-plus.js --patch --emit --watch --ids QT05

# Dev: watch all modules
node build-plus.js --patch --emit --watch

# Production build (minified, jsDelivr CDN)
npm run build

# Bump version and build all modules for release
npm run release:all
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
