import type { Hono } from 'hono';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const line = (at: string, job: string, status: string, owner: string | null = 'rook') =>
  JSON.stringify({ at, job, status, owner });

let runsDir: string;
let app: Hono;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(
    join(runsDir, '2030-01-01.jsonl'),
    [
      line('2030-01-01T02:00:00+01:00', 'zeta/job', 'ok'),
      line('2030-01-01T01:00:00+01:00', 'alpha/job', 'ok', null),
      line('2030-01-01T03:00:00+01:00', 'mid/job', 'ok'),
    ].join('\n') + '\n',
  );
  writeFileSync(join(runsDir, '2030-01-02.jsonl'), '');
  writeFileSync(
    join(runsDir, '2030-01-03.jsonl'),
    [
      line('2030-01-03T02:00:00+01:00', 'zeta/job', 'ok'),
      'this is not json',
      line('2030-01-03T01:00:00+01:00', 'alpha/job', 'fail'),
    ].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function jobOrder(html: string, jobs: string[]): string[] {
  return jobs
    .map((job) => ({ job, at: html.indexOf(job) }))
    .filter((j) => j.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((j) => j.job);
}

describe('GET /digest/:night', () => {
  it('renders a night with runs', async () => {
    const res = await app.request('/digest/2030-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['alpha/job', 'mid/job', 'zeta/job']) expect(html).toContain(job);
  });

  it('404s a night with no file, in the layout', async () => {
    const res = await app.request('/digest/2030-02-02');
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('no run log for 2030-02-02');
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request('/digest/2030-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('keeps good rows and reports a bad line', async () => {
    const res = await app.request('/digest/2030-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/job');
    expect(html).toContain('zeta/job');
    expect(html).toContain('1 line could not be read');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the digest for a night with runs', async () => {
    const res = await app.request('/api/digest/2030-01-01');
    const body = (await res.json()) as NightDigest;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2030-01-01');
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/job', 'mid/job', 'zeta/job']);
    expect(body.rows[0]?.owner).toBeNull();
    expect(body.badLines).toBe(0);
  });

  it('404s a night with no file', async () => {
    const res = await app.request('/api/digest/2030-02-02');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2030-02-02' });
  });

  it('has no rows for an empty night', async () => {
    const res = await app.request('/api/digest/2030-01-02');
    const body = (await res.json()) as NightDigest;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
  });

  it('keeps good rows and counts the bad line', async () => {
    const res = await app.request('/api/digest/2030-01-03');
    const body = (await res.json()) as NightDigest;
    expect(res.status).toBe(200);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/job', 'zeta/job']);
    expect(body.badLines).toBe(1);
  });
});

describe('page and JSON agree', () => {
  it.each(['2030-01-01', '2030-01-03'])('lists the same jobs in the same order for %s', async (night) => {
    const body = (await (await app.request(`/api/digest/${night}`)).json()) as NightDigest;
    const html = await (await app.request(`/digest/${night}`)).text();
    const jobs = body.rows.map((r) => r.job);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobOrder(html, jobs)).toEqual(jobs);
  });
});
