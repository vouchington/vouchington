import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser, getUrlHostnameTopicId } from '@voucha/test-helpers'
import { getActiveLandingPageHostnameClaims } from '@voucha/test-helpers/hostname-ownership'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { getEntityRelations } from '@services/entity-relations/query'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { addUrl } from '@services/urls/upsert'
import '@voucha/test-helpers/entity-url-guard-registrations'
import { addAdditionalHostname } from './additional-hostnames.mts'
import { getTopicByAny } from './get.mts'
import { setTopicHostnameLink } from './hostname-link.mts'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'

const landing = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

describe('topic merge hostname ownership', () => {
  it.each(['primary', 'additional', 'landing'] as const)(
    'moves a source %s claim committed before admission',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const source = (await getTopicByAny((await createTestTopic({ user: admin })).id))!
      const destination = (await getTopicByAny((await createTestTopic({ user: admin })).id))!
      const hostname = `merge-${kind}-${crypto.randomUUID()}.example.com`
      const hostnameId = (await upsertUrlHostnames(admin.id, [hostname])).get(hostname)!
      const url = kind === 'landing' ? await addUrl(admin.id, `https://${hostname}/`) : null

      if (kind === 'primary') {
        await setTopicHostnameLink(source.id, hostnameId)
      } else if (kind === 'additional') {
        await addAdditionalHostname(source.id, hostname, admin.id)
      } else {
        await writeEntityRelations(landing, admin, [{ subject: source, object: { id: url!.id } }], {
          vote: false,
        })
      }
      await mergeTopicAliases(admin, source, destination)

      const owners =
        kind === 'landing'
          ? await getActiveLandingPageHostnameClaims([hostnameId])
          : [await getUrlHostnameTopicId(hostnameId)]
      expect(owners).toEqual([destination.id])
    },
  )

  it.each(['source', 'deleted destination'] as const)(
    'preserves a separate topic claim on the %s landing-page hostname',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const source = (await getTopicByAny((await createTestTopic({ user: admin })).id))!
      const destination = (await getTopicByAny((await createTestTopic({ user: admin })).id))!
      const claimant = await createTestTopic({ user: admin })
      const hostname = `merge-shared-${crypto.randomUUID()}.example.com`
      const url = (await addUrl(admin.id, `https://${hostname}/`))!
      const hostnameId = (await upsertUrlHostnames(admin.id, [hostname])).get(hostname)!
      const landingTopic = kind === 'source' ? source : destination
      await writeEntityRelations(
        landing,
        admin,
        [{ subject: landingTopic, object: { id: url.id } }],
        {
          vote: false,
        },
      )
      if (kind === 'deleted destination') {
        await softDeleteEntityRelation(admin, landing, landingTopic, [{ id: url.id }])
        // Merge restores the destination pair from the live source claim, preserving main's winner rules.
        await writeEntityRelations(landing, admin, [{ subject: source, object: { id: url.id } }], {
          vote: false,
        })
      }

      await addAdditionalHostname(claimant.id, hostname, admin.id)
      await mergeTopicAliases(admin, source, destination)
      expect(await getUrlHostnameTopicId(hostnameId)).toBe(claimant.id)
      expect(await getActiveLandingPageHostnameClaims([hostnameId])).toEqual([destination.id])
      const destinationRelations = await getEntityRelations(
        'topic',
        destination.id,
        'landing_page',
        'url',
        { viewer: { kind: 'anonymous' } },
      )
      expect(destinationRelations).toEqual([
        expect.objectContaining({
          object_id: url.id,
          deleted_at: null,
        }),
      ])
    },
  )
})
