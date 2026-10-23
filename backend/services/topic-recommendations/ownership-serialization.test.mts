import { beforeEach, describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getTestPostgresBackendProcessId,
  getUrlHostnameTopicId,
  waitForTestPostgresLockWaiter,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { TopicRecommendationPost } from './types.mts'
import { createTopicRecommendation } from './create-topic-recommendation.mts'
import { approveTopicRecommendationInTransaction } from './approve-topic-recommendation.mts'
import {
  addAdditionalHostname,
  removeAdditionalHostname,
} from '@services/topics/additional-hostnames'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { addUrl } from '@services/urls/upsert'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { getEntityRelations } from '@services/entity-relations/query'
import { linkHostnameToSourceTopic, setTopicHostnameLink } from '@services/topics/hostname-link'
import { getTopicByAny } from '@services/topics/get'
import '@voucha/test-helpers/entity-url-guard-registrations'

const landing = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

describe('hostname ownership serialization against approval', () => {
  let admin: PrivateUser
  let recommendation: TopicRecommendationPost
  let hostname: string
  let hostnameId: string
  let urlId: string
  let otherTopic: Awaited<ReturnType<typeof createTestTopic>>

  beforeEach(async () => {
    admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    hostname = `serialize-${suffix}.example.com`
    recommendation = await createTopicRecommendation(admin, WEB_PROVENANCE, {
      markdown: 'Hostname serialization',
      topic_title: `Serialize ${suffix}`,
      topic_slug: `serialize-${suffix}`,
      topic_hostnames: [hostname],
    })
    hostnameId = (await getUrlHostnameByAny(hostname))!.id
    urlId = (await addUrl(admin.id, `https://${hostname}/`))!.id
    otherTopic = await createTestTopic({ user: admin })
  })

  it.each(['add', 'remove'] as const)(
    'serializes additional-hostname %s and preserves coexistence',
    async operation => {
      if (operation === 'remove') await addAdditionalHostname(otherTopic.id, hostname, admin.id)
      await using holder = await beginTransaction()
      const approved = await approveTopicRecommendationInTransaction(
        admin,
        WEB_PROVENANCE,
        recommendation.id,
        { query: holder },
      )
      const pid = await getTestPostgresBackendProcessId(holder)
      await using waiter = await beginTransaction()
      const pending =
        operation === 'add'
          ? addAdditionalHostname(otherTopic.id, hostname, admin.id, { query: waiter })
          : removeAdditionalHostname(otherTopic.id, hostnameId, { query: waiter })
      const settled = pending.then(
        () => null,
        (err: unknown) => err,
      )
      try {
        await waitForTestPostgresLockWaiter(pid, 'lockHostnameOwnership')
      } finally {
        await holder.commit()
      }
      expect(await settled).toBeNull()
      await waiter.commit()
      expect(await getUrlHostnameTopicId(hostnameId)).toBe(
        operation === 'add' ? otherTopic.id : null,
      )
      const relations = await getEntityRelations(
        'topic',
        approved.topic.id,
        'landing_page',
        'url',
        { viewer: { kind: 'system' } },
      )
      expect(relations.map(row => row.object_id)).toContain(urlId)
    },
  )

  it.each(['primary', 'source'] as const)(
    'serializes %s linking and preserves coexistence',
    async kind => {
      await using holder = await beginTransaction()
      const approved = await approveTopicRecommendationInTransaction(
        admin,
        WEB_PROVENANCE,
        recommendation.id,
        { query: holder },
      )
      const pid = await getTestPostgresBackendProcessId(holder)
      const link = kind === 'primary' ? setTopicHostnameLink : linkHostnameToSourceTopic
      const pending = link(otherTopic.id, hostnameId).then(
        () => null,
        (err: unknown) => err,
      )
      try {
        await waitForTestPostgresLockWaiter(pid, 'lockHostnameOwnership')
      } finally {
        await holder.commit()
      }
      expect(await pending).toBeNull()
      expect((await getTopicByAny(otherTopic.id))?.hostname_id).toBe(hostnameId)
      expect(await getUrlHostnameTopicId(hostnameId)).toBe(
        kind === 'primary' ? otherTopic.id : null,
      )
      expect(
        (
          await getEntityRelations('topic', approved.topic.id, 'landing_page', 'url', {
            viewer: { kind: 'system' },
          })
        ).map(row => row.object_id),
      ).toContain(urlId)
    },
  )

  it('serializes existing-id public promotion without changing the landing-page claim', async () => {
    await using holder = await beginTransaction()
    const approved = await approveTopicRecommendationInTransaction(
      admin,
      WEB_PROVENANCE,
      recommendation.id,
      { query: holder },
    )
    const pid = await getTestPostgresBackendProcessId(holder)
    const pending = upsertUrlHostnames(admin.id, [hostname]).then(
      value => ({ value }),
      (err: unknown) => ({ error: err }),
    )
    try {
      await waitForTestPostgresLockWaiter(pid, 'lockHostnameOwnership')
    } finally {
      await holder.commit()
    }
    expect(await pending).toEqual({ value: new Map([[hostname, hostnameId]]) })
    expect((await getUrlHostnameByAny(hostname))?.publicly_introduced_at).toBeInstanceOf(Date)
    expect(
      (
        await getEntityRelations('topic', approved.topic.id, 'landing_page', 'url', {
          viewer: { kind: 'system' },
        })
      ).map(row => row.object_id),
    ).toContain(urlId)
  })

  it.each(['insert', 'reactivate', 'delete'] as const)(
    'serializes landing-page %s through its owning boundary',
    async operation => {
      if (operation === 'reactivate') {
        await writeEntityRelations(
          landing,
          admin,
          [{ subject: otherTopic, object: { id: urlId } }],
          { vote: false },
        )
        await softDeleteEntityRelation(admin, landing, otherTopic, [{ id: urlId }])
      }
      await using holder = await beginTransaction()
      const approved = await approveTopicRecommendationInTransaction(
        admin,
        WEB_PROVENANCE,
        recommendation.id,
        { query: holder },
      )
      const pid = await getTestPostgresBackendProcessId(holder)
      const subject = operation === 'delete' ? approved.topic : otherTopic
      const pending = (
        operation === 'delete'
          ? softDeleteEntityRelation(admin, landing, subject, [{ id: urlId }])
          : writeEntityRelations(landing, admin, [{ subject, object: { id: urlId } }], {
              vote: false,
            })
      ).then(
        () => null,
        (err: unknown) => err,
      )
      try {
        await waitForTestPostgresLockWaiter(pid, 'lockHostnameOwnership')
      } finally {
        await holder.commit()
      }
      expect(await pending).toBeNull()
      const relations = await getEntityRelations('topic', subject.id, 'landing_page', 'url', {
        viewer: { kind: 'system' },
      })
      expect(relations.some(row => row.object_id === urlId)).toBe(operation !== 'delete')
    },
  )
})
