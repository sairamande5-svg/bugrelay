import type { Report, Locator } from '../packages/report-schema/index.ts';
const context = { path: '/', at: 0 };
const id = (value: string): Locator => ({ kind: 'testId', value });
const fixture = (title: string, events: Report['events'], assertion: Report['assertion']): Report => ({
  schemaVersion: 1, title, observed: 'The buggy fixture displays the wrong outcome.', expected: 'The fixed fixture displays the expected outcome.',
  startPath: '/', events, assertion, logs: [], truncated: false
});
export const fixtures = [
  fixture('Depot change keeps checkout available', [
    { type: 'select', ...context, locator: id('depot'), value: 'west' },
    { type: 'click', ...context, locator: id('save-depot') }
  ], { type: 'visible', locator: id('checkout') }),
  fixture('Active filter keeps Alpine in the catalog', [
    { type: 'click', ...context, locator: id('catalog') },
    { type: 'navigate', path: '/catalog', at: 0 },
    { type: 'select', path: '/catalog', at: 0, locator: id('filter'), value: 'active' }
  ], { type: 'text', locator: id('catalog-result'), value: 'Alpine' }),
  fixture('Editing quantity updates the total', [
    { type: 'fill', ...context, locator: id('quantity'), value: '3' },
    { type: 'click', ...context, locator: id('save-quantity') }
  ], { type: 'text', locator: id('total'), value: '$36.00' }),
  fixture('Receipt navigation reaches the receipt page', [
    { type: 'click', ...context, locator: id('receipt') }
  ], { type: 'url', path: '/receipt' })
];
