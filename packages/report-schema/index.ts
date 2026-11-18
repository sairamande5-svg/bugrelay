import { z } from 'zod';

import { cleanPath, MAX_EVENTS, MAX_LOGS } from './privacy.ts';
export { cleanPath, MAX_EVENTS, MAX_LOGS, MAX_PAYLOAD } from './privacy.ts';

const short = z.string().trim().min(1).max(160);
const timestamp = z.number().int().nonnegative().max(8640000000000000);
const path = z.string().max(300).refine(value => cleanPath(value) === value);
export const locator = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('testId'), value: short }),
  z.object({ kind: z.literal('label'), value: short }),
  z.object({ kind: z.literal('role'), role: z.enum(['button', 'link', 'textbox', 'combobox', 'heading', 'status', 'alert']), name: short })
]);
const context = { at: timestamp, path };
const target = { locator: locator.nullable(), warning: short.optional() };
export const interaction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), ...context, ...target }),
  z.object({ type: z.literal('fill'), ...context, ...target, value: z.string().max(500) }),
  z.object({ type: z.literal('select'), ...context, ...target, value: z.string().max(500) }),
  z.object({ type: z.literal('navigate'), ...context }),
  z.object({ type: z.literal('unsupported'), ...context, warning: short })
]);
export const assertion = z.discriminatedUnion('type', [
  z.object({ type: z.literal('visible'), locator }),
  z.object({ type: z.literal('text'), locator, value: z.string().min(1).max(500) }),
  z.object({ type: z.literal('url'), path })
]);
export const report = z.object({
  schemaVersion: z.literal(1), appVersion: short.optional(), startPath: path,
  title: short, observed: z.string().trim().min(1).max(1500), expected: z.string().trim().min(1).max(1500),
  assertion: assertion.optional(), events: z.array(interaction).max(MAX_EVENTS),
  logs: z.array(z.object({ ...context, kind: z.enum(['console.error', 'window.error', 'unhandledrejection']) })).max(MAX_LOGS),
  truncated: z.boolean()
});
export const expectationEdit = z.strictObject({
  revision: z.number().int().nonnegative(),
  expected: report.shape.expected,
  assertion: assertion.nullable()
});
export type Report = z.infer<typeof report>;
export type Locator = z.infer<typeof locator>;
export type Interaction = z.infer<typeof interaction>;
export type Assertion = z.infer<typeof assertion>;
export type Recording = Pick<Report, 'startPath' | 'events' | 'logs' | 'truncated'>;
