import { allowUnannotatedQuery } from '@vouchington/postgres'
import { write } from '../../backend/data-stores/psql/clients.mts'
import { beginTransaction } from '../../backend/data-stores/psql/index.mts'
import { refreshMaterializedView } from '../../backend/data-stores/psql/migrate.mts'
import { seedPlaywrightPublisherTypeTopics } from '../../backend/test-helpers/playwright-seed-publisher-type-topics.mts'

export async function linkTopicToReferralProgram(
  topicId: string,
  referralProgramTopicId: string,
): Promise<void> {
  await write(
    allowUnannotatedQuery('UPDATE topics SET referral_program_topic_id = $1 WHERE id = $2'),
    [referralProgramTopicId, topicId],
  )
}

export async function insertSemanticTopicLikeVote(userId: string, topicId: string): Promise<void> {
  await write(
    allowUnannotatedQuery(`INSERT INTO topic_votes (user_id, topic_id, score, score_is_semantic)
     VALUES ($1, $2, 1, TRUE)`),
    [userId, topicId],
  )
}

export async function seedPublisherTypeTopicsForPlaywright(): Promise<void> {
  await using transaction = await beginTransaction()
  await seedPlaywrightPublisherTypeTopics(transaction)
  await transaction.commit()
}

export async function refreshTopHashtagsMaterializedView(): Promise<void> {
  await refreshMaterializedView('mv_top_hashtags')
}
