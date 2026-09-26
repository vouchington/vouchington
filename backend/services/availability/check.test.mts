import { describe, it, expect } from 'vitest'
import { checkAvailability, MAX_VALUE_LENGTH } from './check.mts'
import {
  createTestUser,
  createRandomString,
  insertTestPost,
  safeUsername,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createTopic } from '@services/topics/create'
import { createTopicAliases } from '@services/topics/aliases'
import { createCommunity } from '@services/communities/create'
import type { PrivateUser } from '@services/users/types'

const SAMPLE_UUID = '0192f1a0-0000-7000-8000-000000000000'

function randomSlug(prefix?: string): string {
  const suffix = createRandomString(8)
  return prefix ? `${prefix}-${suffix}` : suffix
}

describe('checkAvailability', () => {
  describe('topic-slug', () => {
    it('returns available for a new slug', async () => {
      const result = await checkAvailability('topic-slug', `nonexistent-${randomSlug()}`)
      expect(result.available).toBe(true)
      expect(result.conflict).toBeNull()
    })

    it('returns taken with conflict for existing slug', async () => {
      const admin = (await createTestUser({ administrator: true })) as PrivateUser
      const topic = await createTopic(WEB_PROVENANCE, admin, {
        name: `Test Topic ${randomSlug()}`,
        slug: `ts-${randomSlug()}`,
        topic_type: 'topic',
      })
      const result = await checkAvailability('topic-slug', topic.slug)
      expect(result.available).toBe(false)
      expect(result.conflict?.kind).toBe('topic')
      expect((result.conflict as { slug?: string } | null)?.slug).toBe(topic.slug)
    })

    it('returns taken when the slug matches an existing topic alias', async () => {
      const admin = (await createTestUser({ administrator: true })) as PrivateUser
      const topic = await createTopic(WEB_PROVENANCE, admin, {
        name: `Aliased Topic ${randomSlug()}`,
        slug: `at-${randomSlug()}`,
        topic_type: 'topic',
      })
      const alias = `alias-${randomSlug()}`
      await createTopicAliases(topic.id, alias)
      const result = await checkAvailability('topic-slug', alias)
      expect(result.available).toBe(false)
      expect(result.conflict?.kind).toBe('topic')
      expect((result.conflict as { id?: string } | null)?.id).toBe(topic.id)
    })
  })

  describe('topic-name', () => {
    it('returns available for an unused name', async () => {
      const result = await checkAvailability('topic-name', `Nonexistent Name ${randomSlug()}`)
      expect(result.available).toBe(true)
    })

    it('returns taken with conflict for existing name (case-insensitive)', async () => {
      const admin = (await createTestUser({ administrator: true })) as PrivateUser
      const name = `Test Name ${randomSlug()}`
      await createTopic(WEB_PROVENANCE, admin, {
        name,
        slug: `tn-${randomSlug()}`,
        topic_type: 'topic',
      })
      const result = await checkAvailability('topic-name', name.toUpperCase())
      expect(result.available).toBe(false)
      expect(result.conflict?.kind).toBe('topic')
    })

    it('treats a name over the 255-char DB limit as available', async () => {
      // 256 chars: exceeds the topics.name CHECK constraint but is within MAX_VALUE_LENGTH.
      const longName = 'a'.repeat(256)
      const result = await checkAvailability('topic-name', longName)
      expect(result.available).toBe(true)
      expect(result.conflict).toBeNull()
    })
  })

  describe('input validation', () => {
    it('throws 422 when the value is empty', async () => {
      await expect(checkAvailability('topic-slug', '   ')).rejects.toMatchObject({ status: 422 })
    })

    it('throws 422 when the value exceeds MAX_VALUE_LENGTH', async () => {
      await expect(
        checkAvailability('topic-slug', 'a'.repeat(MAX_VALUE_LENGTH + 1)),
      ).rejects.toMatchObject({ status: 422 })
    })
  })

  describe('community-slug', () => {
    it('returns available for a new slug', async () => {
      const result = await checkAvailability('community-slug', `nonexistent-${randomSlug()}`)
      expect(result.available).toBe(true)
    })

    it('returns taken with conflict for an existing public community slug', async () => {
      const user = (await createTestUser()) as PrivateUser
      const community = await createCommunity(WEB_PROVENANCE, user.id, {
        name: `Test Community ${randomSlug()}`,
        slug: `tc-${randomSlug()}`,
        visibility: 'public',
      })
      const result = await checkAvailability('community-slug', community.slug)
      expect(result.available).toBe(false)
      expect(result.conflict).toMatchObject({
        kind: 'community',
        id: community.id,
        slug: community.slug,
        name: community.name,
      })
    })

    it('returns taken without conflict for an existing private community slug', async () => {
      const user = (await createTestUser()) as PrivateUser
      const community = await createCommunity(WEB_PROVENANCE, user.id, {
        name: `Private Community ${randomSlug()}`,
        slug: `pc-${randomSlug()}`,
        visibility: 'private',
      })
      const result = await checkAvailability('community-slug', community.slug)
      expect(result.available).toBe(false)
      // Private community existence is not disclosed: no conflict link.
      expect(result.conflict).toBeNull()
    })
  })

  describe('post-slug', () => {
    it('returns available for a new slug', async () => {
      const result = await checkAvailability('post-slug', `nonexistent-${randomSlug()}`)
      expect(result.available).toBe(true)
      expect(result.conflict).toBeNull()
    })

    it('returns available for a UUID-shaped value (createPostSlug rejects UUID slugs)', async () => {
      const result = await checkAvailability('post-slug', SAMPLE_UUID)
      expect(result.available).toBe(true)
      expect(result.conflict).toBeNull()
    })

    it('returns taken with post conflict for an existing slug', async () => {
      const user = (await createTestUser()) as PrivateUser
      const slug = `ps-${randomSlug()}`
      const title = `Test Post ${randomSlug()}`
      const postId = await insertTestPost({
        title,
        slug,
        createdById: user.id,
        markdown: 'body',
      })
      const result = await checkAvailability('post-slug', slug)
      expect(result.available).toBe(false)
      expect(result.conflict).toMatchObject({
        kind: 'post',
        id: postId,
        slug,
        title,
      })
      expect((result.conflict as { post_type?: string } | null)?.post_type).toBeTruthy()
    })
  })

  describe('username', () => {
    it('returns available for unused username', async () => {
      const result = await checkAvailability('username', safeUsername('unused-user'))
      expect(result.available).toBe(true)
    })

    it('returns taken without conflict link for existing username', async () => {
      const username = safeUsername('u')
      await createTestUser({ username })
      const result = await checkAvailability('username', username)
      expect(result.available).toBe(false)
      expect(result.conflict).toBeNull()
    })

    it('treats a malformed username as available without a DB lookup', async () => {
      const result = await checkAvailability('username', 'not a valid username!!')
      expect(result.available).toBe(true)
      expect(result.conflict).toBeNull()
    })
  })

  describe('non-slug inputs short-circuit to available', () => {
    it('topic-slug with a non-slug value', async () => {
      const result = await checkAvailability('topic-slug', 'Not A Slug!')
      expect(result.available).toBe(true)
      expect(result.conflict).toBeNull()
    })

    it('community-slug with a non-slug value', async () => {
      const result = await checkAvailability('community-slug', 'Not A Slug!')
      expect(result.available).toBe(true)
      expect(result.conflict).toBeNull()
    })

    it('post-slug with a non-slug value', async () => {
      const result = await checkAvailability('post-slug', 'Not A Slug!')
      expect(result.available).toBe(true)
      expect(result.conflict).toBeNull()
    })
  })

  it('throws 422 for an unknown kind', async () => {
    await expect(
      checkAvailability('bogus-kind' as Parameters<typeof checkAvailability>[0], 'value'),
    ).rejects.toMatchObject({ status: 422 })
  })
})
