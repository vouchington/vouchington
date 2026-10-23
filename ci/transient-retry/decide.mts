import { appendFileSync } from 'node:fs'

import {
  buildWorkflowRunContext,
  createGhApi,
  createGhLogStreamer,
  decide,
  DEFAULT_LOG_LIMITS,
  type DecisionResult,
} from 'vouchington-tooling/transient-retry'
import { readDecisionEnv } from './env.mts'
import { rules } from './rules.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

// Voucha's workflow dispatch protocol falls through to automation when no retry rule matches.
export async function evaluateWorkflow(context: WorkflowRunContext, catalog: TransientRetryRule[]) {
  const result = await decide(context, catalog, { unmatchedDecision: 'dispatch' })
  return { decision: result.decision, matchedRule: result.matchedRule }
}

export function formatDecisionOutput(result: {
  decision: DecisionResult['decision']
  matchedRule: string
}): string {
  return `decision=${result.decision}\nmatched_rule=${result.matchedRule}\n`
}

if (import.meta.main) {
  const { conclusion, githubOutput, repository, runAttempt, runId, workflowName } =
    readDecisionEnv()
  const ctx = await buildWorkflowRunContext(
    {
      api: createGhApi(),
      streamLog: createGhLogStreamer(),
      limits: DEFAULT_LOG_LIMITS,
      repository,
      runId,
    },
    {
      conclusion,
      runAttempt,
      rules,
      workflowName,
    },
  )

  const result = await evaluateWorkflow(ctx, rules)

  console.log(`Workflow: ${workflowName}`)
  console.log(`Conclusion: ${conclusion}`)
  console.log(`Run attempt: ${runAttempt} (rule attempt: ${ctx.retryAttempt ?? runAttempt})`)
  console.log(`Failed jobs: ${ctx.failedJobNames.join(', ') || '(none)'}`)
  console.log(`Decision: ${result.decision}`)
  if (result.matchedRule) console.log(`Matched rule: ${result.matchedRule}`)

  if (githubOutput) appendFileSync(githubOutput, formatDecisionOutput(result))
}
