import { read } from '@data-stores/psql'
import { streamRelationVotes } from '../../../services/account-data-requests/stream-relation-votes.mts'
import { getRelationVoteCandidates } from '@services/users/get-relation-vote-candidates'
import { getEntityRelationElectionConfig } from '@services/elections-votes/entity-relation/config'
import { toEntityRelationElectionTable } from '@services/elections-votes/entity-relation/target'
import { fetchElectionVoteRowsByEntityId } from '@services/elections-votes/shared/vote-queries'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedRelationIdAfterPost, seedUuid } from '../seed-data/common.mts'

const voteParents = entityRelationMetadatum
  .filter(row => row.election)
  .map(row => `${row.table_name}__votes`)

export async function runRelationVoteReadScenarios() {
  const userId = seedUuid(3, '01')
  const userContract = {
    expectations: voteParents.map(relation => ({
      kind: 'maxProcessedRows' as const,
      relation,
      // Both plan modes read three owned events in this family, one in every other family.
      max: relation === 'relation__post__category__topic__votes' ? 4 : 2,
    })),
    crossPartition: Object.fromEntries(
      voteParents.map(parent => [
        parent,
        'User-owned event pages intentionally span relation-id ranges using local (user_id, id) indexes.',
      ]),
    ),
  }
  registerScenarioContract('relation-vote-export', userContract)
  await runAndCapture('relation-vote-export', async () => {
    for await (const row of streamRelationVotes(userId)) {
      if (row.entity_type !== 'entity_relation') throw new Error('Unexpected relation export row')
    }
  })
  registerScenarioContract('relation-vote-deletion-candidates', userContract)
  await runAndCapture('relation-vote-deletion-candidates', () =>
    getRelationVoteCandidates(read, userId, 25),
  )
  registerScenarioContract('relation-vote-history-by-entity', {
    expectations: [
      {
        kind: 'singleLeaf',
        parent: 'relation__post__category__topic__votes',
        key: 'entity_relation_id',
      },
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic__votes', max: 2 },
    ],
  })
  await runAndCapture('relation-vote-history-by-entity', () =>
    fetchElectionVoteRowsByEntityId(
      getEntityRelationElectionConfig(
        toEntityRelationElectionTable('relation__post__category__topic'),
      ),
      seedRelationIdAfterPost(0, 0),
      { limit: 25 },
    ),
  )
}
