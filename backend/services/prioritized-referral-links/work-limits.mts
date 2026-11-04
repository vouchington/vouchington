import createHttpError from 'http-errors'
import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  personalized_link_limit: 5,
  personalized_link_max_limit: 25,
  voted_post_max_age_days: 90,
}

/** Reading cost grows with the window, so the ceiling stays at one year. */
export const prioritizedReferralLinksWorkMaxValues = {
  personalized_link_limit: 25,
  personalized_link_max_limit: 25,
  voted_post_max_age_days: 365,
}

export const prioritizedReferralLinksWorkConfig = new DynamicConfig({
  key: 'prioritized-referral-links-work-config',
  fieldTypes: {
    personalized_link_limit: 'number',
    personalized_link_max_limit: 'number',
    voted_post_max_age_days: 'number',
  },
  defaultFields,
})

/** Only votes on posts newer than this many days count toward "rated positively". */
export function getVotedPostMaxAgeDays(): number {
  return getBoundedPositiveIntegerField(
    prioritizedReferralLinksWorkConfig,
    'voted_post_max_age_days',
    {
      defaultValue: defaultFields.voted_post_max_age_days,
      maxValue: prioritizedReferralLinksWorkMaxValues.voted_post_max_age_days,
    },
  )
}

/**
 * The most personalized links one request may ask for. It also sizes the cached out-of-network
 * list, so the cache can serve every page a request may ask for. A lower value applies at once
 * (each request clamps to it); a higher one reaches the cached list when the cache next refreshes.
 */
export function getPersonalizedLinkMaxLimit(): number {
  return getBoundedPositiveIntegerField(
    prioritizedReferralLinksWorkConfig,
    'personalized_link_max_limit',
    {
      defaultValue: defaultFields.personalized_link_max_limit,
      maxValue: prioritizedReferralLinksWorkMaxValues.personalized_link_max_limit,
    },
  )
}

/** The page size of a request that does not choose one, never above the maximum. */
export function getPersonalizedLinkLimit(): number {
  return Math.min(
    getBoundedPositiveIntegerField(prioritizedReferralLinksWorkConfig, 'personalized_link_limit', {
      defaultValue: defaultFields.personalized_link_limit,
      maxValue: prioritizedReferralLinksWorkMaxValues.personalized_link_limit,
    }),
    getPersonalizedLinkMaxLimit(),
  )
}

/**
 * The limit one request uses: the requested value (a positive integer, clamped to the maximum), or
 * the default. A value below 1 or not an integer is a 400, the same on REST and MCP. It caps the
 * page and every in-network subquery, so the reads cannot disagree on it.
 */
export function resolvePersonalizedLinkLimit(requested?: number): number {
  if (requested === undefined) return getPersonalizedLinkLimit()
  if (!Number.isInteger(requested) || requested < 1) throw createHttpError(400, 'Invalid limit')
  return Math.min(requested, getPersonalizedLinkMaxLimit())
}
