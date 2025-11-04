# Git Setup Instructions

## Initial Setup

Once Git is installed, run these commands in the project root directory:

```bash
# Initialize git repository (if not already initialized)
git init

# Add the remote repository
git remote add origin https://github.com/MCSteynMD/MDStockCountApp.git

# Stage all files
git add .

# Create initial commit
git commit -m "Initial commit: Stock Control App"

# Push to repository
git push -u origin main
```

## If the repository already exists and has content

If the remote repository already has commits, you may need to:

```bash
# Pull existing content first
git pull origin main --allow-unrelated-histories

# Then push
git push -u origin main
```

## Branch Names

If your default branch is `master` instead of `main`:

```bash
# Rename branch to main
git branch -M main

# Then push
git push -u origin main
```

## Future Commits

For future changes:

```bash
# Stage changes
git add .

# Commit with message
git commit -m "Your commit message here"

# Push to repository
git push
```

