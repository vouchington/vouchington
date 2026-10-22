import { beginTransaction, write } from '@data-stores/psql'
import { runRelationPublicationMutation } from '@services/entity-relations/publication-mutation'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedTopicId, seedUser } from '../run-support.mts'
import { lockTopicHostnameOwnership } from '@services/topics/hostname-ownership-lock'
import { seedUuid } from '../seed-data/common.mts'
import { addUrls } from '@services/urls/upsert'
import { createTopic } from '@services/topics/create'
import { addAdditionalHostname } from '@services/topics/additional-hostnames'
import { lockHostnameOwnership } from '@services/urls-hostnames/ownership-lock'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { SYSTEM_PROVENANCE } from '@voucha/types/entities/content-provenance'

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
  const { topicId, hostnameId } = await prepareOwnershipSnapshotFixture()
  registerScenarioContract('hostname-owner-topic-snapshot', {
    // One baseline relation plus this fixture's claim makes the tiny-table scan intentional.
    seededRows: { relation__topic__landing_page__url: 2 },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 3 },
      { kind: 'maxProcessedRows', relation: 'relation__topic__landing_page__url', max: 3 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 2 },
    ],
  })
  await runAndCapture(
    'hostname-owner-topic-snapshot',
    async () => {
      await using query = await beginTransaction()
      await lockTopicHostnameOwnership(query, [topicId], [hostnameId])
    },
    undefined,
    'getTopicHostnameOwnershipIds',
  )
}

async function prepareOwnershipSnapshotFixture() {
  const suffix = crypto.randomUUID()
  const urls = await addUrls(
    seedUser.id,
    ['primary', 'additional', 'landing'].map(kind => `https://${kind}-${suffix}.example.test/`),
    { skipCreatedEvents: true },
  )
  await using query = await beginTransaction()
  await lockHostnameOwnership(
    query,
    urls.map(url => url.hostname.id),
  )
  const topic = await createTopic(
    { ...seedUser, roles: ['administrator'] },
    SYSTEM_PROVENANCE,
    {
      name: 'EXPLAIN owned hostnames',
      slug: `explain-owner-${suffix}`,
      hostname: urls[0]!.hostname.id,
    },
    { query },
  )
  await addAdditionalHostname(topic.id, urls[1]!.hostname.hostname, seedUser.id, { query })
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'topic',
    objectType: 'url',
    predicate: 'landing_page',
  })
  await writeEntityRelations(
    relation,
    seedUser,
    [{ subject: topic, object: { id: urls[2]!.id } }],
    {
      query,
      skipBlockedHostnameGuard: true,
    },
  )
  // Replay uses another connection, so commit the representative ownership set first.
  await query.commit()
  await write(`/* explainHostnameOwnershipFixtureStats */
    ANALYZE topics, url_hostnames, urls, relation__topic__landing_page__url`)
  return { topicId: topic.id, hostnameId: urls[0]!.hostname.id }
}
