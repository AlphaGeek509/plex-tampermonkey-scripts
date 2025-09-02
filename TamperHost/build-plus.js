/**
 * build-plus.js
 *
 * Two modes:
 *  1) Module mode (preferred):  node ..\build-plus.js --patch --ids utils QT10
 *     - Uses tm-tdd/package.json { tmVersions, tmFiles } to bump specific modules
 *     - Updates @version (Tampermonkey) and any *VERSION* constants in those files
 *
 *  2) Single-number mode (legacy): node ..\build-plus.js --patch --files .\src\fileA.js .\banners\fileB.js
 *     - Reads/writes a single ./.version file and applies the new version to the listed files
 *
 * Common flags:
 *   --patch | --minor | --major  (choose one)
 *   --set 1.2.3                   (overrides bump mode)
 *   --ids <module...>             (module names from package.json tmVersions/tmFiles)
 *   --files <paths...>            (explicit files, relative to current working dir)
 *   --dry                         (no writes; print what would change)
 *   --help
 */

const fs = require('fs');
const path = require('path');

// --------------------------- arg parsing ---------------------------
const args = process.argv.slice(2);
const opts = {
    bump: null,      // 'patch' | 'minor' | 'major'
    set: null,       // 'x.y.z'
    ids: null,       // array of module ids
    files: null,     // array of file paths
    dry: false
};

function usage(exitCode = 0) {
    console.log(`
Usage:
  Module mode (preferred per-module versions):
    node ..\\build-plus.js --patch --ids utils QT10
    node ..\\build-plus.js --set 3.6.0 --ids QT35

  Legacy single-number mode (.version file):
    node ..\\build-plus.js --minor --files .\\tm-tdd\\banners\\QT10.dev.header.js .\\release\\QT10.user.js

Flags:
  --patch | --minor | --major   Choose a bump type
  --set 1.2.3                   Set exact version (overrides bump type)
  --ids <id...>                 Modules to bump (from package.json tmVersions/tmFiles)
  --files <path...>             File paths to update (legacy mode)
  --dry                         Dry run (no writes)
  --help                        Show this help
  `.trim());
    process.exit(exitCode);
}

// simple flag reader
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') usage(0);
    else if (a === '--dry') opts.dry = true;
    else if (a === '--patch') opts.bump = 'patch';
    else if (a === '--minor') opts.bump = 'minor';
    else if (a === '--major') opts.bump = 'major';
    else if (a === '--set') { opts.set = args[++i]; }
    else if (a === '--ids') {
        opts.ids = [];
        while (args[i + 1] && !args[i + 1].startsWith('--')) opts.ids.push(args[++i]);
    } else if (a === '--files') {
        opts.files = [];
        while (args[i + 1] && !args[i + 1].startsWith('--')) opts.files.push(args[++i]);
    } else {
        console.warn(`⚠️  Unknown arg: ${a}`);
    }
}

if (!opts.bump && !opts.set) {
    console.error('❌ You must pass a bump mode (--patch|--minor|--major) or --set X.Y.Z');
    usage(1);
}

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

function updateFileVersion(filePath, newVersion, dry = false) {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  Skip missing ${filePath}`);
        return { skipped: true, changed: false, hadMarkers: false };
    }
    const original = fs.readFileSync(filePath, 'utf8');
    let content = original;

    // 1) Tampermonkey @version meta
    content = content.replace(/(@version\s+)([^\s]+)/g, `$1${newVersion}`);

    // 2) Any JS constants with "VERSION" in the name:
    //    const VERSION = 'x'; export const VERSION = "x"; const TM_UTILS_VERSION = `x`
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

// --------------------------- MODE 1: module IDs ---------------------------
if (opts.ids && opts.ids.length) {
    const pkgPath = path.join(__dirname, 'tm-tdd', 'package.json'); // adjust if your structure changes
    if (!fs.existsSync(pkgPath)) {
        console.error(`❌ package.json not found at ${pkgPath}`);
        process.exit(1);
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.tmFiles = pkg.tmFiles || {};
    pkg.tmVersions = pkg.tmVersions || {};

    let touched = 0;
    for (const id of opts.ids) {
        const cur = pkg.tmVersions[id] || '0.0.0';
        const next = bumpSemver(cur, opts.bump, opts.set);

        // collect files for this module (resolve from repo root)
        const files = (pkg.tmFiles[id] || []).map(p => path.resolve(__dirname, p));
        if (!files.length) {
            console.warn(`⚠️  Module "${id}" has no files in package.json tmFiles`);
        }

        // update each file
        for (const fp of files) {
            updateFileVersion(fp, next, opts.dry);
            touched++;
        }

        // update the module version in package.json
        if (!opts.dry) pkg.tmVersions[id] = next;
        console.log(`ℹ️  ${id}: ${cur} → ${next}`);
    }

    if (!opts.dry) {
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    }
    console.log(opts.dry ? '\n🧪 DRY RUN complete.' : `\n🎉 Module bump complete! Files touched: ${touched}`);
    process.exit(0);
}

// --------------------------- MODE 2: single .version + files ---------------------------
if (!opts.files || !opts.files.length) {
    console.error('❌ No files provided for legacy mode. Use --files <paths...> or switch to --ids.');
    usage(1);
}

const versionPath = path.join(__dirname, '.version');
let curVersion = '0.0.0';
if (fs.existsSync(versionPath)) {
    curVersion = (fs.readFileSync(versionPath, 'utf8') || '').trim() || '0.0.0';
}
const nextVersion = bumpSemver(curVersion, opts.bump, opts.set);

// update .version
if (!opts.dry) fs.writeFileSync(versionPath, nextVersion + '\n', 'utf8');
console.log(`ℹ️  .version: ${curVersion} → ${nextVersion}`);

// update the provided files (paths are relative to current working dir)
let touched = 0;
for (const rel of opts.files) {
    const fp = path.resolve(process.cwd(), rel);
    updateFileVersion(fp, nextVersion, opts.dry);
    touched++;
}
console.log(opts.dry ? '\n🧪 DRY RUN complete.' : `\n🎉 Legacy bump complete! Files touched: ${touched}`);
