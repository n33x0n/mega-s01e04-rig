/** Status of a parsed run-log line. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One job's runs within a night. */
export type DigestRow = {
  /** Job name. */
  job: string;
  /** Owner from the job's latest line; null is kept and displayed as —. */
  owner: string | null;
  /** Number of parsed lines for the job. */
  runs: number;
  /** Number of the job's lines with status retry. */
  retries: number;
  /** Status of the job's latest line. */
  lastStatus: RunStatus;
  /** Error from the job's latest line that has one, or null. */
  lastError: string | null;
  /** Earliest line's at value, exactly as logged, including its offset. */
  firstAt: string;
  /** Latest line's at value, exactly as logged, including its offset. */
  lastAt: string;
};

/** Number of parsed lines per status. */
export type StatusCounts = {
  /** Number of parsed lines with status ok. */
  ok: number;
  /** Number of parsed lines with status retry. */
  retry: number;
  /** Number of parsed lines with status fail. */
  fail: number;
};

/** Digest of one night's run log. */
export type NightDigest = {
  /** Night identified by YYYY-MM-DD. */
  night: string;
  /** One row per job, sorted by job. */
  rows: DigestRow[];
  /** Parsed-line counts by status. */
  counts: StatusCounts;
  /** Number of lines that did not parse. */
  badLines: number;
};

/** readNight in src/digest/read.ts; null for a missing <runsDir>/<night>.jsonl or a night not in YYYY-MM-DD form. */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
