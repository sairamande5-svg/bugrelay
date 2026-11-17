import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBugRelay } from '../../packages/sdk/index.ts';
import { assertion as assertionSchema } from '../../packages/report-schema/index.ts';
import type { Assertion, Locator, Recording, Report } from '../../packages/report-schema/index.ts';
import { fixtures } from '../../benchmarks/fixtures.ts';
import './styles.css';

type Config = { project: string; ingestionKey: string; appVersion: string };
type Summary = { id: string; title: string; status: string; appVersion?: string; created: number };
type Evidence = { buggy: string; fixed: string; intended: boolean; assertionFailure: string; at: number };
type Detail = { id: string; created: number; status: string; report: Report; evidence: Evidence | null };
const variant = location.pathname.split('/')[1] === 'fixed' ? 'fixed' : 'buggy';
const relativePath = () => location.pathname.replace(/^\/(buggy|fixed)(?=\/|$)/, '') || '/';
const examples = [
  { name: 'Checkout availability', steps: 'Select West Depot, then click Save depot.' },
  { name: 'Catalog filter', steps: 'Open Catalog, then select Active.' },
  { name: 'Quantity total', steps: 'Replace quantity with 3, then click Update total.' },
  { name: 'Receipt navigation', steps: 'Click Receipt from the order page. After stopping, remove the navigation observation so the URL assertion checks the intended path.' }
];
function format(date: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function eventLabel(event: Report['events'][number]) {
  if (event.type === 'navigate') return `Navigate to ${event.path}`;
  if (event.type === 'unsupported') return event.warning;
  const locator = event.locator;
  const identifier = !locator ? 'Unresolved target' : locator.kind === 'role' ? locator.name : locator.value;
  return `${event.type} · ${identifier}${'value' in event ? ` · ${event.value}` : ''}`;
}
function Header({ dashboard }: { dashboard: boolean }) {
  return <header className="top"><div className="top-inner">
    <a className="brand" href="/"><span className="brand-mark" aria-hidden="true">↯</span>BugRelay</a>
    <nav aria-label="Main navigation"><a className={!dashboard ? 'current' : ''} href="/">Demo workspace</a>
      <a className={dashboard ? 'current' : ''} href="/dashboard">Developer dashboard</a></nav>
    <span className="environment"><span />Local development</span>
  </div></header>;
}
function Demo({ config }: { config: Config }) {
  const [sdk] = useState(() => createBugRelay({ ...config, endpoint: location.origin, path: relativePath }));
  const [page, setPage] = useState(relativePath);
  const [depot, setDepot] = useState('east');
  const [checkout, setCheckout] = useState(true);
  const [filter, setFilter] = useState('all');
  const [quantity, setQuantity] = useState('1');
  const [total, setTotal] = useState(12);
  const [active, setActive] = useState(false);
  const [recording, setRecording] = useState<Recording>();
  const [result, setResult] = useState<string>();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [details, setDetails] = useState({ title: '', observed: '', expected: '' });
  const [expectation, setExpectation] = useState({ type: '', kind: 'testId', target: '', role: 'button', value: '' });
  useEffect(() => {
    const update = () => setPage(relativePath());
    window.addEventListener('popstate', update);
    return () => { window.removeEventListener('popstate', update); sdk.stop(); };
  }, [sdk]);
  function navigate(event: React.MouseEvent<HTMLElement>, path: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState(null, '', `/${variant}${path}`);
    setPage(path);
  }
  function example(index: number) {
    const preset = fixtures[index];
    setDetails({ title: preset.title, expected: preset.expected, observed: preset.observed });
    const assertion = preset.assertion;
    if (assertion?.type === 'url') setExpectation({ type: 'url', kind: 'testId', target: '', role: 'button', value: assertion.path });
    else if (assertion && assertion.locator.kind === 'testId') {
      setExpectation({ type: assertion.type, kind: 'testId', target: assertion.locator.value, role: 'button', value: 'value' in assertion ? assertion.value : '' });
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!recording) return;
    setError('');
    const { type, kind, role, target, value } = expectation;
    let assertion: Assertion | undefined;
    if (type) {
      const locator = kind === 'role' ? { kind, role, name: target } : { kind, value: target };
      const parsed = assertionSchema.safeParse(type === 'url' ? { type, path: value } : { type, locator, value });
      if (!parsed.success) { setError('Enter a valid expected result and locator. URL paths must begin with /.'); return; }
      assertion = parsed.data;
    }
    setSubmitting(true);
    try {
      const response = await sdk.submit({ ...details, assertion }, recording);
      setResult(response.id);
    } catch (error) { setError((error as Error).message); }
    finally { setSubmitting(false); }
  }
  return <main className="shell">
    <div className="breadcrumb">BugRelay <span>/</span> Demo workspace</div>
    <div className="page-heading"><div><h1>Demo workspace</h1><p>Record a bug in the sample storefront and turn it into a Playwright test.</p></div>
      <div className="switch"><a className={variant === 'buggy' ? 'selected' : ''} href="/buggy/">Buggy build</a>
        <a className={variant === 'fixed' ? 'selected' : ''} href="/fixed/">Fixed build</a></div></div>
    <div className="workspace">
      <section className="panel storefront" aria-label="Synthetic storefront">
        <div className="panel-top"><span className="store-icon" aria-hidden="true">◇</span><div><h2>Field Supply</h2><small>Synthetic storefront</small></div>
          <a className="quiet reset" data-bugrelay-ignore href={`/${variant}/`}>Reset fixture</a></div>
        <nav className="store-nav" aria-label="Storefront">
          <a className={page === '/' ? 'current' : ''} href={`/${variant}/`} onClick={event => navigate(event, '/')} data-testid="order">Order</a>
          <a className={page === '/catalog' ? 'current' : ''} href={`/${variant}/catalog`} onClick={event => navigate(event, '/catalog')} data-testid="catalog">Catalog</a>
          <a className={page === '/receipt' ? 'current' : ''} href={`/${variant}/receipt`} onClick={event => navigate(event, variant === 'buggy' ? '/receipt-unavailable' : '/receipt')} data-testid="receipt">Receipt</a>
        </nav>
        <div className="store-body">
          {page === '/' ? <>
            <h3>Order details</h3>
            <div className="block"><div><h4>Pickup depot</h4><p>Choose where to collect your order.</p></div>
              <div className="field-row"><label>Depot<select data-testid="depot" data-bugrelay-allow value={depot} onChange={event => setDepot(event.target.value)}>
                <option value="east">East Depot</option><option value="west">West Depot</option>
              </select></label><button data-testid="save-depot" onClick={() => setCheckout(variant === 'fixed' || depot === 'east')}>Save depot</button></div>
            </div>
            <div className="block"><div><h4>Alpine field kit</h4><p>$12.00 per kit</p></div>
              <div className="field-row"><label>Quantity<input type="text" inputMode="numeric" data-bugrelay-allow data-testid="quantity" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
                <button data-testid="save-quantity" onClick={() => { if (variant === 'fixed' && /^\d{1,3}$/.test(quantity)) setTotal(12 * Number(quantity)); }}>Update total</button></div>
            </div>
            <div className="total"><span>Order total <strong data-testid="total">${total.toFixed(2)}</strong></span>
              {checkout ? <button className="primary" data-testid="checkout" onClick={event => navigate(event, '/receipt')}>Checkout</button> : <span role="status">Checkout unavailable</span>}
            </div>
          </> : page === '/catalog' ? <><h3>Catalog</h3><label>Availability<select data-testid="filter" data-bugrelay-allow value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="all">All items</option><option value="active">Active</option></select></label>
            <p className="catalog-result" data-testid="catalog-result">{filter === 'active' && variant === 'buggy' ? 'No items found' : 'Alpine'}</p>
          </> : <><h3>{page === '/receipt' ? 'Receipt' : 'Receipt unavailable'}</h3><p>{page === '/receipt' ? 'Order FS-1042 · Alpine field kit' : 'The storefront could not display the order receipt.'}</p></>}
        </div>
      </section>
      <aside className="panel recorder" data-bugrelay-ignore>
        <div className="panel-top"><span className="recorder-icon" aria-hidden="true">◉</span><div><h2>Bug recorder</h2><small>{active ? 'Recording interactions…' : recording ? 'Review before submitting' : 'Ready to record'}</small></div></div>
        <div className="recorder-body">
          {!recording && !active && <p>Start recording, trigger a bug in the storefront, then stop to review your report.</p>}
          <button type="button" className={active ? 'stop' : 'primary'} onClick={() => {
            if (active) { setRecording(sdk.stop()); setActive(false); }
            else { setError(''); setResult(undefined); setRecording(undefined); sdk.start(); setActive(true); }
          }}>{active ? '■ Stop recording' : recording ? 'Start new recording' : '● Start recording'}</button>
          {result && <p role="status">Report submitted. <a href={`/dashboard?id=${encodeURIComponent(result)}`}>Open report in dashboard →</a></p>}
          {recording && !result && <form onSubmit={submit}>
            <fieldset><legend>Captured information</legend>
              {recording.truncated && <p>The interaction limit was reached.</p>}
              {recording.events.map((entry, index) => <div className="capture" key={index}>
                <span>{eventLabel(entry)} {'warning' in entry && entry.warning && <small>{entry.warning}</small>}</span>
                <button type="button" aria-label={`Remove interaction ${index + 1}`} onClick={() => setRecording({ ...recording, events: recording.events.filter((_, i) => i !== index) })}>Remove</button>
              </div>)}
              {recording.logs.map((entry, index) => <div className="capture" key={index}>
                <span>{entry.kind} · {entry.path}</span><button type="button" aria-label={`Remove error ${index + 1}`}
                  onClick={() => setRecording({ ...recording, logs: recording.logs.filter((_, i) => i !== index) })}>Remove</button>
              </div>)}
              {!recording.logs.length && !recording.events.length && <p>No interactions or errors retained.</p>}
            </fieldset>
            {(['title', 'observed', 'expected'] as const).map((key, index) => <label key={key}>{['Title', 'Observed behavior', 'Expected behavior'][index]}
              {key === 'title' ? <input required maxLength={160} value={details[key]} onChange={event => setDetails({ ...details, [key]: event.target.value })} /> :
                <textarea required maxLength={1500} value={details[key]} onChange={event => setDetails({ ...details, [key]: event.target.value })} />}
            </label>)}
            <fieldset><legend>Playwright assertion</legend>
              <label>Expectation<select value={expectation.type} onChange={event => setExpectation({ ...expectation, type: event.target.value })}>
                <option value="">Choose an assertion</option><option value="visible">Element is visible</option><option value="text">Element has text</option><option value="url">Page has URL path</option>
              </select></label>
              {expectation.type && expectation.type !== 'url' && <>
                <label>Locator strategy<select value={expectation.kind} onChange={event => setExpectation({ ...expectation, kind: event.target.value })}>
                  <option value="testId">Test ID</option><option value="label">Label</option><option value="role">Accessible role and name</option>
                </select></label>
                {expectation.kind === 'role' && <label>Role<select value={expectation.role} onChange={event => setExpectation({ ...expectation, role: event.target.value })}>
                  {['button', 'link', 'textbox', 'combobox', 'heading', 'status', 'alert'].map(role => <option key={role}>{role}</option>)}
                </select></label>}
                <label>{expectation.kind === 'role' ? 'Accessible name' : 'Locator value'}<input required maxLength={160} value={expectation.target} onChange={event => setExpectation({ ...expectation, target: event.target.value })} /></label>
              </>}
              {['text', 'url'].includes(expectation.type) && <label>{expectation.type === 'url' ? 'Expected path' : 'Expected text'}
                <input required maxLength={500} value={expectation.value} onChange={event => setExpectation({ ...expectation, value: event.target.value })} /></label>}
            </fieldset>
            <button className="primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit report'}</button>
          </form>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <div className="examples"><h3>Try a known bug</h3>
          {examples.map((item, index) => <details key={item.name}><summary>{item.name}</summary><p>{item.steps}</p>
            <button type="button" onClick={() => example(index)}>Use example expectation</button></details>)}
        </div>
      </aside>
    </div>
  </main>;
}

function Dashboard({ config }: { config: Config }) {
  const [key, setKey] = useState(config.project === 'demo' ? 'local-dashboard' : '');
  const [credential, setCredential] = useState(key);
  const [rows, setRows] = useState<Summary[]>([]);
  const [id, setId] = useState(new URLSearchParams(location.search).get('id') ?? '');
  const [detail, setDetail] = useState<Detail>();
  const [generation, setGeneration] = useState<{ code: string; warnings: string[] }>();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const api = `/api/projects/${encodeURIComponent(config.project)}/reports`;
  async function request(path = '', method = 'GET') {
    const response = await fetch(api + path, { method, headers: { authorization: `Bearer ${credential}` } });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error ?? `Request failed (${response.status}).`);
    }
    return response;
  }
  async function load() {
    setRows(await (await request()).json());
    setDetail(id ? await (await request('/' + encodeURIComponent(id))).json() : undefined);
  }
  useEffect(() => {
    setError(''); setRows([]); setDetail(undefined); setGeneration(undefined); setConfirmDelete(false);
    let current = true;
    Promise.all([request().then(res => res.json()), id ? request('/' + encodeURIComponent(id)).then(res => res.json()) : undefined])
      .then(([items, report]) => { if (current) { setRows(items); setDetail(report); } })
      .catch(error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, [credential, id]);
  async function run(action: 'generate' | 'verify' | 'delete') {
    if (!detail) return;
    setWorking(true); setError('');
    try {
      const path = '/' + encodeURIComponent(detail.id);
      if (action === 'delete') {
        await request(path, 'DELETE'); select('');
      } else {
        const result = await (await request(path + '/' + action, 'POST')).json();
        if (action === 'generate') setGeneration(result);
        await load();
      }
    } catch (error) { setError((error as Error).message); }
    finally { setWorking(false); }
  }
  function select(value: string) {
    history.replaceState(null, '', value ? `/dashboard?id=${encodeURIComponent(value)}` : '/dashboard');
    setId(value);
  }
  async function download(kind: string, filename: string) {
    try {
      const file = await (await request('/' + encodeURIComponent(id) + '/download/' + kind)).blob();
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = filename; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError((error as Error).message); }
  }
  return <main className="shell">
    <div className="breadcrumb">BugRelay <span>/</span> Developer dashboard</div>
    <div className="page-heading"><div><h1>Developer dashboard</h1><p>Review reports, generate tests and verify demo reproductions.</p></div><a className="button" href="/">Open demo workspace</a></div>
    <details className="panel setup"><summary>Project setup and SDK installation</summary>
      <p>Project <code>{config.project}</code>. Copy <a href="/sdk.js" download>sdk.js</a> into your application, then initialize it from a client-side module. Use an application URL base that reaches this API through a same-origin proxy.</p>
      <pre>{`import { createBugRelay } from './sdk.js';
const relay = createBugRelay({
  endpoint: location.origin,
  project: ${JSON.stringify(config.project)},
  ingestionKey: ${JSON.stringify(config.ingestionKey)},
  appVersion: '1.0.0'
});
relay.start(); // after the tester chooses to record
const reviewed = relay.stop(); // preview and allow removals
// await relay.submit({ title, observed, expected, assertion }, reviewed);`}</pre>
      <p>Opt in selected synthetic or non-sensitive text fields and dropdowns with <code>data-bugrelay-allow</code>.</p>
      <form className="field-row" onSubmit={event => { event.preventDefault(); setCredential(key); }}>
        <label>Dashboard credential<input type="password" value={key} onChange={event => setKey(event.target.value)} /></label><button>Unlock reports</button>
      </form>
    </details>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="workspace dashboard-grid">
      <section className="panel report-list"><div className="panel-top"><h2>Reports</h2><small>{rows.length} total</small></div>
        {rows.length ? rows.map(row => <button type="button" disabled={working} key={row.id} className={`report-row ${id === row.id ? 'selected' : ''}`} onClick={() => select(row.id)}>
          <strong>{row.title}</strong><span className="badge">{row.status}</span><small>{row.appVersion ?? 'Version unspecified'} · {format(row.created)}</small>
        </button>) : <p className="empty">No reports yet. Submit a recording from the demo workspace.</p>}
      </section>
      <section className="panel report-detail">
        {detail ? <><div className="panel-top"><div><h2>{detail.report.title}</h2><small>{format(detail.created)}</small></div><span className="badge">{detail.status}</span></div>
          <div className="detail-body">
            <h3>Observed behavior</h3><p>{detail.report.observed}</p>
            <h3>Expected behavior</h3><p>{detail.report.expected}</p>
            {detail.report.assertion ? <pre>{JSON.stringify(detail.report.assertion, null, 2)}</pre> : <p>No assertion provided.</p>}
            <h3>Interaction timeline</h3><p>Start page <code>{detail.report.startPath}</code></p>
            {detail.report.truncated && <p>The recording buffer was truncated.</p>}
            {detail.report.events.length ? <ol className="timeline">{detail.report.events.map((entry, index) => <li key={index}>
              {eventLabel(entry)} <small>{format(entry.at)} · {entry.path}</small>{'warning' in entry && entry.warning && <small>{entry.warning}</small>}
            </li>)}</ol> : <p>No interactions retained.</p>}
            <h3>Console and browser errors</h3>
            {detail.report.logs.length ? <ul>{detail.report.logs.map((entry, index) => <li key={index}>{entry.kind} · {entry.path} · {format(entry.at)}</li>)}</ul> : <p>No error signals retained.</p>}
            <div className="actions">
              <button className="primary" disabled={working} onClick={() => run('generate')}>Generate test</button>
              <button disabled={working} onClick={() => run('verify')}>{working ? 'Working…' : 'Replay approved demo test'}</button>
              <button onClick={() => download('test', 'bugrelay.spec.ts')}>Download test</button>
              <button onClick={() => download('report', 'bugrelay.json')}>Download JSON</button>
              <button onClick={() => download('readme', 'README.md')}>Replay README</button>
            </div>
            {generation && <><h3>Generated Playwright test</h3>{generation.warnings.length > 0 && <ul>{generation.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}<pre>{generation.code}</pre></>}
            {detail.evidence && <><h3>Replay evidence</h3><p>Buggy build {detail.evidence.buggy} · Fixed build {detail.evidence.fixed} · {format(detail.evidence.at)}</p>
              <p>{detail.evidence.intended ? 'The buggy build failed the expected-outcome assertion.' : 'The expected-outcome assertion did not reproduce the bug.'}</p>
              {detail.evidence.assertionFailure && <pre>{detail.evidence.assertionFailure}</pre>}</>}
            <div className="actions">{confirmDelete ? <><button className="stop" disabled={working} onClick={() => run('delete')}>Confirm deletion</button><button onClick={() => setConfirmDelete(false)}>Cancel</button></> :
              <button disabled={working} onClick={() => setConfirmDelete(true)}>Delete report</button>}</div>
          </div></> : <p className="empty">Select a report to view its timeline and generated test.</p>}
      </section>
    </div>
  </main>;
}
function App() {
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState(false);
  const dashboard = location.pathname.startsWith('/dashboard');
  useEffect(() => {
    fetch('/api/local').then(response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(setConfig).catch(() => setError(true));
  }, []);
  return <><Header dashboard={dashboard} />{config ? dashboard ? <Dashboard config={config} /> : <Demo config={config} /> :
    <main className="shell"><p role="status">{error ? 'Could not connect to the local BugRelay API.' : 'Loading BugRelay…'}</p></main>}</>;
}
createRoot(document.getElementById('root')!).render(<App />);
