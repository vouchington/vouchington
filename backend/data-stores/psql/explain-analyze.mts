import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import type { QueryInput } from './types.mts'
import { connectWithRetry } from './connect-with-retry.mts'
import { readPool } from './setup.mts'
import { LEADING_QUERY_ANNOTATION_PATTERN } from './prepared-statement-name.mts'
import { buildExplainPreparedStatementText, buildPreparedArgumentSql } from './explain-prepared.mts'

export { buildExplainPreparedStatementText } from './explain-prepared.mts'
export {
  clearCapturedQueries,
  disableQueryCapture,
  enableQueryCapture,
  getCapturedQueries,
} from './query-capture.mts'

export interface ExplainResult {
  name: string
  query_text: string
  plan: unknown
  execution_time_ms: number
  planning_time_ms: number
  timestamp: string
  jit_mode?: 'on' | 'off'
  plan_cache_mode?: ExplainPlanCacheMode
  scenario_id?: string
  capture_index?: number
}

export type ExplainPlanCacheMode = 'auto' | 'force_custom_plan' | 'force_generic_plan'

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
  options: { jit?: 'on' | 'off'; planCacheMode?: ExplainPlanCacheMode } = {},
): Promise<ExplainResult> {
  let text: string
  if (typeof input === 'string') {
    text = input
  } else if ('text' in input && typeof input.text === 'string') {
    text = input.text
  } else {
    throw new Error('Unable to extract SQL text from input')
  }

  // Strip existing annotation comment for EXPLAIN
  const cleanText = text.replace(LEADING_QUERY_ANNOTATION_PATTERN, '').trimStart()
  const preparedStatementName = `explain_${randomUUID().replaceAll('-', '')}`
  const prepareText = `PREPARE ${preparedStatementName} AS ${cleanText}`

  const jitMode = options.jit ?? getExplainJitMode()
  const planCacheMode = options.planCacheMode ?? 'auto'
  const client = await connectWithRetry(readPool)
  let rows: Array<Record<string, unknown>>
  let prepared = false
  try {
    // ast-grep-ignore: no-three-sequential-awaits -- database transaction/setup statements must remain ordered
    await client.query(sql`/* explainAnalyze */ BEGIN`)
    await client.query(`/* explainAnalyze */ SET LOCAL jit = ${jitMode}`)
    await client.query(`/* explainAnalyze */ SET LOCAL plan_cache_mode = ${planCacheMode}`)
    // Must run before PREPARE: a generic plan can be built at prepare time, so planning and
    // execution have to see the same work_mem or the two can disagree on whether a sort spills.
    await client.query(`/* explainAnalyze */ SET LOCAL work_mem = '${EXPLAIN_WORK_MEM}'`)
    await client.query(`/* explainAnalyze */ ${prepareText}`)
    prepared = true
    const argumentSql = await buildPreparedArgumentSql(client, preparedStatementName, values ?? [])
    const explainText = buildExplainPreparedStatementText(preparedStatementName, argumentSql)
    const queryResult = await client.query(explainText)
    await client.query(`/* explainAnalyze */ DEALLOCATE ${preparedStatementName}`)
    prepared = false
    await client.query(sql`/* explainAnalyze */ ROLLBACK`)
    rows = queryResult.rows as Array<Record<string, unknown>>
  } catch (err) {
    await client.query(sql`/* explainAnalyze */ ROLLBACK`).catch(onError)
    if (prepared) {
      await client.query(`/* explainAnalyze */ DEALLOCATE ${preparedStatementName}`).catch(onError)
    }
    throw err
  } finally {
    client.release()
  }
  const plan = rows[0]?.['QUERY PLAN'] ?? rows[0]

  // Extract timing from the plan
  const planData = Array.isArray(plan) ? plan[0] : plan

  return {
    name,
    query_text: text,
    plan: planData,
    execution_time_ms: planData?.['Execution Time'] ?? 0,
    planning_time_ms: planData?.['Planning Time'] ?? 0,
    timestamp: new Date().toISOString(),
    jit_mode: jitMode,
    plan_cache_mode: planCacheMode,
  }
}

export function buildExplainAnalyzeText(cleanText: string): string {
  return `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) ${cleanText}`
}

function getExplainJitMode(): 'on' | 'off' {
  const mode = process.env.EXPLAIN_JIT_MODE ?? 'off'
  if (mode !== 'on' && mode !== 'off') {
    throw new Error(`EXPLAIN_JIT_MODE must be "on" or "off", got "${mode}"`)
  }
  return mode
}
