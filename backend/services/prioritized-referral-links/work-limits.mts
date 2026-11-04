import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  personalized_link_limit: 5,
  voted_post_max_age_days: 90,
}

/** Reading cost grows with the window, so the ceiling stays at one year. */
export const prioritizedReferralLinksWorkMaxValues = {
  personalized_link_limit: 25,
  voted_post_max_age_days: 365,
}

export const prioritizedReferralLinksWorkConfig = new DynamicConfig({
  key: 'prioritized-referral-links-work-config',
  fieldTypes: { personalized_link_limit: 'number', voted_post_max_age_days: 'number' },
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
 * Total personalized links a viewer sees, and the limit of every subquery that feeds them
 * (in-network and out-of-network), so the reads cannot disagree on the number.
 */
export function getPersonalizedLinkLimit(): number {
  return getBoundedPositiveIntegerField(
    prioritizedReferralLinksWorkConfig,
    'personalized_link_limit',
    {
      defaultValue: defaultFields.personalized_link_limit,
      maxValue: prioritizedReferralLinksWorkMaxValues.personalized_link_limit,
    },
  )
}
