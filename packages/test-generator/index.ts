import type { Interaction, Locator, Report } from '../report-schema/index.ts';

const literal = (value: string) => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const target = (locator: Locator) => {
  switch (locator.kind) {
    case 'testId': return `page.getByTestId(${literal(locator.value)})`;
    case 'label': return `page.getByLabel(${literal(locator.value)}, { exact: true })`;
    case 'role': return `page.getByRole(${literal(locator.role)}, { name: ${literal(locator.name)}, exact: true })`;
  }
};
const url = (path: string) => `await expect(page).toHaveURL(new URL(${literal('./' + path.slice(1))}, baseURL).href);`;
type Action = Extract<Interaction, { locator: Locator | null }>;
type Exporters = { [Type in Action['type']]: (locator: string, event: Extract<Action, { type: Type }>) => string };
export const exporters: Exporters = {
  click: locator => `await ${locator}.click();`,
  fill: (locator, event) => `await ${locator}.fill(${literal(event.value)});`,
  select: (locator, event) => `await ${locator}.selectOption({ value: ${literal(event.value)} });`
};
export function generate(report: Report) {
  const warnings: string[] = [];
  const initial = `await page.goto(${literal('./' + report.startPath.slice(1))});`;
  const steps = [initial];
  if (report.startPath.includes('[redacted]')) warnings.push('The start path contains a redacted segment.');
  if (report.truncated) warnings.push('The interaction buffer was truncated.');
  if (!report.events.length) warnings.push('No interactions were retained.');
  report.events.forEach((event, index) => {
    const warning = event.type === 'navigate' ? undefined : event.warning;
    if (warning) warnings.push(`Step ${index + 1}: ${warning}`);
    if (event.type === 'navigate' && !event.path.includes('[redacted]')) steps.push(url(event.path));
    else if (event.type === 'navigate') warnings.push(`Step ${index + 1}: Navigation path contains a redacted segment.`);
    else if (event.type === 'unsupported' || !event.locator) {
      if (!warning) warnings.push(`Step ${index + 1}: No usable locator.`);
    } else {
      const locator = target(event.locator);
      switch (event.type) {
        case 'click': steps.push(exporters.click(locator, event)); break;
        case 'fill': steps.push(exporters.fill(locator, event)); break;
        case 'select': steps.push(exporters.select(locator, event)); break;
      }
    }
  });
  const assertion = report.assertion;
  if (!assertion) warnings.push('Supply a supported expected result.');
  else if (assertion.type === 'url' && assertion.path.includes('[redacted]')) warnings.push('The expected path contains a redacted segment.');
  const expected = !assertion ? '' : assertion.type === 'url' ? url(assertion.path) :
    assertion.type === 'visible' ? `await expect(${target(assertion.locator)}).toBeVisible();` :
    `await expect(${target(assertion.locator)}).toHaveText(${literal(assertion.value)});`;
  const body = warnings.length
    ? [`throw new Error(${literal(warnings.join('\n'))});`, ...steps, expected]
    : [...steps, 'await test.step("Expected outcome", async () => {', `  ${expected}`, '});'];
  const code = ['import { expect, test } from "@playwright/test";', '', `test(${literal(report.title)}, async ({ page, baseURL }) => {`, ...body.filter(Boolean).map(line => '  ' + line), '});', ''].join('\n');
  return { code, warnings };
}
export const instructions = `# Running a BugRelay test

Save the test in a Playwright project as bugrelay.spec.ts. Set use.baseURL in playwright.config.ts to your application root with a trailing slash. For the bundled demo, use http://localhost:4173/buggy/ or http://localhost:4173/fixed/. Run:

    npx playwright install chromium
    npx playwright test bugrelay.spec.ts

Configure application-specific authentication and deterministic fixture state before replay. Review locator warnings and restore missing or redacted setup locally. A generated test does not establish reproduction by itself.
`;
