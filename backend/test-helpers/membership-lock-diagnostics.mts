import { writeSync } from 'node:fs'
import { advisoryLockPool, writePool } from '@data-stores/psql'

export function createMembershipLockDiagnosticReporter(enabled: boolean) {
  const startedAt = performance.now()
  const lastWaitDiagnostics = new Map<string, number>()
  const emit = (phase: string, details = '') => {
    try {
      if (!enabled || process.env.VITEST_CI_REPORTERS !== 'run') return
      const pools = `write=${writePool.totalCount}/${writePool.idleCount}/${writePool.waitingCount} advisory=${advisoryLockPool.totalCount}/${advisoryLockPool.idleCount}/${advisoryLockPool.waitingCount}`
      writeSync(
        2,
        `[membership-lock] phase=${phase} elapsed_ms=${Math.round(performance.now() - startedAt)} ${pools}${details ? ` ${details}` : ''}\n`,
      )
    } catch {
      // Diagnostics must never affect the operation or its cleanup.
    }
  }
  const observeWait = (diagnostic: {
    phase: 'snapshot-clear-start' | 'snapshot-cleared' | 'waiter-query-start' | 'waiter-query'
    waiting: boolean
  }) => {
    try {
      if (!enabled || process.env.VITEST_CI_REPORTERS !== 'run') return
      const elapsed = performance.now() - startedAt
      const last = lastWaitDiagnostics.get(diagnostic.phase) ?? Number.NEGATIVE_INFINITY
      if (!diagnostic.waiting && elapsed - last < 1_000) return
      lastWaitDiagnostics.set(diagnostic.phase, elapsed)
      emit(diagnostic.phase, `marker=membership waiter=${diagnostic.waiting}`)
    } catch {
      // Diagnostics must never affect the operation or its cleanup.
    }
  }
  return { emit, observeWait }
}
