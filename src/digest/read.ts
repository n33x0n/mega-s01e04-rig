import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, StatusCounts } from './types.js';

/** Reads in file order, preserving logged timestamps and the last reported error per job. */
export const readNight: ReadNight = (runsDir, night) => {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const jobs = new Map<string, DigestRow>();
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const line of contents.split('\n')) {
    if (!line.trim()) continue;

    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }

    if (
      typeof entry !== 'object' || entry === null ||
      !('at' in entry) || typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at)) ||
      !('job' in entry) || typeof entry.job !== 'string' || !entry.job.trim() ||
      !('status' in entry) || (entry.status !== 'ok' && entry.status !== 'retry' && entry.status !== 'fail')
    ) {
      badLines++;
      continue;
    }

    const owner = 'owner' in entry && typeof entry.owner === 'string' ? entry.owner : null;
    const error = 'error' in entry && typeof entry.error === 'string' ? entry.error : null;
    counts[entry.status]++;

    const row = jobs.get(entry.job);
    if (row) {
      row.owner = owner;
      row.runs++;
      if (entry.status === 'retry') row.retries++;
      row.lastStatus = entry.status;
      if (error !== null) row.lastError = error;
      row.lastAt = entry.at;
    } else {
      jobs.set(entry.job, {
        job: entry.job,
        owner,
        runs: 1,
        retries: entry.status === 'retry' ? 1 : 0,
        lastStatus: entry.status,
        lastError: error,
        firstAt: entry.at,
        lastAt: entry.at,
      });
    }
  }

  return {
    night,
    rows: [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
    counts,
    badLines,
  };
};
