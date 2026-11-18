import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { cleanPath, report } from '../packages/report-schema/index.ts';
import { generate } from '../packages/test-generator/index.ts';
import { fixtures } from './fixtures.ts';

test('all fixture reports validate and generate repeatable tests', () => {
  for (const fixture of fixtures) {
    assert.deepEqual(report.parse(fixture), fixture);
    const generated = generate(fixture);
    assert.deepEqual(generate(fixture), generated);
    assert.deepEqual(generated.warnings, []);
    assert.match(generated.code, /Expected outcome/);
    assert.doesNotMatch(generated.code, /waitForTimeout/);
  }
});
test('URLs and error payloads do not retain query, hash, emails or raw log text', () => {
  assert.equal(cleanPath('/orders?token=secret#session'), '/orders');
  assert.equal(cleanPath('/orders/alice%40example.com'), '/orders/[redacted]');
  assert.equal(cleanPath('//example.com'), '/');
  assert.equal(report.safeParse({ ...fixtures[0], startPath: '/orders?token=secret' }).success, false);
  const sanitized = report.parse({ ...fixtures[0], logs: [{ at: 1, path: '/', kind: 'console.error', message: 'secret' }], cookies: 'secret' });
  assert.doesNotMatch(JSON.stringify(sanitized), /secret/);
});
test('a missing assertion, ambiguous locator and unsupported event block replay', () => {
  const result = generate({ ...fixtures[0], assertion: undefined, events: [
    { type: 'click', path: '/', at: 0, locator: null, warning: 'Ambiguous locator' },
    { type: 'unsupported', path: '/', at: 1, warning: 'Unsupported click target' }
  ] });
  assert.equal(result.warnings.length, 3);
  assert.match(result.code, /throw new Error/);
});
test('captured strings stay inside literals in the generated TypeScript AST', () => {
  const hostile = '"); globalThis.injected = true; // \\ \n <script> \u2028 \u2029 ` ${boom}';
  const locator = { kind: 'testId', value: hostile } as const;
  const generated = generate({
    ...fixtures[0], title: hostile,
    assertion: { type: 'text', locator, value: hostile },
    events: [{ type: 'fill', at: 0, path: '/', locator, value: hostile }]
  });
  const source = ts.createSourceFile('recorded.spec.ts', generated.code, ts.ScriptTarget.Latest, true);
  const literals: string[] = [];
  const walk = (node: ts.Node) => {
    assert.equal(ts.isIdentifier(node) && node.text === 'injected', false);
    if (ts.isStringLiteral(node)) literals.push(node.text);
    ts.forEachChild(node, walk);
  };
  walk(source);
  assert.equal(literals.filter(value => value === hostile).length, 5);
  assert.equal(source.statements.length, 2);
  assert.equal(ts.transpileModule(generated.code, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2023 } }).diagnostics?.length, 0);
});

test('edit validation bounds the revision and accepts intentional assertion removal', async () => {
  const { expectationEdit } = await import('../packages/report-schema/index.ts');
  const edit = { revision: 0, expected: '  Checkout remains visible.  ', assertion: null };
  assert.deepEqual(expectationEdit.parse(edit), { ...edit, expected: 'Checkout remains visible.' });
  for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0']) {
    assert.equal(expectationEdit.safeParse({ ...edit, revision }).success, false);
  }
  assert.equal(expectationEdit.safeParse({ ...edit, expected: 'x'.repeat(1501) }).success, false);
  assert.equal(expectationEdit.safeParse({ ...edit, status: 'Fix verified' }).success, false);
});
