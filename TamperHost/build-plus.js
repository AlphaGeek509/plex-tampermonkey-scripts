const fs = require('fs');
const path = require('path');

// Read current version
const versionFile = path.join(__dirname, '.version');
if (!fs.existsSync(versionFile)) {
    console.error('❌ No .version file found. Create one with initial version like 2.1.0');
    process.exit(1);
}

let [major, minor, patch] = fs.readFileSync(versionFile, 'utf8').trim().split('.').map(Number);

// Handle CLI flags
const bump = process.argv.find(arg => arg.startsWith('--'));
switch (bump) {
    case '--major': major++; minor = 0; patch = 0; break;
    case '--minor': minor++; patch = 0; break;
    case '--patch': patch++; break;
    case undefined: console.log('⚠️ No bump flag provided. Using current version.'); break;
    default:
        console.error(`❌ Invalid bump type: ${bump}`);
        console.log('Use: --patch, --minor, or --major');
        process.exit(1);
}

const newVersion = `${major}.${minor}.${patch}`;
fs.writeFileSync(versionFile, newVersion, 'utf8');

const scriptDir = path.join(__dirname, 'wwwroot');
const files = fs.readdirSync(scriptDir)
    .filter(f => f.endsWith('.user.js'))
    .map(f => path.join(scriptDir, f));

if (files.length === 0) {
    console.warn('⚠️ No .user.js files found in wwwroot/');
    process.exit(0);
}

files.forEach(filePath => {
    const filename = path.basename(filePath);

    let content = fs.readFileSync(filePath, 'utf8');

    // Replace @version in metadata block
    content = content.replace(/(@version\s+)([^\s]+)/, `$1${newVersion}`);

    // Replace any const VERSION or TM_UTILS_VERSION
    content = content.replace(
        /(const\s+(TM_UTILS_VERSION|VERSION)\s*=\s*['"`])([^'"`]+)(['"`])/g,
        `$1${newVersion}$4`
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated ${filename} → ${newVersion}`);
});

console.log(`\n🎉 Build complete! New version: ${newVersion}`);
