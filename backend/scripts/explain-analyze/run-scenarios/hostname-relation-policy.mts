import { beginTransaction } from '@data-stores/psql'
import { runRelationPublicationMutation } from '@services/entity-relations/publication-mutation'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedTopicId, seedHostnameIds } from '../run-support.mts'
import { lockTopicHostnameOwnership } from '@services/topics/hostname-ownership-lock'
import { seedUuid } from '../seed-data/common.mts'

export async function runHostnameRelationPolicyScenario(): Promise<void> {
  registerScenarioContract('hostname-owner-relation-policy', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'url_hostnames', max: 3 }],
  })
  await runAndCapture(
    'hostname-owner-relation-policy',
    async () => {
      await using query = await beginTransaction()
      await runRelationPublicationMutation(
        { query },
        'relation__topic__landing_page__url',
        'activate',
        [seedTopicId],
        [seedUuid(0, '03'), seedUuid(1, '03')],
        [],
        async () => [],
      ).catch((err: unknown) => {
        if ((err as { status?: number }).status !== 422) throw err
      })
    },
    undefined,
    'getLocalHostnamePolicies',
  )
}

export async function runHostnameOwnershipSnapshotScenario(): Promise<void> {
  registerScenarioContract('hostname-owner-topic-snapshot', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 2 },
      { kind: 'maxProcessedRows', relation: 'relation__topic__landing_page__url', max: 0 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 0 },
    ],
  })
  await runAndCapture(
    'hostname-owner-topic-snapshot',
    async () => {
      await using query = await beginTransaction()
      await lockTopicHostnameOwnership(query, [seedTopicId], [seedHostnameIds[0]!])
    },
    undefined,
    'getTopicHostnameOwnershipIds',
  )
}
