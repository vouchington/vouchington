import {
  decide as decidePublished,
  type DecisionResult as PublishedDecisionResult,
  type EvaluateRulesOptions as PublishedEvaluateRulesOptions,
  type RetryContext,
  type RetryRule,
} from 'vouchington-tooling/transient-retry'

import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

export interface DecisionResult {
  decision: 'rerun' | 'ignore' | 'dispatch'
  matchedRule: string
}

interface EvaluateRulesOptions {
  afterRuleEvaluated?: (ctx: WorkflowRunContext, rule: TransientRetryRule) => Promise<void> | void
}

function mapRule(rule: TransientRetryRule, ctx: WorkflowRunContext): RetryRule {
  const match = () => rule.match(ctx)
  if (rule.decision === 'ignore') {
    return { id: rule.id, maxAttempts: rule.maxAttempts, decision: rule.decision, match }
  }
  return { id: rule.id, maxAttempts: rule.maxAttempts, match }
}

function mapContext(ctx: WorkflowRunContext): RetryContext {
  return {
    runAttempt: ctx.runAttempt,
    retryAttempt: ctx.ruleAttempt,
    retryAttempts: ctx.ruleAttempts,
  }
}

function mapPublishedResult(result: PublishedDecisionResult): DecisionResult {
  if (
    result.decision === 'rerun' ||
    result.decision === 'dispatch' ||
    result.decision === 'ignore'
  ) {
    return { decision: result.decision, matchedRule: result.matchedRule }
  }
  if (result.decision === 'no-match') {
    return { decision: 'dispatch', matchedRule: result.matchedRule }
  }
  throw new Error(`Unsupported published transient-retry decision: ${result.decision}`)
}

export async function decide(
  ctx: WorkflowRunContext,
  rules: TransientRetryRule[],
  options: EvaluateRulesOptions = {},
): Promise<DecisionResult> {
  const publishedOptions: PublishedEvaluateRulesOptions = {
    afterRuleEvaluated: options.afterRuleEvaluated
      ? async (_context, rule) => {
          const original = rules.find(candidate => candidate.id === rule.id)
          if (original) await options.afterRuleEvaluated?.(ctx, original)
        }
      : undefined,
  }
  const result = await decidePublished(
    mapContext(ctx),
    rules.map(rule => mapRule(rule, ctx)),
    publishedOptions,
  )
  return mapPublishedResult(result)
}
