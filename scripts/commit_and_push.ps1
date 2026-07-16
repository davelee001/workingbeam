$repo = 'e:\Projects\workingbeam'
Set-Location $repo

# Configure git user
git config user.name "davelee001"
git config user.email "david.leekaleer@student.utamu.ac.ug"
Write-Output "Git user configured: $(git config user.name) <$(git config user.email)>"

# Gather files
$untracked = git ls-files -o --exclude-standard
$modified = git ls-files -m
$all = @()
if ($untracked -ne $null -and $untracked -ne '') { $all += $untracked }
if ($modified -ne $null -and $modified -ne '') { $all += $modified }

if ($all.Count -eq 0) {
  Write-Output "No changes to commit."
  exit 0
}

Write-Output "Files to commit:"
$all | ForEach-Object { Write-Output " - $_" }

foreach ($f in $all) {
  Write-Output "Staging and committing: $f"
  git add -- "$f"
  git commit -m "Add/Update: $f"
}

$branch = git rev-parse --abbrev-ref HEAD
Write-Output "Current branch: $branch"
Write-Output "Remotes:"
git remote -v

# Attempt to push
Write-Output "Pushing to origin/$branch..."
git push origin $branch
Write-Output "Push complete."
