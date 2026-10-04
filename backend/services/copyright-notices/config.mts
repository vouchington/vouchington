import { DynamicConfig } from '@data-stores/valkey'

/**
 * Audited operator switches for copyright handling. Each field ships with the code that reads it;
 * defaults keep launch moderator-first, so any automation must be switched on deliberately.
 */
export const copyrightConfig = new DynamicConfig({
  key: 'copyright',
  fieldTypes: {
    automaticProvisionalWithholding: 'boolean',
    reviewTargetMinutes: 'number',
    evidenceRetentionDeletion: 'boolean',
    evidenceRetentionDays: 'number',
    staydownMatching: 'boolean',
    trustedFlaggerPriority: 'boolean',
    automaticWithholdingMinTrustTier: 'number',
    automaticWithholdingMinAccountAgeDays: 'number',
    automaticWithholdingClaimantDailyCap: 'number',
    automaticWithholdingPosterDailyCap: 'number',
  },
  defaultFields: {
    automaticProvisionalWithholding: false,
    // 0 means unset: no review-target page until an operator records an approved target.
    reviewTargetMinutes: 0,
    evidenceRetentionDeletion: false,
    // 0 means unset: nothing is deleted until counsel approves a retention period, even when the
    // switch is on.
    evidenceRetentionDays: 0,
    staydownMatching: false,
    trustedFlaggerPriority: false,
    // -1 means unset: automatic withholding is refused until an operator approves every gate.
    automaticWithholdingMinTrustTier: -1,
    automaticWithholdingMinAccountAgeDays: -1,
    automaticWithholdingClaimantDailyCap: -1,
    automaticWithholdingPosterDailyCap: -1,
  },
})

export type AutomaticWithholdingThresholds = {
  minTrustTier: number
  minAccountAgeDays: number
  claimantDailyCap: number
  posterDailyCap: number
}

/**
 * Whether a clear anti-spam screen of a signed-in notice may withhold its targets before a
 * moderator reviews it. Off keeps every notice in the staff queue until a moderator decides.
 */
export async function isAutomaticProvisionalWithholdingEnabled(): Promise<boolean> {
  await copyrightConfig.waitForInitialization()
  return copyrightConfig.getFields().automaticProvisionalWithholding === true
}

/**
 * The operator-approved abuse gates that must pass before an automated assessment may withhold, or
 * null while any of them is unset (-1) or malformed. Null fails closed: nothing is withheld
 * automatically and the notice stays with a moderator. Zero is a real value.
 */
export async function getAutomaticWithholdingThresholds(): Promise<AutomaticWithholdingThresholds | null> {
  await copyrightConfig.waitForInitialization()
  const fields = copyrightConfig.getFields()
  const values = [
    fields.automaticWithholdingMinTrustTier,
    fields.automaticWithholdingMinAccountAgeDays,
    fields.automaticWithholdingClaimantDailyCap,
    fields.automaticWithholdingPosterDailyCap,
  ]
  if (!values.every(value => typeof value === 'number' && Number.isInteger(value) && value >= 0)) {
    return null
  }
  const [minTrustTier, minAccountAgeDays, claimantDailyCap, posterDailyCap] = values as number[]
  return { minTrustTier, minAccountAgeDays, claimantDailyCap, posterDailyCap }
}

/**
 * The operator-approved minutes a case may wait for a moderator before the review-target sweep
 * pages, or null while the target is unset (0).
 */
export async function getCopyrightReviewTargetMinutes(): Promise<number | null> {
  await copyrightConfig.waitForInitialization()
  const minutes = copyrightConfig.getFields().reviewTargetMinutes
  return typeof minutes === 'number' && minutes > 0 ? minutes : null
}

/** Whether the evidence retention-deletion sweep may run. Off by default; read the runbook first. */
export async function isCopyrightEvidenceRetentionDeletionEnabled(): Promise<boolean> {
  await copyrightConfig.waitForInitialization()
  return copyrightConfig.getFields().evidenceRetentionDeletion === true
}

/**
 * The counsel-approved days a case's evidence is kept after its last lifecycle event before the
 * retention sweep may delete it, or null while the period is unset (0).
 */
export async function getCopyrightEvidenceRetentionDays(): Promise<number | null> {
  await copyrightConfig.waitForInitialization()
  const days = copyrightConfig.getFields().evidenceRetentionDays
  return typeof days === 'number' && Number.isInteger(days) && days > 0 ? days : null
}

/**
 * Whether media a moderator confirmed as infringing is hashed into the staydown registry, and
 * whether new uploads are matched against it. Off by default: DSM Article 17(4)(b)-(c) staydown
 * binds only an online content-sharing service provider, which counsel must decide Voucha is.
 */
export async function isCopyrightStaydownMatchingEnabled(): Promise<boolean> {
  await copyrightConfig.waitForInitialization()
  return copyrightConfig.getFields().staydownMatching === true
}

/** Receipt-time matches exist regardless; priority remains disabled until explicitly enabled. */
export async function isCopyrightTrustedFlaggerPriorityEnabled(): Promise<boolean> {
  await copyrightConfig.waitForInitialization()
  return copyrightConfig.getFields().trustedFlaggerPriority === true
}
