import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getEntityRelation,
  getTestPostgresBackendProcessId,
  insertTestPost,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getActiveLandingPageHostnameClaims } from '@voucha/test-helpers/hostname-ownership'
import { blockHostnameInTransaction } from '../hostname-blocking/block-hostname.mts'
import { upsertUrlHostnames } from '../urls-hostnames/upsert.mts'
import { addUrl } from '../urls/upsert.mts'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { upsertEntityRelation } from './upsert.mts'
import { writeEntityRelations } from './write-relations.mts'
import { softDeleteEntityRelation, softDeleteEntityRelationsForSubjects } from './delete.mts'
import '@voucha/test-helpers/entity-url-guard-registrations'

const landing = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})
const postRelatedUrl = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  objectType: 'url',
  predicate: 'related',
})

describe('URL relation local policy after ownership waits', () => {
  it.each(['upsert', 'write'] as const)(
    'rejects a generic %s after a parent block commits during its ownership wait',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const topic = await createTestTopic({ user: admin })
      const parent = `claim-policy-${crypto.randomUUID()}.test`
      const parentId = (await upsertUrlHostnames(admin.id, [parent])).get(parent)!
      const url = (await addUrl(admin.id, `https://blog.${parent}/`))!
      await using holder = await beginTransaction()
      await blockHostnameInTransaction(admin.id, parentId, holder, { penalizeCreators: false })
      const pid = await getTestPostgresBackendProcessId(holder)
      const claiming = await withTestOwnedPostgresWait(
        {
          holderProcessId: pid,
          pool: 'write',
          lock: { kind: 'advisory', key: parentId.toLowerCase() },
          queryMarker: 'lockHostnameOwnership',
          releaseHolder: () => holder[Symbol.asyncDispose](),
        },
        async waitForLock => {
          const claim =
            kind === 'upsert'
              ? upsertEntityRelation(admin, landing, topic, [{ id: url.id }])
              : writeEntityRelations(landing, admin, [{ subject: topic, object: { id: url.id } }])
          await waitForLock(claim)
          await holder.commit()
          return claim.then(
            () => null,
            (err: unknown) => err,
          )
        },
      )
      expect(claiming).toMatchObject({ status: 422, message: 'URL hostname is blocked' })
      expect(await getActiveLandingPageHostnameClaims([url.hostname.id])).toEqual([])
    },
  )

  it.each(['single', 'subjects'] as const)(
    'allows %s deletion of a blocked landing-page claim',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const topic = await createTestTopic({ user: admin })
      const url = (await addUrl(admin.id, `https://claim-delete-${crypto.randomUUID()}.test/`))!
      await writeEntityRelations(landing, admin, [{ subject: topic, object: { id: url.id } }])
      await updateUrlHostnameBlocked(url.hostname.id, true)
      if (kind === 'single') await softDeleteEntityRelation(admin, landing, topic, [{ id: url.id }])
      else await softDeleteEntityRelationsForSubjects(admin, landing, [topic], { id: url.id })
      expect(await getActiveLandingPageHostnameClaims([url.hostname.id])).toEqual([])
    },
  )

  it('rejects a post URL relation after a parent block commits during its ownership wait', async () => {
    const administrator = await createTestUser({ administrator: true })
    const parent = `post-policy-${crypto.randomUUID()}.test`
    const parentId = (await upsertUrlHostnames(administrator.id, [parent])).get(parent)!
    const url = (await addUrl(administrator.id, `https://blog.${parent}/`))!
    const postId = await insertTestPost({
      title: `Post policy ${crypto.randomUUID()}`,
      slug: `post-policy-${crypto.randomUUID()}`,
      createdById: administrator.id,
      markdown: 'test',
    })
    await using holder = await beginTransaction()
    await blockHostnameInTransaction(administrator.id, parentId, holder, {
      penalizeCreators: false,
    })
    const pid = await getTestPostgresBackendProcessId(holder)
    const relating = await withTestOwnedPostgresWait(
      {
        holderProcessId: pid,
        pool: 'write',
        lock: { kind: 'advisory', key: parentId.toLowerCase() },
        queryMarker: 'lockHostnameOwnership',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const relation = upsertEntityRelation(administrator, postRelatedUrl, { id: postId }, [
          { id: url.id },
        ])
        await waitForLock(relation)
        await holder.commit()
        return relation.then(
          () => null,
          (err: unknown) => err,
        )
      },
    )

    expect(relating).toMatchObject({ status: 422, message: 'URL hostname is blocked' })
    await expect(getEntityRelation(postRelatedUrl.table_name, postId, url.id)).resolves.toEqual([])
  })
})
