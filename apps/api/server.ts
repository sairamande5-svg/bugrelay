import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expectationEdit, MAX_PAYLOAD, report } from '../../packages/report-schema/index.ts';
import type { Report } from '../../packages/report-schema/index.ts';
import { generate, instructions } from '../../packages/test-generator/index.ts';
import { fixtures } from '../../benchmarks/fixtures.ts';
import { replay } from '../../benchmarks/replay.ts';

const mode = process.env.BUGRELAY_MODE ?? 'local';
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '127.0.0.1';
const project = process.env.BUGRELAY_PROJECT ?? 'demo';
const readKey = process.env.BUGRELAY_READ_KEY ?? 'local-dashboard';
const ingestionKey = process.env.BUGRELAY_INGESTION_KEY ?? 'local-ingestion';
if (mode !== 'local' || !['127.0.0.1', '0.0.0.0'].includes(host) || (host === '0.0.0.0' && process.env.BUGRELAY_CONTAINER !== '1')) {
  throw new Error('BugRelay supports local development. Compose publishes the container port to loopback only.');
}
if (readKey === ingestionKey) throw new Error('Use distinct dashboard and ingestion credentials.');
const data = process.env.BUGRELAY_DATA ?? 'data';
mkdirSync(data, { recursive: true });
const db = new DatabaseSync(resolve(data, 'bugrelay.sqlite'));
db.exec(`PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, project TEXT NOT NULL, created INTEGER NOT NULL,
  payload TEXT NOT NULL, status TEXT NOT NULL, evidence TEXT, revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reports_project_created ON reports(project, created);`);
if (!db.prepare('PRAGMA table_info(reports)').all().some(column => column.name === 'revision')) {
  db.exec('ALTER TABLE reports ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
}
type Row = { revision: number; id: string; project: string; created: number; payload: string; status: string; evidence: string | null };
const retention = 30 * 86400000;
const expire = () => db.prepare('DELETE FROM reports WHERE created < ?').run(Date.now() - retention);
expire();
setInterval(expire, 3600000).unref();
const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(_req.hostname)) {
    res.status(403).send('Use a loopback hostname for local development.');
    return;
  }
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  next();
});
app.get('/api/local', (_req, res) => res.set('Cache-Control', 'no-store').json({ project, ingestionKey, appVersion: 'demo-1' }));
const api = express.Router({ mergeParams: true });
app.use('/api/projects/:project/reports', api);
const equal = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const ingest = req.method === 'POST' && req.path === '/';
  const provided = ingest ? req.get('x-bugrelay-ingestion') ?? '' : (req.get('authorization') ?? '').replace(/^Bearer /, '');
  if (req.params.project !== project || !equal(provided, ingest ? ingestionKey : readKey)) {
    res.status(403).json({ error: 'Project access denied.' });
    return;
  }
  next();
});
api.use(express.json({ limit: MAX_PAYLOAD }));
api.post('/', (req, res) => {
  const parsed = report.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Report does not match schema v1.' });
    return;
  }
  const count = db.prepare('SELECT count(*) AS count FROM reports WHERE project = ?').get(project)?.count;
  if (Number(count) >= 500) {
    res.status(429).json({ error: 'The local project has reached its 500-report limit.' });
    return;
  }
  const id = randomUUID();
  db.prepare('INSERT INTO reports (id, project, created, payload, status) VALUES (?, ?, ?, ?, ?)').run(id, project, Date.now(), JSON.stringify(parsed.data), 'Captured');
  res.status(201).json({ id });
});
function view(row: Row) {
  return { id: row.id, created: row.created, revision: row.revision, status: row.status, report: JSON.parse(row.payload) as Report,
    evidence: row.evidence ? JSON.parse(row.evidence) : null };
}
api.get('/', (_req, res) => {
  res.json((db.prepare('SELECT * FROM reports WHERE project = ? ORDER BY created DESC').all(project) as Row[]).map(view).map(row =>
    ({ id: row.id, created: row.created, status: row.status, title: row.report.title, appVersion: row.report.appVersion })));
});
const find = (id: string) => db.prepare('SELECT * FROM reports WHERE project = ? AND id = ?').get(project, id) as Row | undefined;
api.get('/:id', (req, res) => {
  const row = find(req.params.id);
  if (!row) { res.sendStatus(404); return; }
  res.json(view(row));
});
api.patch('/:id/expectation', (req, res) => {
  const edit = expectationEdit.safeParse(req.body);
  if (!edit.success) {
    res.status(400).json({ error: 'Provide a valid expected outcome, assertion and report revision.' });
    return;
  }
  const row = find(req.params.id);
  if (!row) { res.sendStatus(404); return; }
  const { revision, expected, assertion } = edit.data;
  if (row.revision !== revision) {
    res.status(409).json({ error: 'This report changed. Reload it before editing again.' });
    return;
  }
  const previous = view(row);
  if (expected === previous.report.expected && JSON.stringify(assertion) === JSON.stringify(previous.report.assertion ?? null)) {
    res.json(previous);
    return;
  }
  const updated = { ...previous.report, expected, assertion: assertion ?? undefined };
  const testChanged = generate(updated).code !== generate(previous.report).code;
  const saved = db.prepare(`UPDATE reports SET payload = ?, revision = revision + 1, status = ?, evidence = ?
    WHERE id = ? AND project = ? AND revision = ? RETURNING *`)
    .get(JSON.stringify(updated), testChanged ? 'Captured' : row.status, testChanged ? null : row.evidence,
      row.id, project, revision) as Row | undefined;
  if (!saved) {
    res.status(409).json({ error: 'This report changed. Reload it before editing again.' });
    return;
  }
  res.json(view(saved));
});
api.get('/:id/download/:kind', (req, res) => {
  const row = find(req.params.id);
  if (!row) { res.sendStatus(404); return; }
  if (req.params.kind === 'report') res.attachment('bugrelay.json').json(view(row).report);
  else if (req.params.kind === 'readme') res.attachment('README.md').type('text/plain').send(instructions);
  else if (req.params.kind === 'test') res.attachment('bugrelay.spec.ts').type('text/plain').send(generate(view(row).report).code);
  else res.sendStatus(404);
});
api.post('/:id/generate', (req, res) => {
  const row = find(req.params.id);
  if (!row) { res.sendStatus(404); return; }
  const output = generate(view(row).report);
  if (!row.evidence) db.prepare('UPDATE reports SET status = ? WHERE id = ? AND project = ?')
    .run(output.warnings.length ? 'Needs review' : 'Test generated', row.id, project);
  res.json(output);
});
let busy = false;
api.post('/:id/verify', async (req, res) => {
  const row = find(req.params.id);
  if (!row) { res.sendStatus(404); return; }
  const submitted = view(row).report;
  const output = generate(submitted);
  const approved = fixtures.some(fixture => generate({ ...fixture, title: submitted.title }).code === output.code);
  if (project !== 'demo' || output.warnings.length || !approved) {
    res.status(422).json({ error: 'Replay is available for the approved demo sequences shown beside the recorder.' });
    return;
  }
  if (busy) { res.status(409).json({ error: 'A demo replay is already running.' }); return; }
  busy = true;
  try {
    const result = await replay(output.code, `http://127.0.0.1:${port}`);
    const evidence = { ...result, at: Date.now() };
    const status = result.intended ? (result.fixed === 'passed' ? 'Fix verified' : 'Reproduction verified') : 'Needs review';
    const saved = db.prepare('UPDATE reports SET status = ?, evidence = ? WHERE id = ? AND project = ? AND revision = ?')
      .run(status, JSON.stringify(evidence), row.id, project, row.revision);
    if (!saved.changes) {
      res.status(409).json({ error: 'The report changed during replay. Reload it before running again.' });
      return;
    }
    res.json(evidence);
  } catch (error) {
    console.error('Demo replay failed:', error);
    res.status(503).json({ error: 'Playwright replay could not complete. Check browser installation and server logs.' });
  } finally {
    busy = false;
  }
});
api.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM reports WHERE project = ? AND id = ?').run(project, req.params.id);
  res.sendStatus(204);
});
app.use(express.static(resolve('dist')));
app.get(/^\/(buggy|fixed|dashboard)(\/.*)?$/, (_req, res) => res.sendFile(resolve('dist/index.html')));
app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error.status === 413 ? 413 : 400;
  res.status(status).json({ error: status === 413 ? 'Report exceeds the payload limit.' : 'Invalid request.' });
});
app.listen(port, host, () => console.log(`BugRelay local development · http://localhost:${port}`));
