import { getRelatablePostIds } from '@services/entity-relations/post-access'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedPostId, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runRelatablePostAccessScenario(): Promise<void> {
  registerScenarioContract('relatable-post-access-batch', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 10 }],
  })
  await runAndCapture(
    'relatable-post-access-batch',
    async () => {
      const result = await getRelatablePostIds(
        { kind: 'user', userId: seedUser.id, staffRole: null },
        {
          subjectIds: [seedPostId, seedUuid(1, '05')],
          objectIds: [seedPostId, seedUuid(2, '05')],
        },
      )
      if (!result.subjectIds.has(seedPostId) || !result.objectIds.has(seedPostId))
        throw new Error('Both roles must retain the seeded public post')
    },
    undefined,
    'getRelatablePostIds',
  )
}
