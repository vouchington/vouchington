import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type PublicationReviewAction = 'approve' | 'reject' | 'unpublish' | 'restore'

export function recordPublicationReviewChange(
  query: TransactionQuery,
  input: {
    communityId: string
    postId: string
    actorUserId: string
    action: PublicationReviewAction
    platformOverride?: boolean
    reasonCode?: string
    privateNote?: string
  },
) {
  return write(
    sql`/* recordPublicationReviewChange */
      INSERT INTO community_post_review_changes (
        community_id, post_id, actor_user_id, action, platform_override, reason_code, private_note
      ) VALUES (
        ${input.communityId}, ${input.postId}, ${input.actorUserId}, ${input.action},
        ${input.platformOverride ?? false}, ${input.reasonCode ?? null}, ${input.privateNote ?? null}
      )`,
    { query },
  )
}
