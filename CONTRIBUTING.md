# Contributing

Start with the [quickstart](README.md), then run `npm run check` and `npm run benchmark`. Open a pull request with the behavior change, supported scope and the validation you ran. Use only synthetic data in examples and reports.

## Extension points

- SDK handlers in `packages/sdk/index.ts` receive a target element and timestamp/path context and return a schema interaction or no event. The SDK dispatches through the handler table during recording.
- Locator strategies take an element and return an optional locator with a match count. Add candidates in priority order. Prefer proven unique targets and return no match for elements the strategy cannot name safely.
- The generator's typed exporter map accepts each action variant plus a rendered locator. Keep generated strings in the shared literal encoder. Add an explicit dispatch branch for each schema variant, and keep paths deterministic.
- Schema v1 is declared in `packages/report-schema/index.ts`. For an incompatible format change, add a schema version and migration or keep a compatible reader for existing data.

## Example interaction handler change

To support permitted range inputs, add a `range` event to the schema with a bounded numeric value. In the SDK change handler, recognize `input[type=range]` and apply a recording permission check before reading the value. Reuse `locate` and the current timestamp and path. Add a typed exporter that converts the numeric value to a string for Playwright's range-input fill. Keep the existing exclusion behavior for unpermitted inputs. This change is scoped to range inputs and requires all of the following checks:

1. In `benchmarks/unit.test.ts`, parse a synthetic range event and assert that generation yields the expected locator and escaped fill argument. Include an out-of-range or malformed value fixture.
2. In the browser diagnostics in `benchmarks/run.ts`, add permitted and unpermitted synthetic range fields. Assert that only the permitted target produces a numeric range event.
3. Add an approved buggy/fixed fixture where changing the range value reveals an observable difference. Confirm Playwright reaches the final assertion in both variants.

The existing select handler and its checkout/catalog checks provide a working example of this extension path.

## Starter tasks

- Add a keyboard-only pass for recorder preview and dashboard actions.
- Add fixture coverage for duplicate test IDs with a unique accessible fallback.
- Add a configurable strict route-redaction mapping with a synthetic path fixture.
- Export a typed SDK package with declaration files and registry release automation.
