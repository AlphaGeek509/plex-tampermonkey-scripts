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

## Step 5 — Merge to master and tag

Ask the user to confirm before touching master. Then:
```
git checkout master
git merge --no-ff develop -m "Merge develop into master for vYYYY.MM.DD.N"
git tag vYYYY.MM.DD.N
git push origin master
git push origin vYYYY.MM.DD.N
git checkout develop
```

Pause and confirm each push succeeded before continuing.

## Step 6 — Merge master back to develop

```
git merge --no-ff master -m "Merge master back to develop after vYYYY.MM.DD.N"
git push
```

## Step 7 — Report completion

Summarize what was done:
- Version released
- Tag pushed
- Both branches up to date

Remind the user that jsDelivr serves `@latest` automatically and TamperMonkey checks for updates every 6 hours.
