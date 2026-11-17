import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium, expect } from '@playwright/test';
import { generate } from '../packages/test-generator/index.ts';
import { fixtures } from './fixtures.ts';
import type { Report } from '../packages/report-schema/index.ts';

const port = Number(process.env.BENCHMARK_PORT ?? 4174);
const base = `http://127.0.0.1:${port}`;
const repeats = Number(process.env.BENCHMARK_REPEATS ?? 3);
assert.ok(Number.isInteger(repeats) && repeats > 0);
const data = await mkdtemp(join(tmpdir(), 'bugrelay-bench-'));
const server = spawn(process.execPath, ['apps/api/server.ts'], {
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, BUGRELAY_MODE: 'local', HOST: '127.0.0.1', PORT: String(port), BUGRELAY_DATA: data,
    BUGRELAY_PROJECT: 'demo', BUGRELAY_READ_KEY: 'local-dashboard', BUGRELAY_INGESTION_KEY: 'local-ingestion' }
});
const headers = { authorization: 'Bearer local-dashboard' };
const endpoint = base + '/api/projects/demo/reports';
type Evidence = { buggy: string; fixed: string; intended: boolean; assertionFailure: string };
const seen: { title: string; evidence: Evidence[] }[] = [];
let browser;
try {
  await new Promise<void>((resolve, reject) => {
    server.stdout.on('data', chunk => { if (String(chunk).includes('BugRelay local development')) resolve(); });
    server.once('exit', code => reject(new Error(`Benchmark server exited with ${code}`)));
    server.once('error', reject);
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const page = await browser.newPage({ acceptDownloads: true });
  let totalSteps = 0;
  let ambiguous = 0;
  let unsupported = 0;
  for (const [index, fixture] of fixtures.entries()) {
    await page.goto(base + '/buggy/?token=discarded#private');
    await page.getByRole('button', { name: 'Start recording' }).click();
    if (index === 0) {
      await page.getByTestId('depot').selectOption('west');
      await page.getByTestId('save-depot').click();
    } else if (index === 1) {
      await page.getByTestId('catalog').click();
      await page.getByTestId('filter').selectOption('active');
    } else if (index === 2) {
      await page.getByTestId('quantity').fill('3');
      await page.getByTestId('save-quantity').click();
    } else {
      await page.getByTestId('receipt').click();
    }
    await page.getByRole('button', { name: 'Stop recording' }).click();
    if (index === 3) await page.getByRole('button', { name: 'Remove interaction 2' }).click();
    await page.locator('.examples details').nth(index).locator('summary').click();
    await page.getByRole('button', { name: 'Use example expectation' }).click();
    const submission = page.waitForResponse(response => response.url() === endpoint && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Submit report' }).click();
    const created = await submission;
    assert.equal(created.status(), 201);
    const { id } = await created.json();
    await page.getByRole('link', { name: 'Open report in dashboard' }).click();
    await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();
    assert.equal((await fetch(endpoint + '/' + id, { headers: { authorization: 'Bearer local-ingestion' } })).status, 403);
    assert.equal((await fetch(endpoint.replace('/demo/', '/other/') + '/' + id, { headers })).status, 403);

    const saved: { report: Report; status: string } = await (await fetch(endpoint + '/' + id, { headers })).json();
    assert.equal(saved.status, 'Captured');
    assert.equal(saved.report.startPath, '/');
    assert.equal(saved.report.appVersion, 'demo-1');
    assert.doesNotMatch(JSON.stringify(saved.report), /discarded|private/);
    totalSteps += saved.report.events.length;
    ambiguous += saved.report.events.filter(event => 'warning' in event && event.warning === 'Ambiguous locator').length;
    unsupported += saved.report.events.filter(event => event.type === 'unsupported').length;

    await page.getByRole('button', { name: 'Generate test' }).click();
    await expect(page.getByRole('heading', { name: 'Generated Playwright test' })).toBeVisible();
    await expect(page.locator('.report-detail .badge')).toHaveText('Test generated');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download test' }).click();
    const downloadedPath = await (await download).path();
    assert.equal(await readFile(downloadedPath, 'utf8'), generate(fixture).code);
    const evidence: Evidence[] = [];
    for (let run = 0; run < repeats; run++) {
      const responsePromise = page.waitForResponse(response => response.url().endsWith('/' + id + '/verify'), { timeout: 50000 });
      await page.getByRole('button', { name: 'Replay approved demo test' }).click();
      const response = await responsePromise;
      const result = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(result));
      await expect(page.getByRole('heading', { name: 'Replay evidence' })).toBeVisible();
      await expect(page.locator('.report-detail .badge')).toHaveText('Fix verified');
      evidence.push(result);
      assert.ok(result.intended && result.buggy === 'failed' && result.fixed === 'passed', JSON.stringify(result));
    }
    seen.push({ title: fixture.title, evidence });
  }

  await page.goto(base);
  const diagnostics = await page.evaluate(async () => {
    const sdkModule = '/sdk.js';
    const { createBugRelay } = await import(sdkModule);
    const relay = createBugRelay({ endpoint: location.origin, project: 'demo', ingestionKey: 'local-ingestion' });
    const host = document.createElement('div');
    host.innerHTML = '<button>Duplicate fixture</button><button>Duplicate fixture</button><input type="password" data-bugrelay-allow><button data-testid="perf">Measure</button>';
    document.body.append(host);
    const [duplicate, , password, perf] = [...host.children] as [HTMLButtonElement, HTMLButtonElement, HTMLInputElement, HTMLButtonElement];
    relay.start();
    duplicate.click();
    password.value = 'never-capture-this';
    password.dispatchEvent(new Event('change', { bubbles: true }));
    console.error('never-capture-this');
    const review = relay.stop() as Report;
    const times: { baseline: number; recording: number }[] = [];
    const measure = () => {
      const start = performance.now();
      for (let click = 0; click < 80; click++) perf.click();
      return performance.now() - start;
    };
    for (let sample = 0; sample < 22; sample++) {
      let baseline: number;
      let recording: number;
      if (sample % 2) {
        relay.start(); recording = measure(); relay.stop(); baseline = measure();
      } else {
        baseline = measure(); relay.start(); recording = measure(); relay.stop();
      }
      if (sample >= 2) times.push({ baseline, recording });
    }
    relay.start();
    for (let click = 0; click < 90; click++) perf.click();
    const overflow = relay.stop();
    host.remove();
    return { review, times, overflow: { count: overflow.events.length, truncated: overflow.truncated } };
  });
  assert.doesNotMatch(JSON.stringify(diagnostics.review), /never-capture-this/);
  assert.equal(diagnostics.review.logs[0].kind, 'console.error');
  assert.deepEqual(diagnostics.overflow, { count: 80, truncated: true });
  totalSteps += diagnostics.review.events.length;
  ambiguous += diagnostics.review.events.filter(event => 'warning' in event && event.warning === 'Ambiguous locator').length;
  unsupported += diagnostics.review.events.filter(event => event.type === 'unsupported').length;
  assert.equal(ambiguous, 1);
  assert.equal(unsupported, 1);
  const reviewReport = { ...fixtures[0], ...diagnostics.review };
  const ingest = { 'content-type': 'application/json', 'x-bugrelay-ingestion': 'local-ingestion' };
  const rejected = await fetch(endpoint, { method: 'POST', headers: ingest, body: '{"padding":"' + 'x'.repeat(270000) + '"}' });
  assert.equal(rejected.status, 413);
  const reviewCreated = await fetch(endpoint, { method: 'POST', headers: ingest, body: JSON.stringify(reviewReport) });
  assert.equal(reviewCreated.status, 201);
  const reviewId = (await reviewCreated.json()).id;
  const reviewEndpoint = endpoint + '/' + reviewId;
  const draft = await fetch(reviewEndpoint + '/generate', { method: 'POST', headers });
  assert.equal((await draft.json()).warnings.length, 2);
  assert.equal((await (await fetch(reviewEndpoint, { headers })).json()).status, 'Needs review');
  assert.equal((await fetch(reviewEndpoint + '/verify', { method: 'POST', headers })).status, 422);
  assert.equal((await fetch(reviewEndpoint, { method: 'DELETE', headers })).status, 204);
  assert.equal((await fetch(reviewEndpoint, { headers })).status, 404);

  const bundle = await readFile('dist/sdk.js');
  const samples = Array.from({ length: 10000 }, (_, index) => {
    const start = performance.now();
    generate(fixtures[index % fixtures.length]);
    return performance.now() - start;
  }).sort((a, b) => a - b);
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const results = {
    environment: { node: process.version, chromium: browser.version(), os: platform() + ' ' + release(), arch: arch(), cpu: cpus()[0].model },
    generated: { successful: seen.length, total: fixtures.length + 1, needsReview: 1 },
    buggy: { intendedFailures: seen.flatMap(row => row.evidence).filter(result => result.intended).length, total: fixtures.length * repeats },
    fixed: { passes: seen.flatMap(row => row.evidence).filter(result => result.fixed === 'passed').length, total: fixtures.length * repeats },
    flakyFixtures: { count: seen.filter(row => new Set(row.evidence.map(result => [result.buggy, result.fixed, result.intended].join(':'))).size > 1).length, total: fixtures.length, repeats },
    diagnosticSteps: { ambiguous, unsupported, total: totalSteps },
    generationMilliseconds: { median: samples[5000], p95: samples[9500], samples: samples.length },
    sdk: { bytes: bundle.length, gzipBytes: gzipSync(bundle).length, clicksPerSample: 80, postWarmupSamples: diagnostics.times.length,
      baselineMedianMs: median(diagnostics.times.map(entry => entry.baseline)), recordingMedianMs: median(diagnostics.times.map(entry => entry.recording)),
      addedMedianMicrosecondsPerClick: median(diagnostics.times.map(entry => (entry.recording - entry.baseline) * 1000 / 80)) },
    fixtures: seen.map(row => ({ title: row.title, firstRun: row.evidence[0] }))
  };
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const stopped = new Promise<void>(resolve => server.once('exit', () => resolve()));
    server.kill();
    await stopped;
  }
  await rm(data, { recursive: true, force: true });
}
