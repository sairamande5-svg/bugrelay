import { cleanPath, MAX_EVENTS, MAX_LOGS } from '../report-schema/privacy.ts';
import type { Interaction, Locator, Recording, Report } from '../report-schema/index.ts';

const sensitive = /pass(?:word|code)?|secret|token|credit.?card|card.?number|security.?code|cvv|otp|ssn|social.?security|auth|e.?mail|phone|address|postal|zip/i;
const normalized = (text: string) => text.trim().replace(/\s+/g, ' ');
function name(element: HTMLElement) {
  const references = element.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ');
  return normalized(references || element.getAttribute('aria-label') || element.textContent || '');
}
const clickSelector = 'button,a[href],[role="button"],[role="link"]';
const role = (element: HTMLElement) => element.getAttribute('role') || (element.matches('a[href]') ? 'link' : 'button');
const label = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) =>
  normalized(Array.from(element.labels ?? [], node => node.textContent ?? '').join(' '));
const safeName = (text: string) => text.length > 0 && text.length <= 160 && !/@|\b\d{7,}\b/.test(text);
type Match = { locator: Locator; matches: number };
export const locatorStrategies: ((element: HTMLElement) => Match | undefined)[] = [
  element => {
    const value = element.getAttribute('data-testid');
    if (!value || !safeName(value)) return;
    return { locator: { kind: 'testId', value }, matches: document.querySelectorAll(`[data-testid="${CSS.escape(value)}"]`).length };
  },
  element => {
    if (!isField(element)) return;
    const value = label(element);
    if (!safeName(value)) return;
    return { locator: { kind: 'label', value }, matches: Array.from(document.querySelectorAll('input, textarea, select')).filter(node => isField(node) && label(node) === value).length };
  },
  element => {
    if (!element.matches(clickSelector)) return;
    const kind = role(element);
    const value = name(element);
    if ((kind !== 'button' && kind !== 'link') || !safeName(value)) return;
    return { locator: { kind: 'role', role: kind, name: value }, matches: Array.from(document.querySelectorAll<HTMLElement>(clickSelector)).filter(node => role(node) === kind && name(node) === value).length };
  }
];
function locate(element: HTMLElement) {
  let ambiguous = false;
  for (const strategy of locatorStrategies) {
    const candidate = strategy(element);
    if (candidate?.matches === 1) return { locator: candidate.locator };
    ambiguous ||= Boolean(candidate && candidate.matches > 1);
  }
  return { locator: null, warning: ambiguous ? 'Ambiguous locator' : 'Missing stable locator' };
}
function isField(node: object): node is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement;
}
function canRecordValue(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  if (!field.hasAttribute('data-bugrelay-allow')) return false;
  if (field instanceof HTMLInputElement && !['text', 'search'].includes(field.type)) return false;
  return !sensitive.test([field.name, field.id, field.autocomplete, field.getAttribute('aria-label'), label(field)].join(' ')) &&
    !field.autocomplete.split(/\s+/).some(token => token.startsWith('cc-'));
}
type Capture = (element: HTMLElement, context: { at: number; path: string }) => Interaction | undefined;
export const interactionHandlers: Record<'click' | 'change', Capture> = {
  click(element, context) {
    const clickable = element.closest<HTMLElement>(clickSelector);
    if (clickable) return { type: 'click', ...context, ...locate(clickable) };
    if (element.closest('[role="switch"],[contenteditable="true"],[role="checkbox"],[role="menuitem"]')) {
      return { type: 'unsupported', ...context, warning: 'Unsupported click target' };
    }
  },
  change(element, context) {
    if (!isField(element)) return;
    if (!canRecordValue(element)) return { type: 'unsupported', ...context, warning: 'Field excluded or unsupported' };
    if (element.value.length > 500 || (element instanceof HTMLSelectElement && element.multiple)) {
      return { type: 'unsupported', ...context, warning: 'Field value exceeds the supported recording scope' };
    }
    return { type: element instanceof HTMLSelectElement ? 'select' : 'fill', ...context, ...locate(element), value: element.value };
  }
};

type Options = { endpoint: string; project: string; ingestionKey: string; appVersion?: string; path?: () => string };
type Details = Pick<Report, 'title' | 'observed' | 'expected' | 'assertion'>;
export function createBugRelay(options: Options) {
  let recording: Recording | undefined;
  let stopRecording: (() => void) | undefined;
  const path = () => cleanPath(options.path?.() ?? location.pathname);
  const preview = () => recording ? structuredClone(recording) : undefined;
  return {
    start() {
      if (stopRecording) return;
      const controller = new AbortController();
      const active: Recording = { startPath: path(), events: [], logs: [], truncated: false };
      recording = active;
      let lastPath = active.startPath;
      const context = () => ({ at: Date.now(), path: path() });
      const append = (event: Interaction) => {
        if (active.events.length < MAX_EVENTS) active.events.push(event);
        else active.truncated = true;
      };
      const observeNavigation = () => {
        const current = context();
        if (current.path !== lastPath) {
          lastPath = current.path;
          append({ type: 'navigate', ...current });
        }
      };
      for (const type of ['click', 'change'] as const) {
        document.addEventListener(type, event => {
          const element = event.target;
          if (!(element instanceof HTMLElement) || element.closest('[data-bugrelay-ignore]')) return;
          observeNavigation();
          const captured = interactionHandlers[type](element, context());
          if (captured) append(captured);
        }, { capture: true, signal: controller.signal });
      }
      const log = (kind: Recording['logs'][number]['kind']) => {
        if (active.logs.length < MAX_LOGS) active.logs.push({ kind, ...context() });
      };
      window.addEventListener('error', () => log('window.error'), { signal: controller.signal });
      window.addEventListener('unhandledrejection', () => log('unhandledrejection'), { signal: controller.signal });
      const previous = console.error;
      const wrapped: typeof console.error = (...args) => {
        try { log('console.error'); } finally { Reflect.apply(previous, console, args); }
      };
      console.error = wrapped;
      const interval = window.setInterval(observeNavigation, 100);
      stopRecording = () => {
        observeNavigation();
        controller.abort();
        window.clearInterval(interval);
        if (console.error === wrapped) console.error = previous;
        stopRecording = undefined;
      };
    },
    stop() { stopRecording?.(); return preview(); },
    preview,
    async submit(details: Details, reviewed: Recording) {
      if (!recording || stopRecording) throw new Error('Stop and review the recording before submitting.');
      const response = await fetch(`${options.endpoint.replace(/\/$/, '')}/api/projects/${encodeURIComponent(options.project)}/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bugrelay-ingestion': options.ingestionKey },
        body: JSON.stringify({ ...reviewed, ...details, schemaVersion: 1, appVersion: options.appVersion })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Report submission failed.');
      }
      return await response.json() as { id: string };
    }
  };
}
