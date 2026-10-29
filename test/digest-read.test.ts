import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const night = '2026-10-28';
const at = '2026-10-29T01:00:00+01:00';
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  tempDirs.push(dir);
  return dir;
}

function writeNight(lines: unknown[]): string {
  const dir = tempDir();
  writeFileSync(join(dir, `${night}.jsonl`), lines.map(line => JSON.stringify(line)).join('\n'));
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('digests the real night into five sorted jobs and counts its bad line', () => {
    expect(readNight('runs', night)).toEqual({
      night,
      counts: { ok: 10, retry: 4, fail: 1 },
      badLines: 1,
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
          lastStatus: 'ok', lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1,
          lastStatus: 'ok', lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('uses file order, the latest owner, and the latest line with an error', () => {
    const firstAt = '2026-10-29T03:00:00+02:00';
    const lastAt = '2026-10-28T23:00:00+04:00';
    const dir = writeNight([
      { at: firstAt, job: 'job', status: 'retry', owner: 'old', error: 'first error' },
      { at, job: 'job', status: 'fail', owner: 'new', error: 'last error' },
      { at: lastAt, job: 'job', status: 'ok' },
    ]);
    expect(readNight(dir, night)).toEqual({
      night, counts: { ok: 1, retry: 1, fail: 1 }, badLines: 0,
      rows: [{
        job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok',
        lastError: 'last error', firstAt, lastAt,
      }],
    });
  });

  it('counts invalid JSON and invalid required fields without dropping valid lines', () => {
    const invalid = [
      null, [], 'text', 42, true, {},
      { job: 'job', status: 'ok' },
      { at: 123, job: 'job', status: 'ok' },
      { at: 'not a date', job: 'job', status: 'ok' },
      { at, status: 'ok' },
      { at, job: '', status: 'ok' },
      { at, job: '  ', status: 'ok' },
      { at, job: 123, status: 'ok' },
      { at, job: 'job' },
      { at, job: 'job', status: 'unknown' },
    ];
    const dir = tempDir();
    const valid = JSON.stringify({ at, job: 'valid', status: 'ok' });
    writeFileSync(join(dir, `${night}.jsonl`), [
      valid, ...invalid.map(line => JSON.stringify(line)), '{broken', '', ' \t\r', valid,
    ].join('\n'));
    expect(readNight(dir, night)).toEqual({
      night, counts: { ok: 2, retry: 0, fail: 0 }, badLines: invalid.length + 1,
      rows: [{
        job: 'valid', owner: null, runs: 2, retries: 0,
        lastStatus: 'ok', lastError: null, firstAt: at, lastAt: at,
      }],
    });
  });

  it('distinguishes an empty or whitespace-only file from a missing night', () => {
    const dir = writeNight([]);
    const empty = { night, rows: [], counts: { ok: 0, retry: 0, fail: 0 }, badLines: 0 };
    expect(readNight(dir, night)).toEqual(empty);
    writeFileSync(join(dir, `${night}.jsonl`), '\r\n  \n\t\r\n');
    expect(readNight(dir, night)).toEqual(empty);
    expect(readNight(dir, '2026-10-27')).toBeNull();
    expect(readNight(join(dir, 'missing'), night)).toBeNull();
  });

  it('rejects path traversal and malformed nights even if their target exists', () => {
    const root = writeNight([]);
    const dir = join(root, 'runs');
    mkdirSync(dir);
    for (const invalidNight of [
      '', '../2026-10-28', '2026-1-28', '20261028', '2026-10-28\n',
      '2026-10-28/extra', `${root}/2026-10-28`,
    ]) {
      expect(readNight(dir, invalidNight)).toBeNull();
    }
    writeFileSync(join(dir, '20261028.jsonl'), '');
    writeFileSync(join(dir, '2026-10-28\n.jsonl'), '');
    expect(readNight(dir, '20261028')).toBeNull();
    expect(readNight(dir, '2026-10-28\n')).toBeNull();
  });
});
