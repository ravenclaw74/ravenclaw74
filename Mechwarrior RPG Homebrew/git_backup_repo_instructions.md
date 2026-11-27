# Git Backup Repo Instructions
*Workflow Reference: Git Bash for Windows*

Standard operating procedure for building module packs, rotating backup archives, and pushing updates to `origin main`.

| Resource | Windows / Git Bash Path |
| :--- | :--- |
| **Module Repository** | `/c/Users/Owner/Documents/ravenclaw74/Mechwarrior RPG Homebrew` |
| **Backup Directory** | `/c/Users/Owner/Documents/ravenclaw74/Module Backups` |
| **Active Backup File** | `mechwarrior-rpg-homebrew.zip` |

---

## Step 1: Navigate to the Module Directory & Build Packs
Open Git Bash and ensure your working directory is inside the `Mechwarrior RPG Homebrew` folder before executing the pack build script.

```bash
cd "/c/Users/Owner/Documents/ravenclaw74/Mechwarrior RPG Homebrew"
node tools/build-packs.mjs atow-checks
```

* **Verification:** Terminal outputs `built atow-checks: 22 records` (or the updated record count) with no missing module errors.

## Step 2: Rotate the Existing Backup Archive
Rename the current backup archive inside `Module Backups` to preserve the previous version before generating a fresh archive.

```bash
mv "/c/Users/Owner/Documents/ravenclaw74/Module Backups/mechwarrior-rpg-homebrew.zip" \
"/c/Users/Owner/Documents/ravenclaw74/Module Backups/mechwarrior-rpg-homebrew-v2.zip"
```

* **Verification:** Run `ls -la "/c/Users/Owner/Documents/ravenclaw74/Module Backups"` and confirm `mechwarrior-rpg-homebrew-v2.zip` is listed.

## Step 3: Create the New Backup Zip Archive
Because Git Bash for Windows does not include `zip.exe` by default, use Windows' built-in `tar` utility from the module root to generate the new `.zip` archive while excluding the `.git` metadata directory.

```bash
tar -a -cf "/c/Users/Owner/Documents/ravenclaw74/Module Backups/mechwarrior-rpg-homebrew.zip" \
--exclude=".git" .
```

* **Verification:** Run `ls -lh "/c/Users/Owner/Documents/ravenclaw74/Module Backups"` and confirm `mechwarrior-rpg-homebrew.zip` exists with a non-zero file size alongside `mechwarrior-rpg-homebrew-v2.zip`.

## Step 4: Stage, Commit, and Push Changes to Git
Review your modified files, stage the updated packs and repository files, create a descriptive commit, and push to the remote `main` branch.

```bash
git status
git add -A
git commit -m "Update atow-checks pack and rotate module backup"
git push origin main
```

* **Verification:** `git push` finishes with `main -> main` and `git status` reports a clean working tree.