# Pixeldarium Gemini Instructions

Follow `AGENTS.md` for project scope, runtime architecture, Linear routing, and verification expectations.

This repository also follows `CODING_STANDARDS.md`, enforced by the global `code-quality` Gemini plugin at:

`C:\Users\Aaron\.gemini\config\plugins\code-quality\`

Before marking work complete:

- Run focused checks for touched modules.
- Run `npx fallow health` and confirm the Fallow score does not regress.
- Run `node scripts/run-all-tests.js` and report known baseline failures separately from new failures.
- Do not add new `window.*` migration globals, `innerHTML`, or large functions that worsen the health score.
