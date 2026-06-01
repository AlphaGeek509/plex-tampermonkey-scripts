Execute the release process for plex-tampermonkey-scripts. Follow these steps exactly, pausing for confirmation before any destructive or push operation.

## Step 1 — Verify branch and working tree

- Confirm the current branch is `develop`
- Confirm there are no uncommitted changes (warn if there are and ask whether to proceed)

## Step 2 — Build the release

From `TamperHost/tm-scripts/`, run:
```
npm run release:all
```

This bumps the CalVer version (`YYYY.MM.DD.N`), minifies all modules, and writes output to `TamperHost/wwwroot/`. Capture the new version number from the build output.

## Step 3 — Confirm the version

Show the user the detected version and ask them to confirm before proceeding.

## Step 4 — Commit and push to develop

Stage only the release files:
```
git add TamperHost/build-plus.js TamperHost/tm-scripts/package.json TamperHost/tm-scripts/src/shared/ TamperHost/wwwroot/
```

Commit using the standard release message pattern:
```
chore(release): build userscripts for YYYY.MM.DD.N
```

Push to `origin/develop`. Pause and show the user the result before continuing.

## Step 5 — Merge to master, tag, and create GitHub Release

Ask the user to confirm before touching master. Then:
```
git checkout master
git merge --no-ff develop -m "Merge develop into master for vYYYY.MM.DD.N"
git tag vYYYY.MM.DD.N
git push origin master
git push origin vYYYY.MM.DD.N
git checkout develop
```

After the tag push, create a GitHub Release so jsDelivr resolves `@latest` correctly:
```
gh release create vYYYY.MM.DD.N --title "vYYYY.MM.DD.N" --notes "Release vYYYY.MM.DD.N"
```

Pause and confirm each push succeeded before continuing.

## Step 6 — Purge jsDelivr CDN cache

Purge the `@latest` cache for all userscript files so users get the new version immediately:

```powershell
$pkg = Get-Content "TamperHost/tm-scripts/package.json" | ConvertFrom-Json
$files = $pkg.tmFiles.PSObject.Properties.Value | ForEach-Object { Split-Path $_[1] -Leaf } | Sort-Object -Unique
$base = "https://purge.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@latest/TamperHost/wwwroot"
foreach ($f in $files) {
    $res = Invoke-WebRequest "$base/$f"
    Write-Host "$f — $($res.StatusCode)"
}
```

Confirm all files returned `200` before continuing.

## Step 7 — Merge master back to develop

```
git merge --no-ff master -m "Merge master back to develop after vYYYY.MM.DD.N"
git push
```

## Step 8 — Report completion

Summarize what was done:
- Version released
- Tag pushed
- Both branches up to date

Remind the user that:
- jsDelivr resolves `@latest` from GitHub Releases (not raw git tags) — the `gh release create` step above is what makes `@updateURL`/`@downloadURL` point to the new version
- TamperMonkey checks for updates every 24 hours by default; users can trigger a manual check from the TM dashboard
- jsDelivr may take a few minutes to propagate the new release; if users see the old version, they can purge: `https://purge.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@latest/TamperHost/wwwroot/`
