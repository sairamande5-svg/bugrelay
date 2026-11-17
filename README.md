# BugRelay

Turn a website bug report into a reproducible Playwright test. A tester records an interaction in a React application and enters the expected outcome. A developer reviews the recording, downloads the generated test, and runs it against a buggy or fixed build.

## Quickstart

With Docker and Docker Compose installed, start from the repository root.

```sh
docker compose up --build
```

Open [the local demo](http://localhost:4173). The dashboard defaults to the demo credential `local-dashboard`. Compose publishes the port on loopback and stores reports in a named volume.

To run directly, use Node.js 24 and npm.

```sh
npm ci
npx playwright install chromium
npm run dev
```

On Linux, Chromium may require system dependencies. Use `npx playwright install --with-deps chromium` where you can install OS packages, or set `CHROMIUM_PATH` to a compatible Chromium executable.

## Try the demo

1. Open the **Buggy build**, then click **Start recording**.
2. Select **West Depot** and click **Save depot**. Checkout becomes unavailable.
3. Stop recording. Open **Checkout availability** under **Try a known bug** and choose **Use example expectation**. Review the captured information and submit.
4. Open the report in the dashboard. Choose **Generate test**, then **Replay approved demo test**. The evidence shows the assertion failure on the buggy build and the pass on the fixed build. Download the test, its README, or the JSON report from the same panel.
5. Use **Reset fixture** to try the Catalog, Quantity total, or Receipt examples. The Receipt example calls out the observed wrong navigation step to remove during review.

The demo is available to anyone who clones this repository. The app runs in local development mode. See [benchmark evidence](docs/BENCHMARKS.md).

## Install the SDK

Build with `npm run build` and copy `dist/sdk.js` into your React app or download the bundle from the dashboard. TypeScript consumers can also vendor the source in `packages/sdk` and the shared `packages/report-schema/privacy.ts` and type declarations. No package registry account is needed.

```ts
import { createBugRelay } from './sdk.js';

const relay = createBugRelay({
  endpoint: location.origin,
  project: 'demo',
  ingestionKey: 'local-ingestion',
  appVersion: '1.2.0',
});

relay.start(); // Start button handler
const reviewed = relay.stop(); // Stop button handler. Render events and logs for review.
// Submit button handler, after the tester has reviewed and removed entries:
if (reviewed) {
  await relay.submit({
    title: 'Save hides the confirmation',
    observed: 'The confirmation is missing after Save.',
    expected: 'The confirmation is visible after Save.',
    assertion: { type: 'visible', locator: { kind: 'testId', value: 'confirmation' } },
  }, reviewed);
}
```

Configure your React dev server to proxy `/api/projects` to `http://127.0.0.1:4173`. Add `data-bugrelay-allow` to specific text inputs and single-select dropdowns approved for recording. Use unique, stable test IDs or accessible names and labels. Mark recorder controls with `data-bugrelay-ignore`. The included React recorder implements controls, preview, removals and an assertion builder.

The API recognizes one configured project per local instance. Set `BUGRELAY_PROJECT`, `BUGRELAY_READ_KEY`, and `BUGRELAY_INGESTION_KEY` to change the defaults. The ingestion key is intentionally browser-visible. The dashboard credential authorizes read, export, verification and deletion and belongs only in developer hands.

## Validation

```sh
npm run check
npm run benchmark
```

See [Architecture and boundaries](docs/ARCHITECTURE.md), [Contributing](CONTRIBUTING.md), [Milestones](docs/PROGRESS.md), and [Dependency notices](THIRD_PARTY_NOTICES.md). MIT licensed.
