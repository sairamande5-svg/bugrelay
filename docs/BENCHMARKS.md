# Benchmark results

Measured November 17, 2026 in the Codex Linux x64 environment with Node.js 24.22.1, system Chromium 156.0.8078.79, Linux 6.18.57 and an AMD EPYC 9V74 host. For local reproduction, run `npm ci`, install Chromium with `npx playwright install chromium`, then run `npm run benchmark`. Set `CHROMIUM_PATH` to use system Chromium and `BENCHMARK_REPEATS` to change the default of three runs per fixture. The benchmark starts a temporary API and database on loopback.

| Metric | Observed |
| --- | ---: |
| Replay-ready test generation | 4 / 5 reports |
| Intended assertion failure on the buggy build | 12 / 12 runs |
| Pass on the fixed build | 12 / 12 runs |
| Fixtures with differing outcomes across repeated pairs | 0 / 4 fixtures, 3 pairs each |
| Ambiguous locator | 1 / 10 retained steps |
| Unsupported step | 1 / 10 retained steps |
| Generation latency | 2.02 µs median, 3.19 µs p95 across 10,000 in-process samples |
| Minified SDK bundle | 4,243 bytes raw, 2,021 bytes gzip |
| Median added recording time | 5.00 µs per click across 20 paired samples |

The denominator for generation includes a deliberate diagnostic report with a duplicate button name and an excluded password field. It produced a review-required draft and was rejected by the replay API. The four replayable tests were recorded through the browser UI, submitted, opened, generated and downloaded. The harness checked that the downloaded files exactly matched the fixture test source before rerunning each across both builds. It also verified version retention, URL and password exclusions, error redaction, request limits, project permissions, buffer bounds and report deletion. Dashboard checks additionally cover upgrading the previous SQLite schema, search and status filtering, edit authorization, stale revisions, and replay evidence invalidation.

| Demo fixture | Buggy assertion | Fixed result |
| --- | --- | --- |
| Depot change | Checkout element was missing when expected to be visible | Checkout was visible |
| Catalog filter | Expected Alpine, received No items found | Alpine was shown |
| Quantity edit | Expected $36.00, received $12.00 | Total became $36.00 |
| Receipt | Expected /receipt, received /receipt-unavailable | Reached /receipt |

Each buggy failure was recorded inside the named expected-outcome step. Playwright used fresh browser contexts and an 850 ms assertion timeout. The SDK overhead microbenchmark alternated the order of baseline and recording runs, discarded two warm-up pairs, and used 80 programmatic clicks on a unique test ID per sample. Baseline and recording batch medians were 0.10 ms and 0.50 ms. The timing excludes rendering a preview, upload, polling across navigation, and replay. Timer granularity, fixture size, DOM shape and shared-host load affect these measurements.

The results cover deterministic synthetic fixtures in one browser. They provide a repeatable reference for changes. A larger cross-browser fixture set and the [user study protocol](USER_STUDY.md) would add coverage for real-world usability and performance.
