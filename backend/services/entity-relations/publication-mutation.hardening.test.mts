import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser, updateUrlHostnameBlocked } from '@voucha/test-helpers'
import { getActiveLandingPageHostnameClaims } from '@voucha/test-helpers/hostname-ownership'
import { addUrl } from '../urls/upsert.mts'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { writeEntityRelations } from './write-relations.mts'
import { softDeleteEntityRelation, softDeleteEntityRelationsForSubjects } from './delete.mts'
import '@voucha/test-helpers/entity-url-guard-registrations'

const landing = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

describe('URL relation local policy', () => {
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
