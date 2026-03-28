# CLAUDE.md

This file provides guidance to AI assistants (Claude and others) working in this repository.

## Repository Overview

**Repository:** `karamathalip/karamathalip`
**Type:** GitHub Profile Repository
**Purpose:** This is a special GitHub repository whose `README.md` is displayed on the GitHub profile page for the user `karamathalip`.

As of the initial creation of this file, the repository is in its earliest stage with no committed source files. This CLAUDE.md should be updated as the project grows.

## Repository Structure

```
karamathalip/
├── CLAUDE.md          # This file — AI assistant guidance
└── README.md          # GitHub profile README (displayed on github.com/karamathalip)
```

As new content is added (projects, assets, configurations), update the structure above.

## Development Workflow

### Branches

- `main` — Default branch; content here is publicly visible on the GitHub profile.
- Feature branches — Use descriptive names, e.g. `add-projects-section`, `update-bio`.

### Making Changes

1. Create a feature branch from `main`:
   ```bash
   git checkout -b <branch-name>
   ```
2. Make and stage changes:
   ```bash
   git add <files>
   ```
3. Commit with a clear, concise message:
   ```bash
   git commit -m "brief description of change"
   ```
4. Push the branch:
   ```bash
   git push -u origin <branch-name>
   ```
5. Open a pull request to `main` when ready.

### Commit Message Conventions

- Use the imperative mood: `Add projects section`, not `Added` or `Adding`
- Keep the subject line under 72 characters
- Reference issues when applicable: `Fix typo in bio (#3)`

## Key Conventions

### README.md (GitHub Profile)

- Keep the profile README concise, professional, and up to date.
- Use GitHub-flavored Markdown (GFM).
- Prefer relative links for any assets stored in this repository.
- Images/badges should have descriptive alt text for accessibility.
- Avoid hard-coding dates — use dynamic elements (GitHub stats widgets, etc.) where possible.

### Assets

- Store images under an `assets/` or `images/` directory if needed.
- Use descriptive filenames: `profile-banner.png`, not `img1.png`.
- Prefer SVG over raster formats for logos and icons when available.

### Secrets and Sensitive Data

- **Never** commit API keys, tokens, passwords, or personal information.
- Use GitHub Actions secrets for any automation that requires credentials.

## Automation / GitHub Actions

If CI/CD workflows are added under `.github/workflows/`, document them here. Common uses for a profile repo include:

- Auto-updating README stats (e.g. latest blog posts, GitHub activity)
- Linting Markdown files

## Notes for AI Assistants

- This is a **public** repository — all content is visible to everyone. Do not add any sensitive information.
- When updating the README, preserve the owner's voice and tone.
- Prefer minimal, clean Markdown; avoid over-engineering the profile page.
- Always commit to a feature branch, not directly to `main`.
- After pushing changes, remind the user to open a pull request if one has not been created.
- Keep this `CLAUDE.md` up to date as the repository evolves.
