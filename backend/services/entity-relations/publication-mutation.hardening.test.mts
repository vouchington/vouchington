import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
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

describe('landing-page local policy after ownership waits', () => {
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
      const claiming = (
        kind === 'upsert'
          ? upsertEntityRelation(admin, landing, topic, [{ id: url.id }])
          : writeEntityRelations(landing, admin, [{ subject: topic, object: { id: url.id } }])
      ).then(
        () => null,
        (err: unknown) => err,
      )
      try {
        await waitForTestPostgresLockWaiter(pid, 'lockHostnameOwnership')
      } finally {
        await holder.commit()
      }
      expect(await claiming).toMatchObject({ status: 422, message: 'URL hostname is blocked' })
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
})
