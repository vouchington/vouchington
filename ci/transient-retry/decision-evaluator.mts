import {
  decide as decidePublished,
  type DecisionResult as PublishedDecisionResult,
  type EvaluateRulesOptions as PublishedEvaluateRulesOptions,
  type RetryContext,
  type RetryRule,
  type RetryTarget,
} from 'vouchington-tooling/transient-retry'

import type { RerunTarget, TransientRetryRule, WorkflowRunContext } from './types.mts'

export interface DecisionResult {
  decision: 'rerun' | 'ignore' | 'dispatch'
  matchedRule: string
  rerunJobId?: number
}

interface EvaluateRulesOptions {
  afterRuleEvaluated?: (ctx: WorkflowRunContext, rule: TransientRetryRule) => Promise<void> | void
}

/** Sentinel target so published `decide()` can express a full-workflow rerun. */
const UNTARGETED_RERUN = '__untargeted-rerun__'

function mapRetryTarget(rerunTarget: RerunTarget, ctx: WorkflowRunContext): RetryTarget {
  if (rerunTarget.jobName !== undefined) return { targetName: rerunTarget.jobName }
  return {
    targetFamily: rerunTarget.jobNameFamily,
    resolveTargetName: () => rerunTarget.resolveJobName(ctx),
  }
}

function mapRule(rule: TransientRetryRule, ctx: WorkflowRunContext): RetryRule {
  const match = () => rule.match(ctx)
  if (rule.decision !== undefined && rule.decision !== 'rerun') {
    return {
      id: rule.id,
      maxAttempts: rule.maxAttempts,
      decision: rule.decision,
      match,
    }
  }
  if (rule.rerunTarget === undefined) {
    return {
      id: rule.id,
      maxAttempts: rule.maxAttempts,
      match,
      retryTarget: { targetName: UNTARGETED_RERUN },
    }
  }
  return {
    id: rule.id,
    maxAttempts: rule.maxAttempts,
    match,
    retryTarget: mapRetryTarget(rule.rerunTarget, ctx),
  }
}

function mapContext(ctx: WorkflowRunContext): RetryContext {
  const targetNames = new Set(ctx.jobNames ?? [])
  for (const name of ctx.jobIds?.keys() ?? []) targetNames.add(name)
  targetNames.add(UNTARGETED_RERUN)
  return {
    runAttempt: ctx.runAttempt,
    retryAttempt: ctx.ruleAttempt,
    retryAttempts: ctx.ruleAttempts,
    targetNames,
  }
}

function throwInvalidTarget(ruleId: string, detail: string): never {
  throw new Error(`Cannot target rerun for rule ${ruleId}: ${detail}`)
}

function mapPublishedResult(
  result: PublishedDecisionResult,
  ctx: WorkflowRunContext,
): DecisionResult {
  if (result.decision === 'rerun') {
    if (result.targetName === UNTARGETED_RERUN || result.targetName === '') {
      return { decision: 'rerun', matchedRule: result.matchedRule }
    }
    const rerunJobId = ctx.jobIds?.get(result.targetName)
    if (!Number.isSafeInteger(rerunJobId) || (rerunJobId ?? 0) <= 0) {
      throwInvalidTarget(result.matchedRule, `missing or invalid job id for ${result.targetName}`)
    }
    return { decision: 'rerun', matchedRule: result.matchedRule, rerunJobId }
  }
  if (result.decision === 'no-match') {
    if (result.reason === 'invalid-target' || result.reason === 'missing-target') {
      throwInvalidTarget(
        result.matchedRule,
        result.reason === 'missing-target'
          ? 'missing or invalid job id for unmatched target'
          : 'resolveJobName returned a name outside the declared family',
      )
    }
    return { decision: 'dispatch', matchedRule: result.matchedRule }
  }
  if (result.decision === 'dispatch' || result.decision === 'ignore') {
    return { decision: result.decision, matchedRule: result.matchedRule }
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
  return mapPublishedResult(result, ctx)
}
