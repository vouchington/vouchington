import {
  explainAnalyze as captureExplain,
  type ExplainPlanCacheMode,
  type ExplainResult,
} from '@vouchington/explain-plan'
import type { QueryInput } from '@data-stores/psql/types'
import { connectWithRetry, LEADING_QUERY_ANNOTATION_PATTERN } from '@vouchington/postgres'
import { readPool } from '@data-stores/psql/setup'

export {
  clearCapturedQueries,
  disableQueryCapture,
  enableQueryCapture,
  getCapturedQueries,
  runWithCapturedQueries,
} from '@data-stores/psql/query-capture'

// Production (Aurora Serverless v2) auto-tunes work_mem from live ACU capacity, so there is no
// fixed production value to pin app-wide. EXPLAIN capture is the one place that needs a fixed,
// known budget instead: the resource-pressure gate in analyze.mts asserts zero tolerance for
// disk-spilling sorts and hash-batch spills, and that assertion is only meaningful against a
// declared memory ceiling. 32MB is picked from real evidence, not a guess: CI workflow run
// 33651571167 recorded getPostFeedIds:heavy* external-merge disk sorts of 4504-5688kB at
// Postgres's stock 4MB default, and getPlatformStats' own Sort (~10108kB, see
// resource-pressure-baseline.mts) fits comfortably under 32MB — well under Aurora Serverless v2's
// smallest capacity tier. This must equal the CI Postgres service's `work_mem` initdb arg
// (explain-analyze.yml) — that pin covers planning outside this capture transaction
// (db:migrate, explain:seed); this SET LOCAL is what makes a local run reach the same verdict.
//
// Fixed, not env-overridable — an override would let a local run silently diverge from CI again,
// which is exactly the bug this constant exists to close (see #11081).
const EXPLAIN_WORK_MEM = '32MB'

export function extractQueryName(sqlText: string): string | null {
  const match = sqlText.match(LEADING_QUERY_ANNOTATION_PATTERN)
  const annotation = match?.[1]?.trim()
  return annotation ? annotation : null
}

export async function explainAnalyze(
  name: string,
  input: QueryInput,
  values?: readonly unknown[],
  options: {
    jit?: 'on' | 'off'
    planCacheMode?: ExplainPlanCacheMode
    localSettings?: Readonly<Record<string, string>>
    planOnly?: boolean // EXPLAIN without executing; callers read only plan costs
    /** Recreate captured session-local objects before preparing the measured statement. */
    setupSql?: string
  } = {},
): Promise<ExplainResult> {
  let text: string
  if (typeof input === 'string') {
    text = input
  } else if ('text' in input && typeof input.text === 'string') {
    text = input.text
  } else {
    throw new Error('Unable to extract SQL text from input')
  }

  return captureExplain({
    ...options,
    withClient: async run => {
      const client = await connectWithRetry(readPool)
      try {
        return await run(client)
      } finally {
        client.release()
      }
    },
    name,
    text,
    values: values ?? [],
    jit: options.jit ?? getExplainJitMode(),
    workMem: EXPLAIN_WORK_MEM,
    statementTag: 'explainAnalyze',
  })
}

function getExplainJitMode(): 'on' | 'off' {
  const mode = process.env.EXPLAIN_JIT_MODE ?? 'off'
  if (mode !== 'on' && mode !== 'off') {
    throw new Error(`EXPLAIN_JIT_MODE must be "on" or "off", got "${mode}"`)
  }
  return mode
}
