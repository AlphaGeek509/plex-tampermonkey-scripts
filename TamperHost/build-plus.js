/**
 * build-plus.js — Version bump helper for Tampermonkey userscripts
 * -----------------------------------------------------------------------------
 * Purpose:
 *   - Bumps SemVer in userscripts by updating the `// @version` tag.
 *   - Designed to run on Windows (PowerShell/CMD) or macOS/Linux.
 *
 * Basic usage (choose ONE of: --patch | --minor | --major | --set):
 *   node .\build-plus.js --patch        // 1.2.3 -> 1.2.4
 *   node .\build-plus.js --minor        // 1.2.3 -> 1.3.0
 *   node .\build-plus.js --major        // 1.2.3 -> 2.0.0
 *   node .\build-plus.js --set 3.6.4    // explicit version
 *
 * Common options (can combine with the above):
 *   --dry-run            Show what would change without writing files
 *   --files "<glob>"     Limit which files are bumped (glob or space-separated)
 *                        e.g. --files ".\tampermonkey\*.user.js"
 *                             --files ".\QT20.user.js" ".\QT30.user.js"
 *
 * Notes:
 *   • By default, scans your configured userscript paths for *.user.js files and
 *     increments the `@version` tag in-place.
 *   • Use --dry-run first if you’re unsure.
 *   • Pair with npm scripts for convenience:
 *       "bump:patch": "node ./build-plus.js --patch",
 *       "bump:minor": "node ./build-plus.js --minor",
 *       "bump:major": "node ./build-plus.js --major",
 *       "bump:patch:dry": "node ./build-plus.js --patch --dry-run"
 *
 * Examples (PowerShell):
 *   npm run bump:patch
 *   node .\build-plus.js --minor --files ".\tampermonkey\*.user.js"
 *   node .\build-plus.js --set 4.1.0 --dry-run
 *
 * Tip:
 *   If Tampermonkey caches @require bundles, bumping @version triggers a reload.
 */

const fs = require('fs');
const path = require('path');

// --- tiny arg parser ---
const args = process.argv.slice(2);
const opts = { files: [] };
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--patch' || a === '--minor' || a === '--major') opts.bump = a.slice(2);
    else if (a === '--set') opts.set = args[++i];
    else if (a === '--dry-run') opts.dry = true;
    else if (a === '--files') {
        // accept one or many paths after --files until next --flag
        while (args[i + 1] && !args[i + 1].startsWith('--')) opts.files.push(args[++i]);
    }
}

// --- read & bump version file ---
const versionFile = path.join(__dirname, '.version');
if (!fs.existsSync(versionFile)) {
    console.error('❌ No .version file found. Create one like: 3.5.168');
    process.exit(1);
}
let [major, minor, patch] = fs.readFileSync(versionFile, 'utf8').trim().split('.').map(Number);

if (opts.set) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(opts.set);
    if (!m) { console.error('❌ --set requires SemVer like 3.6.4'); process.exit(1); }
    major = +m[1]; minor = +m[2]; patch = +m[3];
} else if (opts.bump) {
    if (opts.bump === 'major') { major++; minor = 0; patch = 0; }
    if (opts.bump === 'minor') { minor++; patch = 0; }
    if (opts.bump === 'patch') { patch++; }
} else {
    console.log('⚠️ No bump flag provided; using current version.');
}

const newVersion = `${major}.${minor}.${patch}`;
if (!opts.dry) fs.writeFileSync(versionFile, newVersion, 'utf8');

// --- resolve target files ---
let targets = [];
if (opts.files.length) {
    targets = opts.files.map(p => path.resolve(__dirname, p));
} else {
    // fallback: all .user.js in wwwroot (your current behavior)
    const scriptDir = path.join(__dirname, 'wwwroot');
    if (fs.existsSync(scriptDir)) {
        targets = fs.readdirSync(scriptDir)
            .filter(f => f.endsWith('.user.js'))
            .map(f => path.join(scriptDir, f));
    }
}

if (!targets.length) {
    console.warn('⚠️ No target .user.js files. Use --files "<path>" to specify one.');
    process.exit(0);
}

// --- apply replacements ---
const verRE = /(@version\s+)([^\s]+)/;
const constRE = /(const\s+(TM_UTILS_VERSION|VERSION)\s*=\s*['"`])([^'"`]+)(['"`])/g;

for (const filePath of targets) {
    if (!fs.existsSync(filePath)) { console.warn(`⚠️ Skip missing ${filePath}`); continue; }
    let content = fs.readFileSync(filePath, 'utf8');

    const before = content;
    content = content.replace(verRE, `$1${newVersion}`);
    content = content.replace(constRE, `$1${newVersion}$4`);

    if (before === content) {
        console.log(`ℹ️  No @version/const markers found in ${path.basename(filePath)} (still writing version file).`);
    } else if (opts.dry) {
        console.log(`🧪 DRY: Would update ${path.basename(filePath)} → ${newVersion}`);
    } else {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Updated ${path.basename(filePath)} → ${newVersion}`);
    }
}

console.log(opts.dry
    ? `\n🧪 DRY RUN complete. Proposed version: ${newVersion}`
    : `\n🎉 Build complete! New version: ${newVersion}`);
