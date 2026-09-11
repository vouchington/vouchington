import { topic } from './data.mts'

const individualId = '00000000-0000-7000-8000-000000000720'
export const firstValuationId = '00000000-0000-7000-8000-000000000721'
export const secondValuationId = '00000000-0000-7000-8000-000000000722'
export const thirdValuationId = '00000000-0000-7000-8000-000000000723'
export const firstRewardsProgramId = '00000000-0000-7000-8000-000000000731'
export const secondRewardsProgramId = '00000000-0000-7000-8000-000000000732'
export const thirdRewardsProgramId = '00000000-0000-7000-8000-000000000733'
export const pointValuationCursorScope = `my-point-valuations:${individualId}:id-asc`
export const pointValuationMigratedFrom = [
  'docs/requirements/users/USER_SETTINGS.md',
  'web/components/my/point-valuations-manager.tsx',
]

export const firstPointValuation = {
  id: firstValuationId,
  rewards_program_id: firstRewardsProgramId,
  value_per_point: { amount: 35_000, currency: 'usd', scale: 6 },
  note: 'Use for flexible travel redemptions',
  rewards_program: {
    id: firstRewardsProgramId,
    name: 'Travel Rewards',
    slug: 'travel-rewards',
  },
}

export const secondPointValuation = {
  id: secondValuationId,
  rewards_program_id: secondRewardsProgramId,
  value_per_point: { amount: 0, currency: 'usd', scale: 6 },
  note: null,
  rewards_program: {
    id: secondRewardsProgramId,
    name: 'Hotel Points',
    slug: 'hotel-points',
  },
}

export const thirdPointValuation = {
  id: thirdValuationId,
  rewards_program_id: thirdRewardsProgramId,
  value_per_point: { amount: 22_500, currency: 'usd', scale: 6 },
  note: 'Preferred airline transfer value',
  rewards_program: {
    id: thirdRewardsProgramId,
    name: 'Airline Miles',
    slug: 'airline-miles',
  },
}

export const rewardsProgramTopic = {
  ...topic,
  id: firstRewardsProgramId,
  name: firstPointValuation.rewards_program.name,
  slug: firstPointValuation.rewards_program.slug,
  topic_type: 'rewards_program',
}
