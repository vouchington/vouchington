import { appendFileSync } from 'node:fs'

import { decide, type DecisionResult } from './decision-evaluator.mts'
import { readDecisionEnv } from './env.mts'
import { buildWorkflowRunContext } from './run-context.mts'
import { RULES } from './rules.mts'

export type { DecisionResult } from './decision-evaluator.mts'
export { decide }

export function formatDecisionOutput(result: DecisionResult): string {
  return `decision=${result.decision}\nmatched_rule=${result.matchedRule}\n`
}

if (import.meta.main) {
  const { conclusion, githubOutput, repository, runAttempt, runId, workflowName } =
    readDecisionEnv()
  const ctx = await buildWorkflowRunContext({
    conclusion,
    repository,
    runAttempt,
    runId,
    rules: RULES,
    workflowName,
  })

  const result = await decide(ctx, RULES)

  console.log(`Workflow: ${workflowName}`)
  console.log(`Conclusion: ${conclusion}`)
  console.log(`Run attempt: ${runAttempt} (rule attempt: ${ctx.ruleAttempt ?? runAttempt})`)
  console.log(`Failed jobs: ${ctx.failedJobNames.join(', ') || '(none)'}`)
  console.log(`Decision: ${result.decision}`)
  if (result.matchedRule) console.log(`Matched rule: ${result.matchedRule}`)

  if (githubOutput) appendFileSync(githubOutput, formatDecisionOutput(result))
}
