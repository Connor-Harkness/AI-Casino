# AI-Casino Repository

AI-Casino is a minimal repository in early development stages focused on implementing casino games including poker, blackjack, and roulette.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Current Repository State

This repository is currently in its initial development phase with minimal structure:
- **Single source file**: `Games` containing the list of planned casino games
- **No build system**: No package.json, Makefile, or build scripts present
- **No tests**: No testing framework or test files
- **No dependencies**: No external dependencies or package managers configured
- **No CI/CD**: No GitHub Actions workflows configured

## Working Effectively

### Initial Repository Exploration
Always start with these validated commands to understand the current state:

```bash
# Navigate to repository root
cd /home/runner/work/AI-Casino/AI-Casino

# Verify current location
pwd

# Check repository structure
ls -la

# View the current games list
cat Games

# Check git status
git --no-pager status

# Review recent commits
git --no-pager log --oneline -n 5

# Find all project files (excluding .git)
find . -type f -not -path './.git/*'
```

### Development Setup
Since this is a minimal repository with no build system:
- **No installation required**: Repository works immediately after cloning
- **No dependencies to install**: No npm install, pip install, or similar commands needed
- **No build process**: No compilation or build steps required
- **No database setup**: No database or external services needed

### Running and Testing
Currently there are no executable components:
- **No application to run**: No main entry point or startup scripts
- **No tests to execute**: No test suite available
- **No linting tools**: No code formatting or linting configured

### File Structure Overview
```
AI-Casino/
├── .git/              # Git repository data
├── .github/           # GitHub configuration (created for instructions)
│   └── copilot-instructions.md
└── Games              # Simple text file listing casino games
```

## Validation and Quality Checks

Since there are no automated tools configured:
- **Manual review required**: Always manually review code changes
- **No automated linting**: No pre-commit hooks or linting tools to run
- **No automated testing**: All functionality must be manually validated
- **Git operations only**: Use standard git commands for version control

## Common Operations

### Viewing Repository Content
```bash
# List all files in repository
find . -type f -not -path './.git/*' | sort

# View the games list
cat Games

# Check for hidden files
ls -la

# View git history
git --no-pager log --oneline --all
```

### Making Changes
```bash
# Check current status before making changes
git --no-pager status

# After making changes, review them
git --no-pager diff

# Stage and commit changes
git add .
git commit -m "Description of changes"
```

### Repository Information
```bash
# Check current branch
git branch --show-current

# View remote information
git remote -v

# Check for uncommitted changes
git --no-pager status --porcelain
```

## Development Guidelines

### Future Development Considerations
When expanding this repository, consider:
- **Choose a technology stack**: Web (HTML/CSS/JS), Python, Node.js, etc.
- **Add package management**: package.json for Node.js, requirements.txt for Python, etc.
- **Implement build system**: webpack, vite, or similar for web apps
- **Add testing framework**: Jest, pytest, or appropriate testing tools
- **Configure linting**: ESLint, flake8, or language-appropriate linters
- **Set up CI/CD**: GitHub Actions workflows for automated testing and deployment

### Code Organization
As the project grows:
- Create separate directories for each game (`/poker`, `/blackjack`, `/roulette`)
- Add a main README.md with project documentation
- Consider adding `src/` directory for source code
- Add `tests/` directory for test files
- Include configuration files (`.gitignore`, editor configs)

## Troubleshooting

### Common Issues
- **Empty repository feel**: This is expected in the current state
- **No commands to run**: Repository is in planning/early development phase
- **Missing typical project files**: Will be added as development progresses

### Getting Help
Since this is a minimal repository:
- Review the `Games` file to understand the planned scope
- Check git history to understand recent changes
- Look for any new files that may have been added since these instructions were created

## Quick Reference Commands

The following are outputs from frequently run commands to save time:

### Repository Root Listing
```bash
ls -la
total 20
drwxr-xr-x 4 runner docker 4096 Aug 28 05:39 .
drwxr-xr-x 3 runner docker 4096 Aug 28 05:36 ..
drwxr-xr-x 7 runner docker 4096 Aug 28 05:38 .git
drwxr-xr-x 2 runner docker 4096 Aug 28 05:39 .github
-rw-r--r-- 1 runner docker   30 Aug 28 05:37 Games
```

### Games File Content
```bash
cat Games
poker, blackjack and roulette
```

### Git Status (Clean State)
```bash
git --no-pager status
On branch copilot/fix-3
Your branch is up to date with 'origin/copilot/fix-3'.

nothing to commit, working tree clean
```