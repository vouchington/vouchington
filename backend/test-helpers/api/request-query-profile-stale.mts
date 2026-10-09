// Report-only: lists baseline entries that no longer repeat in CI logs. Never sets a failing exit
// code. Usage: node backend/test-helpers/api/request-query-profile-stale.mts <log-file>...
// Pass every shard's log from one full run; a single shard sees only a slice of the routes.
import { readFileSync } from 'node:fs'
import {
  findStaleBaselineEntries,
  observedRepeatAnnotations,
  type RepeatBaselineEntry,
} from '@data-stores/psql/request-query-profile-baseline'

const baseline = JSON.parse(
  readFileSync(new URL('./request-query-profile-baseline.json', import.meta.url), 'utf8'),
) as RepeatBaselineEntry[]
const logs = process.argv.slice(2).map(path => readFileSync(path, 'utf8'))
const stale = findStaleBaselineEntries(baseline, observedRepeatAnnotations(logs.join('\n')))
for (const { annotation, issue } of stale) {
  process.stdout.write(`stale baseline entry: ${annotation} (#${issue})\n`)
}
process.stdout.write(`${stale.length} of ${baseline.length} baseline entries are stale\n`)
