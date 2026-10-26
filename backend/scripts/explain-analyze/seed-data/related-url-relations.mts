import { beginTransaction } from '@data-stores/psql'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation'
import { updateEntityRelationElectionVoteStatsFromPrimaryBatch } from '@services/elections-votes/entity-relation/vote-stats-batch'
import { seedRelationIdAfterPost, seedUuid } from './common.mts'

export const RELATED_URL_RELATION_NOISE_COUNT = 10_000

// Related-post reads require positive scores, while hostname cleanup needs enough active rows to
// establish an object-side index page. The unvoted noise serves the latter without changing the
// former's result set.
export async function seedRelatedUrlPostRelations(): Promise<void> {
  console.log('Seeding post->url relations for reads and hostname cleanup plans...')

  const votedRelations = [
    { postIndex: 20, relationIndex: 0, urlId: seedUuid(0, '03') },
    { postIndex: 21, relationIndex: 1, urlId: seedUuid(2500, '03') },
  ] as const
  const voterId = seedUuid(2, '01')
  const noise = Array.from({ length: RELATED_URL_RELATION_NOISE_COUNT }, (_, relationIndex) => {
    const postIndex = 30_000 + relationIndex
    return {
      id: seedRelationIdAfterPost(postIndex, 10_000 + relationIndex),
      postId: seedUuid(postIndex, '05'),
      urlId: seedUuid(relationIndex % 2500, '03'),
      creatorId: seedUuid(relationIndex % 20_000, '01'),
    }
  })
  const votedRelationIds = votedRelations.map(({ postIndex, relationIndex }) =>
    seedRelationIdAfterPost(postIndex, relationIndex),
  )

  await using transaction = await beginTransaction()
  const query = transaction
  await query(
    `/* seedExplainData */ INSERT INTO relation__post__related__url
       (id, subject_id, object_id, created_by_id)
     SELECT id, post_id, url_id, creator_id
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[])
       AS noise(id, post_id, url_id, creator_id)
     ON CONFLICT DO NOTHING`,
    [
      noise.map(row => row.id),
      noise.map(row => row.postId),
      noise.map(row => row.urlId),
      noise.map(row => row.creatorId),
    ],
  )
  await query(
    `/* seedExplainData */ INSERT INTO relation__post__related__url
       (id, subject_id, object_id, created_by_id)
     SELECT id, post_id, url_id, $4
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS voted(id, post_id, url_id)
     ON CONFLICT DO NOTHING`,
    [
      votedRelationIds,
      votedRelations.map(row => seedUuid(row.postIndex, '05')),
      votedRelations.map(row => row.urlId),
      voterId,
    ],
  )
  await query(
    `/* seedExplainData */ INSERT INTO relation__post__related__url__votes
       (user_id, subject_id, entity_relation_id, score)
     SELECT $1, post_id, relation_id, 1
     FROM unnest($2::uuid[], $3::uuid[]) AS voted(post_id, relation_id)`,
    [voterId, votedRelations.map(row => seedUuid(row.postIndex, '05')), votedRelationIds],
  )
  await transaction.commit()

  await updateEntityRelationElectionVoteStatsFromPrimaryBatch(
    votedRelationIds.map(relationId =>
      createEntityRelationElectionTarget(relationId, 'relation__post__related__url'),
    ),
  )
}
