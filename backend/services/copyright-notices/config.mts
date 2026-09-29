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
  },
  defaultFields: {
    automaticProvisionalWithholding: false,
    // 0 means unset: no review-target page until an operator records an approved target.
    reviewTargetMinutes: 0,
  },
})

/**
 * Whether a clear anti-spam screen of a signed-in notice may withhold its targets before a
 * moderator reviews it. Off keeps every notice in the staff queue until a moderator decides.
 */
export async function isAutomaticProvisionalWithholdingEnabled(): Promise<boolean> {
  await copyrightConfig.waitForInitialization()
  return copyrightConfig.getFields().automaticProvisionalWithholding === true
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
