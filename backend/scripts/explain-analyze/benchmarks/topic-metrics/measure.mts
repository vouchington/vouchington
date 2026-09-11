import type { ExplainPlanCacheMode, ExplainResult } from '@data-stores/psql'
import type { TopicMetrics } from '@services/topics/types'
import { effectiveRows, maximum, measureBurst, measureSequential, summarize } from './sampling.mts'

interface PoolLike {
  totalCount: number
  idleCount: number
  waitingCount: number
}

interface CapturedQuery {
  text: string
  values: readonly unknown[]
}

interface MeasureDependencies {
  topicIds: string[]
  readPool: PoolLike
  getTopicMetrics: (ids: string[]) => Promise<Array<TopicMetrics | null | undefined>>
  clearCapturedQueries: () => void
  enableQueryCapture: () => void
  disableQueryCapture: () => void
  getCapturedQueries: () => CapturedQuery[]
  explainAnalyze: (
    name: string,
    text: string,
    values: readonly unknown[],
    options: { planCacheMode: ExplainPlanCacheMode },
  ) => Promise<ExplainResult>
}

export interface TopicMetricsMeasurements {
  warmupCount: number
  sequential: ReturnType<typeof summarize>
  burst: ReturnType<typeof summarize> & {
    requestCount: number
    concurrency: number
    launchCadenceMs: number
  }
  readPool: {
    sampleIntervalMs: number
    raw: PoolGauge[]
    peakTotal: number
    peakBusy: number
    peakWaiting: number
  }
  plans: BenchmarkPlan[]
}

type PoolGauge = { atMs: number; total: number; idle: number; waiting: number }
type BenchmarkPlan = {
  planCacheMode: 'force_custom_plan' | 'force_generic_plan'
  executionMs: number
  effectiveRows: number
  plan: unknown
}

export async function measureTopicMetricsBenchmark({
  topicIds,
  readPool,
  getTopicMetrics,
  clearCapturedQueries,
  enableQueryCapture,
  disableQueryCapture,
  getCapturedQueries,
  explainAnalyze,
}: MeasureDependencies): Promise<TopicMetricsMeasurements> {
  const poolGauges: PoolGauge[] = []
  const benchmarkStartedAt = performance.now()
  const poolTimer = setInterval(() => {
    poolGauges.push({
      atMs: performance.now() - benchmarkStartedAt,
      total: readPool.totalCount,
      idle: readPool.idleCount,
      waiting: readPool.waitingCount,
    })
  }, 5)

  try {
    for (let index = 0; index < 5; index += 1) await getTopicMetrics(topicIds)
    const sequential = await measureSequential(20, () => getTopicMetrics(topicIds))
    const burst = await measureBurst(20, 5, 5, () => getTopicMetrics(topicIds))
    const plans = await capturePlans({
      topicIds,
      getTopicMetrics,
      clearCapturedQueries,
      enableQueryCapture,
      disableQueryCapture,
      getCapturedQueries,
      explainAnalyze,
    })
    return {
      warmupCount: 5,
      sequential: summarize(sequential),
      burst: {
        ...summarize(burst),
        requestCount: 20,
        concurrency: 5,
        launchCadenceMs: 5,
      },
      readPool: {
        sampleIntervalMs: 5,
        raw: poolGauges,
        peakTotal: maximum(poolGauges.map(sample => sample.total)),
        peakBusy: maximum(poolGauges.map(sample => sample.total - sample.idle)),
        peakWaiting: maximum(poolGauges.map(sample => sample.waiting)),
      },
      plans,
    }
  } finally {
    clearInterval(poolTimer)
  }
}

async function capturePlans(
  dependencies: Pick<
    MeasureDependencies,
    | 'topicIds'
    | 'getTopicMetrics'
    | 'clearCapturedQueries'
    | 'enableQueryCapture'
    | 'disableQueryCapture'
    | 'getCapturedQueries'
    | 'explainAnalyze'
  >,
): Promise<BenchmarkPlan[]> {
  dependencies.clearCapturedQueries()
  dependencies.enableQueryCapture()
  try {
    await dependencies.getTopicMetrics(dependencies.topicIds)
  } finally {
    dependencies.disableQueryCapture()
  }
  const captured = dependencies.getCapturedQueries()
  if (captured.length !== 1 || !captured[0]) {
    throw new Error(`expected one captured topic metrics query; found ${captured.length}`)
  }
  const plans: BenchmarkPlan[] = []
  for (const planCacheMode of ['force_custom_plan', 'force_generic_plan'] as const) {
    const result = await dependencies.explainAnalyze(
      'topic-metrics-benchmark',
      captured[0].text,
      captured[0].values,
      { planCacheMode },
    )
    plans.push({
      planCacheMode,
      executionMs: result.execution_time_ms,
      effectiveRows: effectiveRows(result.plan),
      plan: result.plan,
    })
  }
  return plans
}
