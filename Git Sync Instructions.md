# Git Sync Instructions — Mechwarrior RPG Homebrew

GIT REPOSITORY WORKFLOW GUIDE
Syncing Updates into Mechwarrior RPG Homebrew
Step-by-step instructions for pulling changes from the rocky remote into a target subdirectory
Because your target project resides inside a subdirectory ( Mechwarrior RPG Homebrew ) of your
parent repository while your son's repository is standalone, syncing via a local Git clone with a
secondary remote named rocky lets you update the subfolder cleanly without affecting the rest of
your repository.
Role
Remote / Branch
Repository URL / Target Path
Your Parent Repo
origin / main
https://github.com/ravenclaw74/ravenclaw74.git
Target folder: Mechwarrior RPG Homebrew/
Son's Source Repo
rocky / main
https://github.com/CyberM00/mechwarrior-rpg-
homebrew.git
Step 1: Clone Your Parent Repository
Open your terminal and clone ravenclaw74/ravenclaw74 so you have a local working copy of your
main repository:
git clone https://github.com/ravenclaw74/ravenclaw74.git
cd ravenclaw74
Step 2: Add Your Son's Repository as the rocky Remote
Register CyberM00/mechwarrior-rpg-homebrew under the remote name rocky and fetch its main
branch without merging into your root directory:
git remote add rocky https://github.com/CyberM00/mechwarrior-rpg-homebrew.git
git fetch rocky main
Step 3: Extract rocky/main Files into the Subfolder
Ensure the target directory exists, then unpack the latest files from rocky/main directly into
Mechwarrior RPG Homebrew :
mkdir -p "Mechwarrior RPG Homebrew"
git archive rocky/main --format=tar | tar -x -C "Mechwarrior RPG Homebrew"
Step 4: Review Changes and Push to GitHub
Confirm that only files inside Mechwarrior RPG Homebrew were modified, then stage, commit, and
push to your origin repository:
Git Sync Instructions — Mechwarrior RPG Homebrew
Page 1 of 2


git status
git add "Mechwarrior RPG Homebrew"
git commit -m "Sync Mechwarrior RPG Homebrew from rocky/main"
git push origin main
Future Syncs: Once the rocky remote is configured in your local clone, you only need to run git
fetch rocky main followed by the git archive command (Step 3) and commit/push steps (Step 4)
whenever new updates are ready.
Git Sync Instructions — Mechwarrior RPG Homebrew
Page 2 of 2
