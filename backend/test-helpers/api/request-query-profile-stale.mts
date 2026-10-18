// Report-only: lists baseline entries that no longer repeat in CI logs. Never sets a failing exit
// code. Usage: node backend/test-helpers/api/request-query-profile-stale.mts <run-log>...
// Pass one log per completed main merge-group Backend run (concatenate that run's shard logs into
// one file): an entry is stale only when it is absent from every log, and fewer than
// MIN_STALE_EVIDENCE_LOGS logs is not enough evidence to act on.
import { readFileSync } from 'node:fs'
import { parseRepeatBaseline } from '@data-stores/psql/request-query-profile-baseline'
import {
  buildStaleReport,
  MIN_STALE_EVIDENCE_LOGS,
} from '@data-stores/psql/request-query-profile-stale-report'

const baseline = parseRepeatBaseline(
  JSON.parse(
    readFileSync(new URL('./request-query-profile-baseline.json', import.meta.url), 'utf8'),
  ),
)
const logs = process.argv.slice(2).map(path => readFileSync(path, 'utf8'))
const { logCount, sufficient, stale } = buildStaleReport(baseline, logs)
for (const entry of stale) {
  const owner = 'issue' in entry ? `#${entry.issue}` : `permanent, ${entry.code}`
  process.stdout.write(`stale baseline entry: ${entry.annotation} (${owner})\n`)
}
process.stdout.write(
  `${stale.length} of ${baseline.length} baseline entries are absent from all ${logCount} logs\n`,
)
if (!sufficient) {
  process.stdout.write(
    `warning: only ${logCount} logs given, fewer than the ${MIN_STALE_EVIDENCE_LOGS} needed; this result is not safe to act on\n`,
  )
}
