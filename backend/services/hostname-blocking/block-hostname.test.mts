import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestUser,
  createTestUserDirect,
  insertTestPost,
  insertTestPostBatch,
  insertTestPostRelatedUrlBatch,
  insertTestUrlDirect,
  insertTestUrlHostname,
  getTestPenaltiesByHostnameId,
  getTestHostnameRow,
  getTestRelationDeletedAt,
  createEntityRelationWithElection,
  getTestPostPublicationDirtyWorkForScope,
  listTestPostPublicationImpactPostIds,
  countTestPostPublicationDirtyWorkForPostsWithReason,
} from '@voucha/test-helpers'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { stubUrlGuardsForSuite } from '@services/entity-relations/test-support'
import type { PrivateUser } from '@voucha/types/entities/user'
import { blockHostname } from './block-hostname.mts'
import { DEFAULT_PENALTY_MULTIPLIER } from '@services/vote-integrity/config'

describe('block-hostname', () => {
  stubUrlGuardsForSuite()

  const rand = () => randomBytes(6).toString('hex')

  function randomHostname() {
    return `block-test-${rand()}.example.com`
  }

  let admin: PrivateUser

  beforeAll(async () => {
    admin = (await createTestUser({ administrator: true })) as PrivateUser
  }, 60_000)

  /** Link a post to a URL via the post->related->url entity relation */
  async function relatePostToUrl(creator: PrivateUser, postId: string, urlId: string) {
    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'url' && m.predicate === 'related',
    )!
    await upsertEntityRelation(creator, metadata, { id: postId }, [{ id: urlId }])
  }

  describe('blockHostname', () => {
    it('throws 404 for a non-existent hostname', async () => {
      await expect(blockHostname(admin.id, uuidv7())).rejects.toMatchObject({ status: 404 })
    }, 60_000)

    it('sets blocked=true, blocked_at, blocked_by_id on the target hostname', async () => {
      const hostname = randomHostname()
      const hostnameId = await insertTestUrlHostname({ hostname, blocked: false })

      await blockHostname(admin.id, hostnameId)

      const row = await getTestHostnameRow(hostnameId)
      expect(row).toBeDefined()
      expect(row!.blocked).toBe(true)
      expect(row!.blocked_at).toBeInstanceOf(Date)
      expect(row!.blocked_by_id).toBe(admin.id)
    }, 60_000)

    it('also blocks subdomains of the target hostname', async () => {
      const base = `subdomain-base-${rand()}.example.com`
      const sub1 = `www.${base}`
      const sub2 = `cdn.${base}`

      const [baseId, sub1Id, sub2Id] = await Promise.all([
        insertTestUrlHostname({ hostname: base }),
        insertTestUrlHostname({ hostname: sub1 }),
        insertTestUrlHostname({ hostname: sub2 }),
      ])

      await blockHostname(admin.id, baseId)

      const [baseRow, sub1Row, sub2Row] = await Promise.all([
        getTestHostnameRow(baseId),
        getTestHostnameRow(sub1Id),
        getTestHostnameRow(sub2Id),
      ])
      expect(baseRow!.blocked).toBe(true)
      expect(sub1Row!.blocked).toBe(true)
      expect(sub2Row!.blocked).toBe(true)
    }, 60_000)

    it('returns correct blocked_hostname_count including subdomains', async () => {
      const base = `count-test-${rand()}.example.com`
      const sub = `api.${base}`

      const [baseId] = await Promise.all([
        insertTestUrlHostname({ hostname: base }),
        insertTestUrlHostname({ hostname: sub }),
      ])

      const result = await blockHostname(admin.id, baseId)
      expect(result.blocked_hostname_count).toBeGreaterThanOrEqual(2)
    }, 60_000)

    it('soft-deletes post->related->url entity relations for the blocked hostname', async () => {
      const hostname = randomHostname()
      const hostnameId = await insertTestUrlHostname({ hostname, crawlable: false })

      const creator = (await createTestUserDirect({
        username: `bh-creator-${rand()}`,
      })) as PrivateUser
      const postId = await insertTestPost({
        title: `Block Hostname Test ${rand()}`,
        slug: `bh-test-${rand()}`,
        createdById: creator.id,
        markdown: 'test',
      })

      // Add a URL under the hostname and link the post to it
      const urlStr = `https://${hostname}/page`
      const urlObj = await insertTestUrlDirect(creator.id, urlStr)
      expect(urlObj).toBeDefined()

      // We need to bypass the blocked-hostname check since the hostname is not yet blocked
      await relatePostToUrl(creator, postId, urlObj!.id)

      // Relation should not be deleted yet
      expect(await getTestRelationDeletedAt(postId, urlObj!.id)).toBeNull()

      const result = await blockHostname(admin.id, hostnameId)
      expect(result.soft_deleted_relation_count).toBeGreaterThanOrEqual(1)

      // Relation should now be soft-deleted
      expect(await getTestRelationDeletedAt(postId, urlObj!.id)).toBeInstanceOf(Date)
    }, 60_000)

    it('captures affected posts when blocking a hostname and its subdomains', async () => {
      const hostname = randomHostname()
      const subdomain = `news.${hostname}`
      const [hostnameId] = await Promise.all([
        insertTestUrlHostname({ hostname, crawlable: false }),
        insertTestUrlHostname({ hostname: subdomain, crawlable: false }),
      ])
      const creator = (await createTestUserDirect({
        username: `bh-capture-${rand()}`,
      })) as PrivateUser
      const postIds = await Promise.all(
        ['target', 'subdomain'].map(suffix =>
          insertTestPost({
            title: `Hostname capture ${suffix} ${rand()}`,
            slug: `bh-capture-${suffix}-${rand()}`,
            createdById: creator.id,
            markdown: 'test',
          }),
        ),
      )
      const [targetUrl, subdomainUrl] = await Promise.all([
        insertTestUrlDirect(creator.id, `https://${hostname}/captured`),
        insertTestUrlDirect(creator.id, `https://${subdomain}/captured`),
      ])
      await Promise.all([
        createEntityRelationWithElection(postIds[0]!, targetUrl!.id, creator.id, 1),
        createEntityRelationWithElection(postIds[1]!, subdomainUrl!.id, creator.id, 1),
      ])
      await expect(
        Promise.all(
          postIds.map(id => getTestPostPublicationDirtyWorkForScope({ type: 'post', id })),
        ),
      ).resolves.toEqual([undefined, undefined])

      await blockHostname(admin.id, hostnameId)

      for (const postId of postIds) {
        const dirtyWork = await getTestPostPublicationDirtyWorkForScope({
          type: 'post',
          id: postId,
        })
        expect(dirtyWork).toBeDefined()
        expect(dirtyWork!.reasons).toContain('post_related_urls_changed')
        await expect(listTestPostPublicationImpactPostIds(dirtyWork!.id)).resolves.toEqual([postId])
      }
    }, 60_000)

    it('captures every affected post across bounded hostname relation batches', async () => {
      const hostname = randomHostname()
      const hostnameId = await insertTestUrlHostname({ hostname, crawlable: false })
      const creator = (await createTestUserDirect({
        username: `bh-batch-${rand()}`,
      })) as PrivateUser
      const postIds = await insertTestPostBatch(creator.id, 501)
      const urlIds = postIds.map(() => uuidv7())
      await insertTestPostRelatedUrlBatch({
        postIds,
        urlIds,
        hostname,
        hostnameId,
        createdById: creator.id,
      })

      const result = await blockHostname(admin.id, hostnameId)

      expect(result.soft_deleted_relation_count).toBe(501)
      await expect(
        countTestPostPublicationDirtyWorkForPostsWithReason(postIds, 'post_related_urls_changed'),
      ).resolves.toBe(501)
    }, 60_000)

    it('applies a 20% vote weight penalty to users who created the relations', async () => {
      const hostname = randomHostname()
      const hostnameId = await insertTestUrlHostname({ hostname, crawlable: false })

      const creator = (await createTestUserDirect({
        username: `bh-penalize-${rand()}`,
      })) as PrivateUser
      const postId = await insertTestPost({
        title: `Penalty Test ${rand()}`,
        slug: `penalty-${rand()}`,
        createdById: creator.id,
        markdown: 'test',
      })
      const urlStr = `https://${hostname}/penalize`
      const urlObj = await insertTestUrlDirect(creator.id, urlStr)
      await relatePostToUrl(creator, postId, urlObj!.id)

      const result = await blockHostname(admin.id, hostnameId)
      expect(result.penalized_user_count).toBe(1)

      const penalties = await getTestPenaltiesByHostnameId(hostnameId)
      expect(penalties).toHaveLength(1)
      expect(penalties[0]!.user_id).toBe(creator.id)
      expect(penalties[0]!.penalty_multiplier).toBe(DEFAULT_PENALTY_MULTIPLIER)
      expect(penalties[0]!.reason).toBe('blocked_hostname')
      expect(penalties[0]!.revoked_at).toBeNull()
    }, 60_000)

    it('is idempotent: re-blocking does not create duplicate penalties', async () => {
      const hostname = randomHostname()
      const hostnameId = await insertTestUrlHostname({ hostname, crawlable: false })

      const creator = (await createTestUserDirect({ username: `bh-idem-${rand()}` })) as PrivateUser
      const postId = await insertTestPost({
        title: `Idempotent Test ${rand()}`,
        slug: `idem-${rand()}`,
        createdById: creator.id,
        markdown: 'test',
      })
      const urlStr = `https://${hostname}/idempotent`
      const urlObj = await insertTestUrlDirect(creator.id, urlStr)
      await relatePostToUrl(creator, postId, urlObj!.id)

      // Block twice — second call should not create duplicate penalties
      await blockHostname(admin.id, hostnameId)
      const result2 = await blockHostname(admin.id, hostnameId)

      expect(result2.penalized_user_count).toBe(0)

      const penalties = await getTestPenaltiesByHostnameId(hostnameId)
      const userPenalties = penalties.filter(p => p.user_id === creator.id)
      expect(userPenalties).toHaveLength(1)
    }, 60_000)
  })
})
