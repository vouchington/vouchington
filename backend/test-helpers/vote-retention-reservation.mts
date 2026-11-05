import { acquireTestPostgresAdvisoryLock } from './postgres-advisory-lock.mts'

/** Reserve vote-retention work and its shared daily counters across test processes. */
export function reserveTestVoteRetention() {
  return acquireTestPostgresAdvisoryLock({
    namespace: 1_280_124_961,
    key: 1,
    timeout: '60s',
  })
}
