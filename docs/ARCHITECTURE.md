# Architecture and privacy

The React workspace imports the TypeScript SDK. The SDK observes capture-phase click and change events and application path transitions. After review it sends a schema-v1 report to the Node API. SQLite provides a transactional local store with a single process and a named volume in Compose. This release chooses SQLite to avoid provisioning an additional service for the demo. The dashboard reads and exports reports through the project-scoped API. The generator maps schema-v1 events to Playwright calls and uses a reporter-authored assertion.

## Recording

- Start explicitly creates a new in-memory buffer. Stop removes event listeners and returns a copy for review. The SDK retains at most 80 events and 20 error signals. It preserves event timestamps, cleaned paths and optional integrator-supplied application version.
- Values require `data-bugrelay-allow`. Password and other unsupported input types are excluded, as are fields with common sensitive names, labels or autocomplete annotations. Dropdown reporting is also opt-in. Keep sensitive or personalized strings out of opted-in fields and locator names.
- All query parameters and fragments are omitted. A path heuristic masks common identifiers such as UUIDs and email-like segments. Supply a `path` callback when an application needs stronger route redaction or an app-relative path under a mounted base.
- Console errors, uncaught errors and rejected promises are recorded as timestamped signals. The recorder omits arguments, messages, stack traces, DOM snapshots, storage contents, cookies, request data and authorization headers.
- The reviewer can remove each event or error. Reporter text and locator names are treated as content and rendered with React escaping. Avoid including personal information in manual fields.
- The server strips unknown fields, rejects URLs that still contain sensitive URL components, caps each request at 256 KB and allows 500 retained reports in the local project. Dashboard deletion is immediate at the application level. Reports expire after 30 days, checked at startup and hourly. Local database files, backups and downloaded copies follow the operator's separate retention practices.

## Replay

Button and link clicks, committed changes to opted-in text fields, single-option selection, same-document pathname transitions, and visibility, exact text or URL assertions are supported. Locator resolution prioritizes a unique test ID, then a unique field label or button/link role and name. The name check is a conservative heuristic for ordinary DOM elements. It does not implement the full accessible-name algorithm. Stable test IDs work best for dynamic content.

Navigation events assert a path reached by preceding actions. For a bug that reaches the wrong final URL, remove the wrong observed transition during preview and set the intended URL assertion. Full-document recording, independent address-bar navigation, hash/query routing, iframe interaction, shadow DOM, drag and drop, keyboard shortcuts, file uploads and backend session capture are outside first-release scope. Known unsupported targets and unresolved locators are flagged. Arbitrary unrecognized pointer and keyboard activity may require a manual note. Exported drafts with warnings stop with a descriptive error until edited.

The dashboard starts each report at **Captured**. Generating a valid test produces **Test generated**. Drafts requiring review use **Needs review**. Local replay accepts only generated action and assertion sequences that match approved synthetic fixture code. It launches the identical test file in two Playwright projects, one per known loopback target. The buggy run must fail inside the named expected-outcome step to count as a reproduction. **Reproduction verified** records that result, and **Fix verified** additionally requires a passing fixed run. The bundled fixtures have deterministic initial state and require neither authentication nor network mocking.

Developers can revise the expected behavior and assertion from the dashboard while keeping the original interaction timeline. Mutations require the current report revision and the dashboard credential. An edit that changes generated code clears prior evidence. A wording-only edit preserves evidence, and an in-flight replay cannot overwrite a newer revision.

Developers run external tests in their own Playwright project. Set its base URL and arrange authentication, clean fixture data, route equivalence and app-specific prerequisites. The local API accepts no arbitrary replay targets, browser configuration or uploaded test source.

## Deployment boundary

The local server defaults to loopback and verifies loopback hostnames. Compose enables a container listener and binds its published port to loopback. The repository is publicly cloneable. For a public hosted dashboard, implement identity and project membership, per-project ingestion tokens, tenant isolation, HTTPS, abuse limits and a separately isolated replay worker before configuring an external listener. Set up durable database backups and test tenant boundaries before exposing it.
