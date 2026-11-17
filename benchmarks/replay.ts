import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
type Step = { title: string; error?: { message?: string }; steps?: Step[] };
type Result = { status: string; steps?: Step[]; errors?: { message?: string }[] };
type Output = { suites?: { specs?: { tests: { results: Result[] }[] }[] }[] };
export async function replay(code: string, root: string) {
  const directory = await mkdtemp(resolve('.run-'));
  try {
    await writeFile(resolve(directory, 'bugrelay.spec.ts'), code);
    const base = `testDir: '.', timeout: 10000, expect: { timeout: 850 }, reporter: 'json', workers: 1, use: { headless: true, launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } }`;
    await writeFile(resolve(directory, 'playwright.config.cjs'), `module.exports = { ${base}, projects: ['buggy', 'fixed'].map(name => ({ name, use: { baseURL: ${JSON.stringify(root)} + '/' + name + '/' } })) };`);
    const { stdout } = await execute(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', resolve(directory, 'playwright.config.cjs')], {
      timeout: 45000, env: { ...process.env, FORCE_COLOR: '0' }
    }).catch(error => {
      if (error.code === 1 && error.stdout) return { stdout: String(error.stdout) };
      throw error;
    });
    const output = JSON.parse(stdout) as Output;
    const results = output.suites?.[0]?.specs?.[0]?.tests.map(test => test.results[0]);
    if (!results || results.length !== 2) throw new Error('Playwright did not return both fixture runs.');
    const [buggy, fixed] = results;
    const outcome = buggy.steps?.find(step => step.title === 'Expected outcome');
    const message = outcome?.error?.message ?? outcome?.steps?.find(step => step.error)?.error?.message ?? '';
    const intended = buggy.status === 'failed' && /toBeVisible|toHaveText|toHaveURL/.test(message) && (buggy.errors?.length ?? 0) === 1;
    return { buggy: buggy.status, fixed: fixed.status, intended, assertionFailure: message.replace(/\x1b\[[0-9;]*m/g, '').split('\n').slice(0, 9).join('\n') };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
