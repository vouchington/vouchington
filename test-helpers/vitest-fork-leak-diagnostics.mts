import type { PsqlPoolMetric, PsqlPoolMetrics } from '@data-stores/psql/pool-metrics'
import type { ForkLeakVerdict } from 'vouchington-tooling/vitest-diagnostics'

type ForkLeakGrowthStep = NonNullable<ForkLeakVerdict['suspectedGrowth']>
import { formatResourceCounts } from './vitest-process-resources.mts'

type PsqlPoolMetricsProvider = () => PsqlPoolMetrics

export function getRegisteredPsqlPoolMetrics(): PsqlPoolMetrics | null {
  const provider = (
    globalThis as typeof globalThis & Record<symbol, PsqlPoolMetricsProvider | undefined>
  )[Symbol.for('vitest-fork-leak-psql-pool-metrics')]
  return provider?.() ?? null
}

export function formatForkLeakDiagnostics(
  verdict: ForkLeakVerdict,
  counts: ReadonlyMap<string, number>,
  psqlPoolMetrics: PsqlPoolMetrics | null = null,
): string {
  const lines = [
    '[vitest-fork-leak]',
    `type: ${verdict.type}`,
    `baseline: ${verdict.baseline}`,
    `current: ${verdict.current} (+${verdict.current - verdict.baseline})`,
    `candidate evidence span: ${verdict.streak}`,
    `candidate growth evidence: ${verdict.growthCheckpoints} (required: ${verdict.requiredGrowthCheckpoints})`,
    `confirmed by continuation in file: ${verdict.detectedInFile ?? 'unknown'}`,
    `suspected growth file: ${verdict.suspectedGrowth?.testFile ?? 'unknown'}`,
    `largest growth step: ${formatGrowthStep(verdict.suspectedGrowth)}`,
    `tracked resource counts: ${formatResourceCounts(counts)}`,
    `PostgreSQL pool metrics: ${formatPsqlPoolMetrics(psqlPoolMetrics)}`,
  ]
  return lines.join('\n')
}

function formatPsqlPoolMetrics(psqlPoolMetrics: PsqlPoolMetrics | null): string {
  if (!psqlPoolMetrics) return 'unavailable (pools not initialized)'

  return [
    formatPsqlPool('write', psqlPoolMetrics.write),
    formatPsqlPool('read', psqlPoolMetrics.read),
    formatPsqlPool('advisory-lock', psqlPoolMetrics.advisoryLock),
  ].join(' ')
}

function formatPsqlPool(label: string, pool: PsqlPoolMetric): string {
  return `${label}(total=${pool.total},idle=${pool.idle},non-idle-or-connecting=${pool.nonIdleOrConnecting},waiting=${pool.waiting})`
}

function formatGrowthStep(step: ForkLeakGrowthStep | null): string {
  return step ? `${step.previous} -> ${step.current} (+${step.delta})` : 'unknown'
}
