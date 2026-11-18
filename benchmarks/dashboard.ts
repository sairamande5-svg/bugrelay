import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Report } from '../packages/report-schema/index.ts';

export async function checkDashboard(page: Page, endpoint: string, id: string) {
  const address = endpoint + '/' + id;
  const headers = { authorization: 'Bearer local-dashboard', 'content-type': 'application/json' };
  const read = async () => {
    const response = await fetch(address, { headers });
    assert.equal(response.status, 200);
    return await response.json() as { revision: number; report: Report; status: string; evidence: unknown };
  };
  const edit = (body: object, authorization = headers.authorization) => fetch(address + '/expectation', {
    method: 'PATCH', headers: { ...headers, authorization }, body: JSON.stringify(body)
  });
  const original = await read();
  assert.equal(original.status, 'Fix verified');

  const search = page.getByRole('searchbox', { name: 'Search reports' });
  const status = page.getByRole('combobox', { name: 'Status' });
  const rows = page.locator('.report-row');
  await search.fill(original.report.title.toUpperCase());
  await expect(rows).toHaveCount(1);
  await status.selectOption('Captured');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('No reports match these filters.')).toBeVisible();
  await status.selectOption('Fix verified');
  await expect(rows).toHaveCount(1);
  await search.clear();
  await status.selectOption('');

  const firstChange = { revision: original.revision, expected: 'Checkout stays visible after saving West Depot.', assertion: original.report.assertion };
  assert.equal((await edit(firstChange, 'Bearer local-ingestion')).status, 403);
  assert.equal((await edit({ ...firstChange, events: [] })).status, 400);
  assert.equal((await edit({ ...firstChange, assertion: { type: 'url', path: '/?token=secret' } })).status, 400);
  assert.equal((await edit({ ...firstChange, expected: '  ' })).status, 400);
  assert.equal((await edit(firstChange)).status, 200);
  assert.equal((await edit(firstChange)).status, 409);
  const wordingOnly = await read();
  assert.equal(wordingOnly.revision, original.revision + 1);
  assert.equal(wordingOnly.status, 'Fix verified');
  assert.deepEqual(wordingOnly.evidence, original.evidence);
  assert.equal((await edit({ ...firstChange, revision: wordingOnly.revision })).status, 200);
  assert.equal((await read()).revision, wordingOnly.revision);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Replay evidence' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit expected outcome' }).click();
  await page.getByRole('combobox', { name: 'Expectation' }).selectOption('');
  await page.getByRole('button', { name: 'Save expected outcome' }).click();
  await expect(page.getByText('Expected outcome saved.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Replay evidence' })).toHaveCount(0);
  const edited = await read();
  assert.equal(edited.status, 'Captured');
  assert.equal(edited.evidence, null);
  assert.deepEqual(edited.report.events, original.report.events);
  assert.deepEqual(edited.report.logs, original.report.logs);
  assert.equal(edited.report.assertion, undefined);
  await page.getByRole('button', { name: 'Generate test' }).click();
  await expect(page.locator('.report-detail .badge')).toHaveText('Needs review');
  await expect(page.getByText('Supply a supported expected result.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit expected outcome' }).click();
  await page.getByRole('combobox', { name: 'Expectation' }).selectOption('visible');
  await page.getByRole('textbox', { name: 'Locator value' }).fill('checkout');
  await page.getByRole('button', { name: 'Save expected outcome' }).click();
  await expect(page.getByRole('button', { name: 'Edit expected outcome' })).toBeVisible();
  await page.getByRole('button', { name: 'Generate test' }).click();
  await expect(page.locator('.report-detail .badge')).toHaveText('Test generated');
  const restored = await read();
  assert.deepEqual(restored.report.assertion, original.report.assertion);
  assert.equal(restored.evidence, null);
}
