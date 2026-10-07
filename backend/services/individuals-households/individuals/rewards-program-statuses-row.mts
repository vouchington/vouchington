import type { IndividualRewardsProgramStatus } from './rewards-program-statuses-types.mts'

export type RewardsProgramStatusRow = Omit<
  IndividualRewardsProgramStatus,
  'rewards_program_status'
> & {
  rewards_program_status_name: string
  rewards_program_status_slug: string
}

export function toRewardsProgramStatus(
  row: RewardsProgramStatusRow,
): IndividualRewardsProgramStatus {
  return {
    id: row.id,
    rewards_program_status_topic_id: row.rewards_program_status_topic_id,
    started_on: row.started_on,
    expires_on: row.expires_on,
    rewards_program_status: {
      id: row.rewards_program_status_topic_id,
      name: row.rewards_program_status_name,
      slug: row.rewards_program_status_slug,
    },
  }
}
