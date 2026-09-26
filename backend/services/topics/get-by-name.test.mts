import { describe, it, expect } from 'vitest'
import { getTopicByName, topicSlugExists } from './get-by-name.mts'
import { createTopic } from './create.mts'
import { createTestUser, createRandomString, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

function rand(): string {
  return createRandomString(8)
}

describe('topicSlugExists', () => {
  it('returns true for an existing topic slug', async () => {
    const admin = (await createTestUser({ administrator: true })) as PrivateUser
    const slug = `tse-${rand()}`
    await createTopic(WEB_PROVENANCE, admin, {
      name: `Slug Exists ${rand()}`,
      slug,
      topic_type: 'topic',
    })
    expect(await topicSlugExists(slug)).toBe(true)
  })

  it('returns false for a nonexistent slug', async () => {
    expect(await topicSlugExists(`nonexistent-${rand()}`)).toBe(false)
  })
})

describe('getTopicByName', () => {
  it('returns the matching topic row case-insensitively', async () => {
    const admin = (await createTestUser({ administrator: true })) as PrivateUser
    const name = `Get By Name ${rand()}`
    const slug = `gbn-${rand()}`
    const created = await createTopic(WEB_PROVENANCE, admin, { name, slug, topic_type: 'topic' })

    const row = await getTopicByName(name.toUpperCase())
    expect(row).not.toBeNull()
    expect(row).toMatchObject({ id: created.id, name, slug, topic_type: 'topic' })
  })

  it('returns null for an unknown name', async () => {
    expect(await getTopicByName(`Unknown Topic ${rand()}`)).toBeNull()
  })
})
