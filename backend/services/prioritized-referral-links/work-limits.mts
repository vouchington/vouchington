import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  recent_vote_window_days: 90,
}

/** Reading cost grows with the window, so the ceiling stays at one year. */
export const prioritizedReferralLinksWorkMaxValues = {
  recent_vote_window_days: 365,
}

export const prioritizedReferralLinksWorkConfig = new DynamicConfig({
  key: 'prioritized-referral-links-work-config',
  fieldTypes: { recent_vote_window_days: 'number' },
  defaultFields,
})

/** Only votes on posts newer than this many days count toward "rated positively". */
export function getRecentVoteWindowDays(): number {
  return getBoundedPositiveIntegerField(
    prioritizedReferralLinksWorkConfig,
    'recent_vote_window_days',
    {
      defaultValue: defaultFields.recent_vote_window_days,
      maxValue: prioritizedReferralLinksWorkMaxValues.recent_vote_window_days,
    },
  )
}
