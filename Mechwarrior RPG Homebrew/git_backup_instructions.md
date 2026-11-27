# Git Backup Instructions
**Mechwarrior RPG Homebrew module zip backup stored in Module Backups**

## Before You Start
* Close Foundry VTT. Its pack files (LevelDB) are locked while it runs.
* Make sure your work is committed and pushed, so the backup matches GitHub.
* Use Git Bash, opened in the repo root: `~/Documents/ravenclaw74`.
* Windows `tar.exe` is used because Git Bash has no `zip`, and it writes zips with forward slashes.

---

## Step-by-Step Guide

### 1. Stage a clean copy
The zip needs one top-level folder named `mechwarrior-rpg-homebrew`, so copy the module under that name first.

```bash
cd ~/Documents/ravenclaw74
rm -rf /tmp/zipstage && mkdir /tmp/zipstage
cp -r "Mechwarrior RPG Homebrew" /tmp/zipstage/mechwarrior-rpg-homebrew
```

### 2. Create the zip
```bash
cd /tmp/zipstage
/c/Windows/System32/tar.exe -a -c -f mechwarrior-rpg-homebrew.zip mechwarrior-rpg-homebrew
```

### 3. Check it
The first lines should start with `mechwarrior-rpg-homebrew/`.

```bash
/c/Windows/System32/tar.exe -tf mechwarrior-rpg-homebrew.zip | head
```

### 4. Overwrite the old backup
Copying into the folder keeps the same file name, so it replaces the old zip.

```bash
cp mechwarrior-rpg-homebrew.zip ~/Documents/ravenclaw74/"Module Backups"/
```

### 5. Commit and push
Git replaces the file at the same name; the previous version stays in the repo history.

```bash
cd ~/Documents/ravenclaw74
git add "Module Backups/mechwarrior-rpg-homebrew.zip"
git commit -m "Update Mechwarrior RPG Homebrew backup"
git push
```

---

## Notes
* Other zips in `Module Backups` (`mechwarrior-rpg-homebrew-v1.zip`, `acks-ii-homebrew.zip`) are not touched.
* **If you edit pack contents:** Change `src/packs/*.json`, then run `node tools/build-packs.mjs <pack>` from inside the module folder (Foundry closed) before making the backup.
* If `node` says `"stdin is not a tty"`, save scripts to a file and run `node file.js` rather than piping them in.
* **To restore:** Unzip and copy the `mechwarrior-rpg-homebrew` folder into Foundry's `Data/modules` folder.