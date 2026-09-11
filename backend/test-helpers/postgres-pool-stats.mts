import { readPool, writePool } from '@data-stores/psql'

export function getPostgresPoolWaitCounts(): { read: number; write: number } {
  return { read: readPool.waitingCount, write: writePool.waitingCount }
}
