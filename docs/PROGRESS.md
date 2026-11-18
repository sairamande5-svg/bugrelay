# Implementation milestones

1. **Vertical slice** — React recorder, reviewed submission, SQLite storage, project-scoped dashboard and downloadable deterministic Playwright/JSON exports.
2. **Reproduction** — approved synthetic bug pairs and Playwright expected-outcome step evidence. See benchmark results for measured outcomes.
3. **Product** — click, fill, select and route observations, assertion builder, locator diagnostics, error signals, preview removals, project permissions, deletion and expiry.
4. **Release** — local Compose configuration, GitHub Actions, MIT license, contributor extension guide, browser benchmark and future user study protocol.

The hosted product requires the deployment work described in the architecture page. SQLite and local credentials are intentional first-release choices.


## Dashboard and onboarding update

- Added title, application version and report ID search, plus status filtering.
- Added expectation editing with stale-write detection and replay evidence tied to the tested revision.
- Added Docker-free Windows launch instructions and Linux/Windows CI coverage for the browser workflow.
