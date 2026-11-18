import type { Report, Locator } from '../packages/report-schema/index.ts';
const context = { path: '/', at: 0 };
const id = (value: string): Locator => ({ kind: 'testId', value });
const fixture = (
  narrative: Pick<Report, 'title' | 'observed' | 'expected'>,
  events: Report['events'], assertion: Report['assertion']
): Report => ({
  schemaVersion: 1, ...narrative,
  startPath: '/', events, assertion, logs: [], truncated: false
});
export const fixtures = [
  fixture({
    title: 'Depot change keeps checkout available',
    observed: 'Checkout disappears after saving West Depot.',
    expected: 'Checkout remains available after the depot changes.'
  }, [
    { type: 'select', ...context, locator: id('depot'), value: 'west' },
    { type: 'click', ...context, locator: id('save-depot') }
  ], { type: 'visible', locator: id('checkout') }),
  fixture({
    title: 'Active filter keeps Alpine in the catalog',
    observed: 'Selecting Active shows “No items found.”',
    expected: 'Alpine is listed when the Active filter is selected.'
  }, [
    { type: 'click', ...context, locator: id('catalog') },
    { type: 'navigate', path: '/catalog', at: 0 },
    { type: 'select', path: '/catalog', at: 0, locator: id('filter'), value: 'active' }
  ], { type: 'text', locator: id('catalog-result'), value: 'Alpine' }),
  fixture({
    title: 'Editing quantity updates the total',
    observed: 'After updating the quantity to 3, the total still shows $12.00.',
    expected: 'The order total updates to $36.00.'
  }, [
    { type: 'fill', ...context, locator: id('quantity'), value: '3' },
    { type: 'click', ...context, locator: id('save-quantity') }
  ], { type: 'text', locator: id('total'), value: '$36.00' }),
  fixture({
    title: 'Receipt navigation reaches the receipt page',
    observed: 'The Receipt link opens the unavailable page.',
    expected: 'The Receipt link opens the order receipt.'
  }, [
    { type: 'click', ...context, locator: id('receipt') }
  ], { type: 'url', path: '/receipt' })
];
