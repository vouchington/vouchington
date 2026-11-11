import { beginTransaction } from '@data-stores/psql'
import { runRelationPublicationMutation } from '@services/entity-relations/publication-mutation'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { deleteUrlRelationPage } from '@services/hostname-blocking/delete-url-relation-page'
import {
  RELATED_URL_RELATION_DELETED_FANOUT_COUNT,
  RELATED_URL_RELATION_NOISE_COUNT,
} from '../seed-data/related-url-relations.mts'

export async function runHostnameRelationPolicyScenario(): Promise<void> {
  registerScenarioContract('hostname-owner-relation-policy', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'url_hostnames', max: 5 }],
  })
  await runAndCapture(
    'hostname-owner-relation-policy',
    async () => {
      await using query = await beginTransaction()
      await runRelationPublicationMutation(
        { query },
        'relation__topic__landing_page__url',
        'activate',
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

export async function runHostnameBlockRelationCleanupScenario(): Promise<void> {
  registerScenarioContract('hostname-block-post-url-relation-page', {
    seededRows: {
      relation__post__related__url:
        RELATED_URL_RELATION_NOISE_COUNT + RELATED_URL_RELATION_DELETED_FANOUT_COUNT + 2,
    },
    expectations: [
      {
        kind: 'usesIndexes',
        // PostgreSQL plans against the attached default-partition child of
        // idx_relation__post__related__url__active_reverse.
        indexes: ['relation__post__related__url__default_object_id_subject_id_idx1'],
      },
      { kind: 'maxProcessedRows', relation: 'relation__post__related__url', max: 64 },
      { kind: 'queryBinds', token: 'LIMIT' },
    ],
  })
  await runAndCapture(
    'hostname-block-post-url-relation-page',
    async () => {
      await using query = await beginTransaction()
      await deleteUrlRelationPage(
        query,
        'relation__post__related__url',
        [seedUuid(0, '03')],
        undefined,
        seedUser.id,
        25,
      )
    },
    undefined,
    'deleteUrlRelationPage:findPosts',
  )
}
