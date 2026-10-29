import type { NightDigest } from '../digest/types.js';

const dash = '—';

export function DigestPage({ digest }: { digest: NightDigest }) {
  const { night, rows, badLines } = digest;
  return (
    <>
      <h1>digest · {night}</h1>
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const marked = r.retries >= 3 || r.lastStatus === 'fail';
              return (
                <tr class={marked ? 'warn' : undefined}>
                  <td>{r.job}{marked ? ' ⚠ check' : ''}</td>
                  <td>{r.owner ?? dash}</td>
                  <td>{r.runs}</td>
                  <td>{r.retries}</td>
                  <td>{r.lastStatus}</td>
                  <td>{r.lastError ?? dash}</td>
                  <td class="time">{r.firstAt}</td>
                  <td class="time">{r.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {badLines > 0 && (
        <p class="mute">{badLines === 1 ? '1 line could not be read' : `${badLines} lines could not be read`}</p>
      )}
    </>
  );
}

export function DigestMissing({ night }: { night: string }) {
  return <p class="mute">no run log for {night}</p>;
}
