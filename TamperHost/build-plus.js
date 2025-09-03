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
const readline = require('readline');

// Try to load esbuild (optional)
let esbuild = null;
try { esbuild = require('esbuild'); } catch { /* optional */ }

// --------------------------- arg parsing ---------------------------
const args = process.argv.slice(2);
const opts = {
    bump: null,      // 'patch' | 'minor' | 'major'
    set: null,       // 'x.y.z'
    ids: null,       // array of module ids (e.g., ['QT10'])
    dry: false,
    emit: false,     // if true, build/copy outputs for known modules
    release: false,  // if true and esbuild present, minify + remove sourcemap
    watch: false     // esbuild watch (dev)
};

function usage(exitCode = 0) {
    console.log(`
Usage:
  node build-plus.js --patch --ids QT10 --emit --watch
  node build-plus.js --set 3.6.0 --ids QT35 --emit --release
  node build-plus.js --minor --emit                 # interactive picker

Flags:
  --patch | --minor | --major   Choose a bump type
  --set 1.2.3                   Set exact version (overrides bump type)
  --ids <id...>                 Modules to process (QT10, QT20, QT30, QT35)
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
    else if (a === '--patch') opts.bump = 'patch';
    else if (a === '--minor') opts.bump = 'minor';
    else if (a === '--major') opts.bump = 'major';
    else if (a === '--set') { opts.set = args[++i]; }
    else if (a === '--ids') {
        opts.ids = [];
        while (args[i + 1] && !args[i + 1].startsWith('--')) opts.ids.push(args[++i]);
    } else {
        console.warn(`⚠️  Unknown arg: ${a}`);
    }
}

if (!opts.bump && !opts.set) {
    console.error('❌ You must pass a bump mode (--patch|--minor|--major) or --set X.Y.Z');
    usage(1);
}

// --------------------------- constants / mapping ---------------------------
const ROOT = __dirname;
const SRC_ROOT = path.join(ROOT, 'tm-scripts');
const PKG_PATH = path.join(SRC_ROOT, 'package.json');

// Known module → src/out mapping for emit step
const MODULES = [
    {
        id: 'QT10',
        featureName: 'Customer Catalog Get',
        bannerBase: 'CustomerCatalogGet', // optional feature-based banner name support
        src: path.join(SRC_ROOT, 'src', 'quote-tracking', 'CustomerCatalogGet', 'index.js'),
        out: path.join(ROOT, 'wwwroot', 'qt10.user.js')
    },
    {
        id: 'QT20',
        featureName: 'Part Stock Level Get',
        bannerBase: 'PartStockLevelGet',
        src: path.join(SRC_ROOT, 'src', 'quote-tracking', 'PartStockLevelGet', 'index.js'),
        out: path.join(ROOT, 'wwwroot', 'qt20.user.js')
    },
    {
        id: 'QT30',
        featureName: 'Part Catalog Pricing Get',
        bannerBase: 'PartCatalogPricingGet',
        src: path.join(SRC_ROOT, 'src', 'quote-tracking', 'PartCatalogPricingGet', 'index.js'),
        out: path.join(ROOT, 'wwwroot', 'qt30.user.js')
    },
    {
        id: 'QT35',
        featureName: 'Quote Attachments Get',
        bannerBase: 'QuoteAttachmentsGet',
        src: path.join(SRC_ROOT, 'src', 'quote-tracking', 'QuoteAttachmentsGet', 'index.js'),
        out: path.join(ROOT, 'wwwroot', 'qt35.user.js')
    },
    {
        id: 'QT50',
        featureName: 'Quote Validation',
        bannerBase: 'QuoteValidation',
        src: path.join(SRC_ROOT, 'src', 'quote-tracking', 'QuoteValidation', 'index.js'),
        out: path.join(ROOT, 'wwwroot', 'qt50.user.js')
    }
];

// --------------------------- helpers ---------------------------
function bumpSemver(ver, mode, setStr) {
    if (setStr) return setStr;
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver || '0.0.0');
    let [maj, min, pat] = m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
    if (mode === 'major') { maj++; min = 0; pat = 0; }
    else if (mode === 'minor') { min++; pat = 0; }
    else /* patch/default */ { pat++; }
    return `${maj}.${min}.${pat}`;
}

function ensureDir(p) {
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
    console.log(`${dry ? '🧪 DRY' : '✅'} ${base} → ${newVersion}${changed ? '' : ' (no changes)'}`);
    return { skipped: false, changed, hadMarkers };
}

function resolveModuleById(id) {
    return MODULES.find(m => m.id.toLowerCase() === id.toLowerCase());
}

// Banner loader: prefers ID-based names; supports feature-based names as fallback
function loadBannerForModule(m, versionStr, opts) {
    const env = opts.release ? 'prod' : 'dev';
    const candidates = [
        path.join(SRC_ROOT, 'banners', `${m.id}.${env}.header.js`),
        m.bannerBase ? path.join(SRC_ROOT, 'banners', `${m.bannerBase}.${env}.header.js`) : null,
        // Fallback to opposite env if not found
        path.join(SRC_ROOT, 'banners', `${m.id}.${env === 'prod' ? 'dev' : 'prod'}.header.js`),
        m.bannerBase ? path.join(SRC_ROOT, 'banners', `${m.bannerBase}.${env === 'prod' ? 'dev' : 'prod'}.header.js`) : null
    ].filter(Boolean);

    let header = '';
    const chosen = candidates.find(p => fs.existsSync(p));
    if (chosen) {
        header = fs.readFileSync(chosen, 'utf8');
    } else {
        // minimal fallback header if none provided
        header =
            `// ==UserScript==
// @name         ${m.featureName} [${m.id}]
// @namespace    Lyn-Tron / OneMonroe
// @version      ${versionStr}
// @description  Internal tooling for Plex apps
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

`;
    }

    // Normalize line endings and force a trailing newline
    header = header.replace(/\r\n/g, '\n');
    if (!header.endsWith('\n')) header += '\n';

    // Ensure banner @version matches the new version
    header = header.replace(/(@version\s+)([^\s]+)/g, `$1${versionStr}`);

    return header;
}

async function emitModule(m, versionStr) {
    ensureDir(m.out);
    const entry = m.src;
    const header = loadBannerForModule(m, versionStr, opts);

    if (esbuild) {
        const buildOpts = {
            entryPoints: [entry],
            bundle: true,
            outfile: m.out,
            banner: { js: header },
            sourcemap: opts.release ? false : 'inline',
            minify: !!opts.release,
            target: ['chrome110', 'edge110', 'firefox110'],
            legalComments: 'none'
        };

        if (opts.watch) {
            const ctx = await esbuild.context(buildOpts);
            await ctx.watch();
            console.log(`👀 Watching ${m.id} (${path.relative(ROOT, entry)}) → ${path.relative(ROOT, m.out)}`);
            return;
        } else {
            await esbuild.build(buildOpts);
            // Ensure output reflects the bumped version (also updates any VERSION constants)
            updateFileVersion(m.out, versionStr, opts.dry);
            console.log(`📦 Emitted ${m.id}: ${path.relative(ROOT, m.out)}`);
        }
    } else {
        // Fallback: concatenate banner + source (no bundling)
        if (!fs.existsSync(entry)) {
            console.error(`❌ Source file not found for ${m.id}: ${entry}`);
            return;
        }
        const body = fs.readFileSync(entry, 'utf8');
        const out = header + body;

        if (!opts.dry) fs.writeFileSync(m.out, out, 'utf8');
        updateFileVersion(m.out, versionStr, opts.dry);

        console.log(`📄 Copied (no esbuild) ${m.id}: ${path.relative(ROOT, m.out)}`);
    }
}

// Interactive selection (no deps):
function promptSelectModules(modules) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        console.log('\nSelect module(s) to process:');
        modules.forEach((m, i) => {
            console.log(`  ${i + 1}. ${m.id} — ${m.featureName}`);
        });
        console.log('  a. ALL\n');
        console.log('Tip: enter a single number (e.g., 1) or a comma list (e.g., 1,3).');

        rl.question('Your choice: ', (answer) => {
            rl.close();
            const trimmed = (answer || '').trim().toLowerCase();
            if (!trimmed || trimmed === 'a' || trimmed === 'all') {
                resolve(modules.map(m => m.id));
                return;
            }
            const picks = trimmed.split(',').map(s => s.trim()).filter(Boolean);
            const chosen = [];
            for (const p of picks) {
                const idx = Number(p);
                if (!Number.isNaN(idx) && idx >= 1 && idx <= modules.length) {
                    chosen.push(modules[idx - 1].id);
                }
            }
            resolve(chosen.length ? chosen : []);
        });
    });
}

// --------------------------- main (modules-only) ---------------------------
(async () => {
    if (!opts.ids || !opts.ids.length) {
        // Ask interactively which modules to operate on
        const chosen = await promptSelectModules(MODULES);
        if (!chosen.length) {
            console.error('No modules selected. Exiting.');
            process.exit(1);
        }
        opts.ids = chosen;
    }

    if (!PKG_PATH || !fs.existsSync(PKG_PATH)) {
        console.error(`❌ package.json not found under ${SRC_ROOT}`);
        process.exit(1);
    }
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    pkg.tmFiles = pkg.tmFiles || {};
    pkg.tmVersions = pkg.tmVersions || {};

    const updatedPerIdVersion = {}; // { QT10: 'x.y.z', ... }

    // 1) bump versions & update files registered to each module
    for (const id of opts.ids) {
        const cur = pkg.tmVersions[id] || '0.0.0';
        const next = bumpSemver(cur, opts.bump, opts.set);
        updatedPerIdVersion[id] = next;

        const files = (pkg.tmFiles[id] || []).map(p => path.resolve(path.dirname(PKG_PATH), p));
        if (!files.length) {
            console.warn(`⚠️  Module "${id}" has no files in package.json tmFiles`);
        }
        for (const fp of files) {
            updateFileVersion(fp, next, opts.dry);
        }

        if (!opts.dry) pkg.tmVersions[id] = next;
        console.log(`ℹ️  ${id}: ${cur} → ${next}`);
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
                console.warn(`⚠️  Unknown module id (emit skipped): ${id}`);
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

    console.log(opts.dry ? '\n🧪 DRY RUN complete.' : `\n🎉 Done!${opts.emit ? ' (bump + emit)' : ' (bump only)'}\n`);
    process.exit(0);
})().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
