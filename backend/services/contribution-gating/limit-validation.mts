import { getContributionLimitFieldNames } from './limits-config.mts'
import {
  contributionLimitActions,
  contributionPolicyActions,
  type ContributionLimitAction,
  type ContributionPolicyAction,
} from './limit-types.mts'
import { MAX_CONTRIBUTION_POLICY_WINDOW_SECONDS } from './admission-quota.mts'

type ContributionLimitConfigFields = Record<string, boolean | number | string>

export function validateContributionLimitConfig(
  next: ContributionLimitConfigFields,
  createValidationError: (message: string) => Error,
): void {
  for (const key of getContributionLimitFieldNames()) {
    const value = next[key]
    const minValue = key.endsWith('_window_seconds') ? 1 : -1
    if (!Number.isInteger(value) || (value as number) < minValue) {
      throw createValidationError(
        `Field ${key} must be an integer greater than or equal to ${minValue}`,
      )
    }
  }
  for (const action of contributionPolicyActions) {
    for (const window of ['short', 'daily'] as const) {
      validateAuthoredPolicy(next, action, window, createValidationError)
    }
  }
  validateLegacyPlanOrdering(next, createValidationError)
}

function validateLegacyPlanOrdering(
  next: ContributionLimitConfigFields,
  createValidationError: (message: string) => Error,
): void {
  let plusImprovesCapacity = false
  let proImprovesCapacity = false
  for (const action of contributionLimitActions) {
    if (action === 'article' || action === 'blog_post') continue
    for (const window of ['short', 'daily'] as const) {
      const improvements = validateLegacyPlanLimitOrder(next, action, window, createValidationError)
      plusImprovesCapacity ||= improvements.plus
      proImprovesCapacity ||= improvements.pro
    }
  }
  if (!plusImprovesCapacity || !proImprovesCapacity) {
    throw createValidationError(
      'Contribution capacity must improve from Free to Plus and from Plus to Pro',
    )
  }
}

function validateLegacyPlanLimitOrder(
  next: ContributionLimitConfigFields,
  action: ContributionLimitAction,
  window: 'short' | 'daily',
  createValidationError: (message: string) => Error,
): { plus: boolean; pro: boolean } {
  const freeKey = `${action}_free_${window}_limit`
  const plusKey = `${action}_plus_${window}_limit`
  const proKey = `${action}_pro_${window}_limit`
  const free = limitRank(next[freeKey] as number)
  const plus = limitRank(next[plusKey] as number)
  const pro = limitRank(next[proKey] as number)
  if (free > plus || plus > pro) {
    throw createValidationError(
      `Contribution limits must satisfy ${freeKey} <= ${plusKey} <= ${proKey}`,
    )
  }
  const freeWindow = next[`${action}_free_${window}_window_seconds`] as number
  const plusWindow = next[`${action}_plus_${window}_window_seconds`] as number
  const proWindow = next[`${action}_pro_${window}_window_seconds`] as number
  if (plus !== Number.POSITIVE_INFINITY && plusWindow > freeWindow) {
    throw createValidationError(
      `Contribution windows must not increase from Free to Plus: ${plusWindow} > ${freeWindow}`,
    )
  }
  if (pro !== Number.POSITIVE_INFINITY && proWindow > plusWindow) {
    throw createValidationError(
      `Contribution windows must not increase from Plus to Pro: ${proWindow} > ${plusWindow}`,
    )
  }
  return {
    plus: plus > free || (plus > 0 && plus !== Number.POSITIVE_INFINITY && plusWindow < freeWindow),
    pro: pro > plus || (pro > 0 && pro !== Number.POSITIVE_INFINITY && proWindow < plusWindow),
  }
}

function validateAuthoredPolicy(
  next: ContributionLimitConfigFields,
  action: ContributionPolicyAction,
  window: 'short' | 'daily',
  createValidationError: (message: string) => Error,
): void {
  const tiers = ['free', 'plus', 'pro', 'safety'] as const
  const limits = tiers.map(tier =>
    requiredPositive(next, `${action}_${tier}_${window}_limit`, createValidationError),
  )
  const windows = tiers.map(tier =>
    requiredPositive(next, `${action}_${tier}_${window}_window_seconds`, createValidationError),
  )
  if (limits[0]! > limits[1]! || limits[1]! > limits[2]! || limits[2]! > limits[3]!) {
    throw createValidationError(
      `Contribution limits must satisfy Free <= Plus <= Pro <= Safety for ${action} ${window}`,
    )
  }
  if (windows[1]! > windows[0]! || windows[2]! > windows[1]! || windows[3]! > windows[2]!) {
    throw createValidationError(
      `Contribution windows must narrow from Free through Safety for ${action} ${window}`,
    )
  }
  if (!strictlyBroadens(limits[0]!, windows[0]!, limits[1]!, windows[1]!)) {
    throw createValidationError(`Plus must strictly broaden Free capacity for ${action} ${window}`)
  }
  if (!strictlyBroadens(limits[1]!, windows[1]!, limits[2]!, windows[2]!)) {
    throw createValidationError(`Pro must strictly broaden Plus capacity for ${action} ${window}`)
  }
}

function requiredPositive(
  fields: ContributionLimitConfigFields,
  key: string,
  createValidationError: (message: string) => Error,
): number {
  const value = fields[key]
  if (!Number.isFinite(value) || !Number.isInteger(value) || (value as number) <= 0) {
    throw createValidationError(`Field ${key} must be a positive finite integer`)
  }
  if (key.endsWith('_window_seconds') && (value as number) > MAX_CONTRIBUTION_POLICY_WINDOW_SECONDS)
    throw createValidationError(
      `Field ${key} must not exceed ${MAX_CONTRIBUTION_POLICY_WINDOW_SECONDS} seconds`,
    )
  return value as number
}

function strictlyBroadens(
  lowerLimit: number,
  lowerWindow: number,
  higherLimit: number,
  higherWindow: number,
): boolean {
  return higherLimit > lowerLimit || (higherLimit === lowerLimit && higherWindow < lowerWindow)
}

function limitRank(limit: number): number {
  return limit === -1 ? Number.POSITIVE_INFINITY : limit
}
