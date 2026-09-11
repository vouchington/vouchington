import { DynamicConfigValidationError } from './namespace.mts'
import { validatePositiveNumberFields } from './registry-validators.mts'
import type { DynamicConfigFields } from './types.mts'

export function validateRateLimitThresholdConfig(next: DynamicConfigFields): void {
  validatePositiveNumberFields(next)

  let hasPaidCapacityIncrease = false
  for (const category of ['read', 'write', 'sensitive'] as const) {
    for (let tier = 1; tier <= 5; tier += 1) {
      const previousKey = `${category}_tier${tier - 1}`
      const key = `${category}_tier${tier}`
      if ((next[previousKey] as number) <= (next[key] as number)) continue
      throw new DynamicConfigValidationError(
        `User rate-limit thresholds must not decrease: ${previousKey} <= ${key}`,
      )
    }
    for (let tier = 2; tier <= 5; tier += 1) {
      if (
        (next[`${category}_tier${tier - 1}`] as number) <
        (next[`${category}_tier${tier}`] as number)
      ) {
        hasPaidCapacityIncrease = true
      }
    }
  }
  if (hasPaidCapacityIncrease) return
  throw new DynamicConfigValidationError(
    'User rate-limit thresholds must increase for at least one paid trust tier',
  )
}

export function validateMembershipPlanLimits(
  next: DynamicConfigFields,
  fields: readonly [free: string, plus: string, pro: string],
): void {
  const [freeKey, plusKey, proKey] = fields
  const free = next[freeKey] as number
  const plus = next[plusKey] as number
  const pro = next[proKey] as number
  if (free < plus && plus < pro) return
  throw new DynamicConfigValidationError(
    `Membership limits must satisfy ${freeKey} < ${plusKey} < ${proKey}`,
  )
}
