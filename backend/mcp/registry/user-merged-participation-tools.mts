import { createMergedTool } from '../create-merged-tool.mts'
import read_my_review_disputes_list from '../list-my-review-disputes.mts'
import read_my_review_disputes_get from '../get-my-review-dispute.mts'
import read_my_moderation_appeals_list from '../list-my-moderation-appeals.mts'
import read_my_moderation_appeals_get from '../get-my-moderation-appeal.mts'
export const userMergedParticipationGroups = [
  {
    name: 'read_my_review_disputes',
    options: [
      { option: 'list', source: read_my_review_disputes_list },
      { option: 'get', source: read_my_review_disputes_get },
    ],
  },
  {
    name: 'read_my_moderation_appeals',
    options: [
      { option: 'list', source: read_my_moderation_appeals_list },
      { option: 'get', source: read_my_moderation_appeals_get },
    ],
  },
] as const
export const userMergedParticipationTools = userMergedParticipationGroups.map(group =>
  createMergedTool(
    group.name,
    group.name
      .split('_')
      .map(word => word[0]!.toUpperCase() + word.slice(1))
      .join(' '),
    group.options,
  ),
)
