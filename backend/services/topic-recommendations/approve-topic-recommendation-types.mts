import { createTopic } from '@services/topics/create'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'

export type TopicRecommendationApprovalTransactionResult = {
  topic: Awaited<ReturnType<typeof createTopic>>
  aliases: string[]
  topic_markdown: string | null
  relations: EntityRelation[]
  urlIds: string[]
  topic_type: 'topic' | 'referral_program' | 'card'
}
