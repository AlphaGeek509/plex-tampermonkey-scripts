// /tm-scripts/build-plus.js
/**
 * build-plus.js — TM monorepo builder (modules-only, no legacy mode)
 *
 * Features:
 *  - Per-module versioning via tm-scripts/package.json { tmVersions, tmFiles }
 *  - Optional interactive picker when --ids not provided
 *  - Dev/Prod banner injection (from tm-scripts/banners/<ID>.*.header.js)
 *  - esbuild bundling (fallback to concat if esbuild not installed)
 *  - Emits to wwwroot/qt*.user.js and keeps @version in sync
 *
 * Typical usage (run from tm-scripts/ or repo root):
 *   node build-plus.js --patch --ids QT10 --emit --watch        # dev (watch)
 *   node build-plus.js --patch --ids QT10                        # bump only
 *   node build-plus.js --set 3.6.0 --ids QT20 --emit --release  # prod build
 *   node build-plus.js --minor --emit --watch                   # prompt → watch
 */

const fs = require('fs');
const path = require('path');

// For library builds (isLib: true), expose a stable global on window/unsafeWindow.
// Add/adjust as your libs require.
const LIB_GLOBALS = {
    LT_PLEX_TM_UTILS: 'TMUtils',
    LT_PLEX_AUTH: 'LTPlexAuth',
    LT_CORE: 'LTCore',
    LT_DATA_CORE: 'LTDataCore',
    LT_UI_HUB: 'LTHub'
};

// Try to load esbuild (optional)
let esbuild = null;
try { esbuild = require('esbuild'); } catch { /* optional */ }

// Esbuild plugin: after each successful watch rebuild, signal the dev server
// to broadcast a reload to all connected browser clients.
function devReloadPlugin() {
    const http = require('http');
    return {
        name: 'dev-reload',
        setup(build) {
            build.onEnd(result => {
                if (result.errors.length > 0) return;
                const filename = path.basename(build.initialOptions.outfile || '');
                const req = http.request({
                    method: 'POST',
                    hostname: 'localhost',
                    port: 5000,
                    path: '/_dev/reload',
                    headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(filename) }
                });
                req.on('error', () => {}); // dev server may not be running
                req.write(filename);
                req.end();
            });
        }
    };
}

// --------------------------- arg parsing ---------------------------
const args = process.argv.slice(2);
const opts = {
    bump: false,      // true when --bump/--patch/--minor/--major passed
    set: null,        // 'YYYY.MM.DD.N'
    ids: null,        // array of module ids (e.g., ['QT10'])
    dry: false,
    emit: false,      // if true, build/copy outputs for known modules
    release: false,   // if true and esbuild present, minify + remove sourcemap
    watch: false      // esbuild watch (dev)
};

function usage(exitCode = 0) {
    console.log(`
Usage:
  node build-plus.js --bump --emit                          # build all modules
  node build-plus.js --bump --ids QT10 --emit --watch       # single module, watch
  node build-plus.js --set 2026.04.23.0 --ids QT35 --emit --release

Flags:
  --bump                        Advance to today's date version (YYYY.MM.DD.N)
  --patch | --minor | --major   Aliases for --bump (retained for compatibility)
  --set YYYY.MM.DD.N            Set exact version (overrides --bump)
  --ids <id...>                 Modules to process; omit to build all
  --emit                        Build/copy outputs for selected modules
  --release                     With --emit, minify and use PROD banners
  --watch                       With --emit, watch sources and rebuild
  --dry                         Dry run (no writes)
  --help                        Show help
`.trim());
    process.exit(exitCode);
}

// simple flag reader
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') usage(0);
    else if (a === '--dry') opts.dry = true;
    else if (a === '--emit') opts.emit = true;
    else if (a === '--release') opts.release = true;
    else if (a === '--watch') opts.watch = true;
    else if (a === '--bump' || a === '--patch' || a === '--minor' || a === '--major') opts.bump = true;
    else if (a === '--set') { opts.set = args[++i]; }
    else if (a === '--ids') {
        opts.ids = [];
        while (args[i + 1] && !args[i + 1].startsWith('--')) opts.ids.push(args[++i]);
    } else {
        console.warn(`⚠️  Unknown arg: ${a}`);
    }
}

if (!opts.bump && !opts.set) {
    console.error('❌ You must pass --bump or --set YYYY.MM.DD.N');
    usage(1);
}

// --------------------------- constants / mapping ---------------------------
const ROOT = __dirname;
const SRC_ROOT = path.join(ROOT, 'tm-scripts');
const PKG_PATH = path.join(SRC_ROOT, 'package.json');

// Known module → src/out mapping for emit step
const MODULES = [
    {
        id: 'QT05',
        featureName: 'Customer Contact Add',
        //bannerBase: 'qt10-customerContactAdd',
        src: path.join(SRC_ROOT, 'src', 'quote-tracking', 'qt05-customerContactAdd', 'qt05.index.js'),
        out: path.join(ROOT, 'wwwroot', 'qt05.user.js'),
        desc: 'Adds a Hub Bar “New Contact” button on Quote that opens Plex’s Contact form in a new tab. Resolves CustomerNo via KO with DOM fallbacks and guards via SPA-safe observers.',
        // Optional overrides (omit if you want defaults)
        matches: ['https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*' ],
        grants: ['GM_registerMenuCommand', 'GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', 'unsafeWindow'],
        connect: ['*.plex.com', 'cdn.jsdelivr.net']
    },
    {
        id: 'QT10',
        featureName: 'Customer Catalog Get',
        src: path.join(SRC_ROOT, 'src', 'quote-tracking', 'qt10-customerCatalogGet', 'qt10.index.js'),
        out: path.join(ROOT, 'wwwroot', 'qt10.user.js'),
        desc: 'Watches CustomerNo, fetches Catalog Key/Code (DS 319/22696), and stores them in the DRAFT repo. Supports draft→quote promote and small DEV seams for debugging.',
        matches: ['https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*'],
        grants: ['GM_registerMenuCommand', 'GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', 'unsafeWindow'],
        connect: ['*.plex.com', 'cdn.jsdelivr.net']
    },
    {
        id: 'QT20',
        featureName: 'Part Stock Level Get',
        src: path.join(SRC_ROOT, 'src', 'quote-tracking', 'qt20-partStockLevelGet', 'qt20.index.js'),
        out: path.join(ROOT, 'wwwroot', 'qt20.user.js'),
        desc: 'Adds “Get Stock Levels” on Quote Part Detail and Hub; queries DS 172, normalizes to pieces, and toasts totals. Optionally stamps NoteNew with “Stock: N pcs”.',
        matches: ['https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*'],
        grants: ['GM_registerMenuCommand', 'GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', 'unsafeWindow'],
        connect: ['*.plex.com', 'cdn.jsdelivr.net']
    },
    {
        id: 'QT30',
        featureName: 'Part Catalog Pricing Get',
        src: path.join(SRC_ROOT, 'src', 'quote-tracking', 'qt30-catalogPricingApply', 'qt30.index.js'),
        out: path.join(ROOT, 'wwwroot', 'qt30.user.js'),
        desc: 'Applies customer catalog breakpoints (DS 4809) using Catalog Key (repo/DS 3156), removes zero-qty rows, and sets RvCustomizedUnitPrice with rounding. Refreshes via KO or wizard nav.',
        matches: ['https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*'],
        grants: ['GM_registerMenuCommand', 'GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', 'unsafeWindow'],
        connect: ['*.plex.com', 'cdn.jsdelivr.net']
    },
    {
        id: 'QT35',
        featureName: 'Quote Attachments Get',
        src: path.join(SRC_ROOT, 'src', 'quote-tracking', 'qt35-attachmentsGet', 'qt35.index.js'),
        out: path.join(ROOT, 'wwwroot', 'qt35.user.js'),
        desc: 'Adds Attachments badge/button (and Dock) and promotes draft→quote once if needed. Counts attachments via DS 11713 (group 11) and auto-refreshes on Part Summary activation and QT20 modal close.',
        matches: ['https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*'],
        grants: ['GM_registerMenuCommand', 'GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', 'unsafeWindow'],
        connect: ['*.plex.com', 'cdn.jsdelivr.net']
    },
    {
        id: 'QT50',
        featureName: 'Quote Validation',
        src: path.join(SRC_ROOT, 'src', 'quote-tracking', 'qt50-validation', 'qtv.entry.js'),
        out: path.join(ROOT, 'wwwroot', 'qt50.user.js'),
        desc: 'Runs rule-based checks on quote lines for lead time, unit price limits, and part number management. Adds a Hub Bar “Validate Lines” button with settings, a details modal, and CSV export. Highlights issues directly in the grid with optional auto-fixes.',
        matches: ['https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*', 'https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*'],
        grants: ['GM_registerMenuCommand', 'GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', 'unsafeWindow'],
        connect: ['*.plex.com', 'cdn.jsdelivr.net']
    },
    // ---- shared CORE LIBS (no Tampermonkey banner; plain JS bundles) ----
    {
        id: 'LT_CORE',
        featureName: 'Core Library',
        bannerBase: 'none',
        isLib: true,
        src: path.join(SRC_ROOT, 'src', 'shared', 'lt-core.user.js'),
        out: path.join(ROOT, 'wwwroot', 'lt-core.user.js')
    },
    {
        id: 'LT_DATA_CORE',
        featureName: 'Data Core Library',
        bannerBase: 'none',
        isLib: true,
        src: path.join(SRC_ROOT, 'src', 'shared', 'lt-data-core.user.js'),
        out: path.join(ROOT, 'wwwroot', 'lt-data-core.user.js')
    },
    {
        id: 'LT_UI_HUB',
        featureName: 'UI Hub Library',
        bannerBase: 'none',
        isLib: true,
        src: path.join(SRC_ROOT, 'src', 'shared', 'lt-ui-hub.js'),
        out: path.join(ROOT, 'wwwroot', 'lt-ui-hub.js')
    },
    {
        id: 'LT_PLEX_AUTH',
        featureName: 'Plex Auth Library',
        bannerBase: 'none',
        isLib: true,
        src: path.join(SRC_ROOT, 'src', 'shared', 'lt-plex-auth.user.js'),
        out: path.join(ROOT, 'wwwroot', 'lt-plex-auth.user.js')
    },
    {
        id: 'LT_PLEX_TM_UTILS',
        featureName: 'Plex TM Utils Library',
        bannerBase: 'none',
        isLib: true,
        src: path.join(SRC_ROOT, 'src', 'shared', 'lt-plex-tm-utils.user.js'),
        out: path.join(ROOT, 'wwwroot', 'lt-plex-tm-utils.user.js')
    }

];


// --------------------------- shared requires/resources ---------------------------
// Global default CDN for ALL modules; {VER} is replaced with the release version.
const CDN_BASE = process.env.CDN_BASE || 'https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v{VER}/TamperHost/wwwroot';

const SHARED = {
    dev: {
        requires: [
            'http://localhost:5000/lt-plex-tm-utils.user.js',
            'http://localhost:5000/lt-plex-auth.user.js',
            'http://localhost:5000/lt-core.user.js',
            'http://localhost:5000/lt-data-core.user.js',
            'http://localhost:5000/lt-ui-hub.js',
        ],
        resources: [
            ['THEME_CSS', 'http://localhost:5000/theme.css']
        ]
    },
    release: {
        requires: [
            `${CDN_BASE}/lt-plex-tm-utils.user.js`,
            `${CDN_BASE}/lt-plex-auth.user.js`,
            `${CDN_BASE}/lt-core.user.js`,
            `${CDN_BASE}/lt-data-core.user.js`,
            `${CDN_BASE}/lt-ui-hub.js`
        ],
        resources: [
            ['THEME_CSS', `${CDN_BASE}/theme.css`]
        ]
    }
};

// --------------------------- helpers ---------------------------
function nextDateVersion(currentVer, setStr) {
    if (setStr) return setStr;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}.${m}.${d}`;
    const match = /^(\d{4}\.\d{2}\.\d{2})\.(\d+)$/.exec(currentVer || '');
    if (match && match[1] === today) {
        return `${today}.${+match[2] + 1}`;
    }
    return `${today}.0`;
}function ensureDir(p) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function updateFileVersion(filePath, newVersion, dry = false) {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  Skip missing ${filePath}`);
        return { skipped: true, changed: false, hadMarkers: false };
    }
    const original = fs.readFileSync(filePath, 'utf8');
    let content = original;

    // 1) Tampermonkey @version meta
    content = content.replace(/(@version\s+)([^\s]+)/g, `$1${newVersion}`);

    // 2) Any JS constants with "VERSION" in the name
    content = content.replace(
        /((?:const|let|var|export\s+const)\s+[A-Za-z0-9_]*VERSION[A-Za-z0-9_]*\s*=\s*['"`])([^'"`]+)(['"`])/g,
        `$1${newVersion}$3`
    );

    const changed = content !== original;
    if (!dry && changed) fs.writeFileSync(filePath, content, 'utf8');

    const hadMarkers = changed || /@version\s+/.test(original) || /VERSION\s*=/.test(original);
    const base = path.basename(filePath);
    if (changed) {
        console.log(`${dry ? '🧪 DRY' : '✅'} ${base} → ${newVersion}`);
    } else {
        // Quiet when nothing changed; show only if debugging is enabled
        if (process.env.BUILD_PLUS_DEBUG === '1') {
            console.debug?.(`${dry ? '🧪 DRY' : '✅'} ${base} → ${newVersion} (no changes)`);
        }
    }

    return { skipped: false, changed, hadMarkers };
}
function resolveModuleById(id) {
    return MODULES.find(m => m.id.toLowerCase() === id.toLowerCase());
}
function ensureGrants(header, grants) {
    if (!Array.isArray(grants) || grants.length === 0) return header;
    const hasGrant = (g) => new RegExp(`^\\s*//\\s*@grant\\s+${g}\\b`, 'm').test(header);
    let out = header;
    for (const g of grants) {
        if (!hasGrant(g)) {
            out = out.replace(/(\/\/\s*==\/UserScript==)/, `// @grant       ${g}\n$1`);
        }
    }
    return out;
}
// Rewrites @require lines: appends ?v=<stamp> and enforces UI Hub → Core ordering
function rewriteRequires(header, versionStr, opts) {
    const stamp = opts.release
        ? versionStr                       // stable in release
        : `${versionStr}-${Date.now()}`;   // unique per dev build

    const lines = header.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const m = /^\s*\/\/\s*@require\s+(\S+)/.exec(lines[i]);
        if (!m) continue;

        let url = m[1].replace(/['"]/g, '');
        if (!/[?&]v=/.test(url)) {
            url += (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(stamp);
        }
        lines[i] = lines[i].replace(m[1], url);
    }

    return lines.join('\n');
}


function loadBannerForModule(m, versionStr, opts) {
    const envName = opts.release ? 'PROD' : 'DEV'; // release → PROD; else DEV

    // Always read the single template
    const tplPath = path.join(__dirname, 'tm-scripts', 'banners', '_template.header.tpl.js');
    let header = fs.readFileSync(tplPath, 'utf8');

    const vars = getBannerVars(m, versionStr, envName, opts);

    // Fill core tokens
    header = header
        .replaceAll('@@NAME@@', vars.NAME)
        .replaceAll('@@VERSION@@', versionStr)
        .replaceAll('@@DESC@@', vars.DESC)
        .replaceAll('@@MATCHES@@', vars.MATCHES.join('\n'))
        .replaceAll('@@UPDATE_URL@@', vars.UPDATE_URL)
        .replaceAll('@@DOWNLOAD_URL@@', vars.DOWNLOAD_URL);

    // Expand __REQUIRES__/__RESOURCES__ (uses your existing SHARED maps)
    if (header.includes('__REQUIRES__') || header.includes('__RESOURCES__')) {
        const sharedKey = opts.release ? 'release' : 'dev';
        const reqLines = (SHARED[sharedKey]?.requires || []).map(u => `// @require     ${u}`).join('\n');
        const resLines = (SHARED[sharedKey]?.resources || []).map(([name, url]) => `// @resource    ${name} ${url}`).join('\n');
        header = header.replace(/__REQUIRES__/g, reqLines || '');
        header = header.replace(/__RESOURCES__/g, resLines || '');
        if ((SHARED[sharedKey]?.resources || []).length) {
            header = ensureGrants(header, ['GM_addStyle', 'GM_getResourceText']);
        }
    }

    // Optional per-module metadata injections
    if (Array.isArray(m.grants) && m.grants.length) {
        header = ensureGrants(header, m.grants);
    }
    if (Array.isArray(m.connect) && m.connect.length) {
        const connectLines = m.connect.map(d => `// @connect     ${d}`).join('\n') + '\n';
        header = header.replace(/(\/\/\s*@run-at[^\n]*\n)/, `${connectLines}$1`);
    }
    if (m.icons?.icon32) {
        header = header.replace(/(\/\/\s*@version[^\n]*\n)/, `$1// @icon        ${m.icons.icon32}\n`);
    }
    if (m.icons?.icon64) {
        header = header.replace(/(\/\/\s*@version[^\n]*\n)/, `$1// @icon64      ${m.icons.icon64}\n`);
    }

    // Replace any {VER} token in CDN base
    header = header.replace(/\{VER\}/g, versionStr);

    // Append ?v= and enforce require ordering (your existing helper)
    header = rewriteRequires(header, versionStr, opts);

    return header;
}

function getBannerVars(m, versionStr, envName, opts) {
    const isProd = !!opts.release;
    const baseName = m.id; // e.g., 'QT10', 'QT20', 'QT50', etc.
    const NAME = isProd ? baseName : `${baseName}_DEV`;

    // Description comes from module metadata; add a small DEV suffix.
    const baseDesc = m.desc || 'Lyn-Tron module';
    const DESC = isProd ? baseDesc : `${baseDesc} (DEV build)`;

    // Require per-module matches to avoid hard-coded app paths
    if (!Array.isArray(m.matches) || m.matches.length === 0) {
        throw new Error(`Module ${m.id} is missing 'matches' in MODULES metadata`);
    }
    // Normalize: allow bare URLs/globs or pre-prefixed lines
    const MATCHES = m.matches.map(s => {
        const t = String(s).trim();
        if (t.startsWith('// @match')) return t;
        if (t.startsWith('@match')) return `// ${t}`;
        return `// @match       ${t}`;
    });

    const cdnBase = (isProd
        ? (process.env.CDN_BASE || 'https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v{VER}/TamperHost/wwwroot')
        : 'http://localhost:5000'
    ).replace('{VER}', versionStr);

    const fileName = path.basename(m.out);
    const SELF_URL = `${cdnBase}/${fileName}`;

    return { NAME, DESC, MATCHES, UPDATE_URL: SELF_URL, DOWNLOAD_URL: SELF_URL };
}

function injectUpdateDownload(header, m, versionStr, opts) {
    // Resolve bases
    const pkg = 'AlphaGeek509/plex-tampermonkey-scripts';
    const sha = (process.env.GIT_SHA || '').trim();
    const mode = (process.env.TM_URL_MODE || 'pinned').toLowerCase(); // pinned | latest
    const devBase = (process.env.DEV_BASE || 'http://localhost:5000').replace(/\/+$/, '');

    // Prefer commit-SHA pinning when provided (most cache-proof), else tag "v{VER}"
    const pinnedIdent = sha ? sha : `v${versionStr}`;

    const basePinned = (process.env.CDN_BASE ||
        `https://cdn.jsdelivr.net/gh/${pkg}@${pinnedIdent}/TamperHost/wwwroot`
    ).replace(/\/+$/, '');

    const baseLatest = (process.env.CDN_LATEST_BASE ||
        `https://cdn.jsdelivr.net/gh/${pkg}@latest/TamperHost/wwwroot`
    ).replace(/\/+$/, '');

    const fileName = path.basename(m.out);

    // Decide URLs
    let updateURL, downloadURL;

    if (!opts.release) {
        // Dev builds always point to local
        updateURL = `${devBase}/${fileName}`;
        downloadURL = `${devBase}/${fileName}`;
    } else {
        switch (mode) {
            case 'latest': {
                updateURL = `${baseLatest}/${fileName}`;
                downloadURL = `${baseLatest}/${fileName}`;
                break;
            }
            case 'pinned':
            default: {
                updateURL = `${basePinned}/${fileName}`;
                downloadURL = `${basePinned}/${fileName}`;
                break;
            }
        }
    }

    // Inject or replace the lines
    const upRe = /^\s*\/\/\s*@updateURL[^\n]*$/m;
    const dlRe = /^\s*\/\/\s*@downloadURL[^\n]*$/m;

    const lineUp = `// @updateURL   ${updateURL}`;
    const lineDl = `// @downloadURL ${downloadURL}`;

    // Capture presence BEFORE modifying header to avoid false re-test after replace
    const hadUp = upRe.test(header);
    const hadDl = dlRe.test(header);

    if (hadUp) header = header.replace(upRe, lineUp);
    if (hadDl) header = header.replace(dlRe, lineDl);

    // Insert only the lines that were genuinely absent
    if (!hadUp || !hadDl) {
        const missing = [!hadUp ? lineUp : null, !hadDl ? lineDl : null]
            .filter(Boolean).join('\n');
        const endMarker = /\/\/\s*==\/UserScript==/;
        if (endMarker.test(header)) {
            header = header.replace(endMarker, `${missing}\n// ==/UserScript==`);
        } else {
            header = `${missing}\n${header}`;
        }
    }

    return header;
}

function makeBuildOpts(m, entry, banner) {
    const buildOpts = {
        entryPoints: [entry],
        bundle: true,
        outfile: m.out,
        sourcemap: opts.release ? false : 'inline',
        minify: !!opts.release,
        minifyIdentifiers: false,
        target: ['chrome110', 'edge110', 'firefox110'],
        legalComments: 'none',
        format: 'iife',
        platform: 'browser',
        splitting: false,
        define: { __BUILD_DEV__: String(!opts.release) }
    };
    if (banner) buildOpts.banner = { js: banner + '\n' };
    const gName = LIB_GLOBALS[m.id];
    if (gName) {
        buildOpts.footer = {
            js: `;(function(g){try{if(typeof ${gName}!=='undefined'){g.${gName}=${gName};}}catch(e){}})(typeof unsafeWindow!=='undefined'?unsafeWindow:window);`
        };
    }
    return buildOpts;
}

async function runEsbuild(m, entry, buildOpts, versionStr, label) {
    if (opts.watch) {
        buildOpts.plugins = [...(buildOpts.plugins || []), devReloadPlugin()];
        const ctx = await esbuild.context(buildOpts);
        await ctx.watch();
        console.log(`👀 Watching ${m.id} (${path.relative(ROOT, entry)}) → ${path.relative(ROOT, m.out)}`);
        return;
    }
    if (!opts.dry) await esbuild.build(buildOpts);
    updateFileVersion(m.out, versionStr, opts.dry);
    console.log(`${opts.dry ? '🧪 DRY' : '📦'} Emitted${label} ${m.id}: ${path.relative(ROOT, m.out)}`);
}

async function emitModule(m, versionStr) {
    if (!opts.dry) ensureDir(m.out);
    const entry = m.src;

    if (m.isLib) {
        if (esbuild) {
            await runEsbuild(m, entry, makeBuildOpts(m, entry, null), versionStr, ' (lib)');
        } else {
            if (!fs.existsSync(entry)) { console.error(`❌ Source file not found for ${m.id}: ${entry}`); return; }
            const body = fs.readFileSync(entry, 'utf8');
            if (!opts.dry) fs.writeFileSync(m.out, body, 'utf8');
            updateFileVersion(m.out, versionStr, opts.dry);
            console.log(`📄 Copied(no esbuild, lib) ${m.id}: ${path.relative(ROOT, m.out)}`);
        }
        return;
    }

    let header = loadBannerForModule(m, versionStr, opts);
    header = injectUpdateDownload(header, m, versionStr, opts);

    if (esbuild) {
        await runEsbuild(m, entry, makeBuildOpts(m, entry, header), versionStr, '');
        if (opts.watch) return;
    } else {
        if (!fs.existsSync(entry)) { console.error(`❌ Source file not found for ${m.id}: ${entry}`); return; }
        const body = fs.readFileSync(entry, 'utf8');
        if (!opts.dry) fs.writeFileSync(m.out, header + body, 'utf8');
        updateFileVersion(m.out, versionStr, opts.dry);
        console.log(`📄 Copied(no esbuild) ${m.id}: ${path.relative(ROOT, m.out)}`);
    }
}



// --------------------------- main (modules-only) ---------------------------
(async () => {
    if (!opts.ids || !opts.ids.length) {
        opts.ids = MODULES.map(m => m.id);
        console.log(`ℹ️  No --ids specified; defaulting to all ${opts.ids.length} modules.`);
    }


    if (!PKG_PATH || !fs.existsSync(PKG_PATH)) {
        console.error(`❌ package.json not found under ${ SRC_ROOT } `);
        process.exit(1);
    }
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    pkg.tmFiles = pkg.tmFiles || {};
    pkg.tmVersions = pkg.tmVersions || {};

    const updatedPerIdVersion = {}; // { QT10: 'x.y.z', ... }

    // 1) Determine ONE global version (lockstep) and apply to all selected ids
    const curAll = (pkg.tmVersions && pkg.tmVersions.ALL) || '';
    const nextAll = nextDateVersion(curAll, opts.set);

    for (const id of opts.ids) {
        const files = (pkg.tmFiles[id] || []).map(p => path.resolve(path.dirname(PKG_PATH), p));
        if (!files.length) {
            console.warn(`⚠️  Module "${id}" has no files in package.json tmFiles`);
        }
        for (const fp of files) {
            updateFileVersion(fp, nextAll, opts.dry);
        }
        updatedPerIdVersion[id] = nextAll;

        const prevVersion = pkg.tmVersions[id] || '0.0.0';
        if (!opts.dry) pkg.tmVersions[id] = nextAll;
        console.log(`ℹ️  ${id}: ${prevVersion} → ${nextAll} `);
    }

    // Also bump the lockstep anchor
    if (!opts.dry) {
        pkg.tmVersions = pkg.tmVersions || {};
        pkg.tmVersions.ALL = nextAll;
    }

    // 2) persist package.json
    if (!opts.dry) {
        fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    }

    // 3) optionally emit bundled outputs
    if (opts.emit) {
        for (const id of opts.ids) {
            const m = resolveModuleById(id);
            if (!m) {
                console.warn(`⚠️  Unknown module id (emit skipped): ${ id } `);
                continue;
            }
            await emitModule(m, updatedPerIdVersion[id]);
        }

        if (opts.watch && esbuild) {
            console.log('👀 Watch mode active. Press Ctrl+C to stop.');
            // Keep process alive
            return;
        }
    }

    console.log(opts.dry ? '\n🧪 DRY RUN complete.' : `\n🎉 Done!${ opts.emit ? ' (bump + emit)' : ' (bump only)' } \n`);
    process.exit(0);
})().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
