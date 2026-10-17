import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestUser } from '@voucha/test-helpers'
import {
  createProfileLink,
  listProfileLinks,
  reorderProfileLinks,
  updateProfileLink,
} from './profile-links.mts'

describe('createProfileLink', () => {
  it('rejects URL fragments because profile links are stored through the urls table', async () => {
    await expect(
      createProfileLink('00000000-0000-7000-8000-000000000000', {
        link_type: 'url',
        url: 'https://example.com/#/invite',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'url must be a valid URL without a fragment',
    })
  })

  it('rejects URL fragments on update because profile links are stored through the urls table', async () => {
    await expect(
      updateProfileLink(
        '00000000-0000-7000-8000-000000000000',
        '00000000-0000-7000-8000-000000000001',
        {
          url: 'https://example.com/#/invite',
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'url must be a valid URL without a fragment',
    })
  })

  it('rejects unsupported URL schemes with a scheme-specific message', async () => {
    await expect(
      createProfileLink('00000000-0000-7000-8000-000000000000', {
        link_type: 'url',
        url: 'ftp://example.com/invite',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'url must use http or https',
    })
  })
})

describe('reorderProfileLinks', () => {
  it('does not update any link when the requested set is invalid', async () => {
    const user = await createTestUser()
    const first = await createProfileLink(user.id, { link_type: 'github', handle: 'first' })
    const second = await createProfileLink(user.id, { link_type: 'twitter', handle: 'second' })
    const invalidId = randomUUID()

    await expect(reorderProfileLinks(user.id, [second.id, invalidId])).rejects.toMatchObject({
      status: 400,
      message: `Link ${invalidId} not found`,
    })
    const links = await listProfileLinks(user.id)
    expect(links.map(link => [link.id, link.sort_order])).toEqual([
      [first.id, 0],
      [second.id, 1],
    ])
  })

  it('rejects valid UUID spellings that do not exactly match stored ids before updating', async () => {
    const user = await createTestUser()
    const first = await createProfileLink(user.id, { link_type: 'github', handle: 'first' })
    const second = await createProfileLink(user.id, { link_type: 'twitter', handle: 'second' })
    const alternateSpellings = [first.id.toUpperCase(), `{${first.id}}`]

    for (const alternateId of alternateSpellings) {
      await expect(reorderProfileLinks(user.id, [second.id, alternateId])).rejects.toMatchObject({
        status: 400,
        message: `Link ${alternateId} not found`,
      })
      const links = await listProfileLinks(user.id)
      expect(links.map(link => [link.id, link.sort_order])).toEqual([
        [first.id, 0],
        [second.id, 1],
      ])
    }
  })

  it('checks the requested count before reporting a malformed id', async () => {
    const user = await createTestUser()
    const first = await createProfileLink(user.id, { link_type: 'github', handle: 'first' })
    const second = await createProfileLink(user.id, { link_type: 'twitter', handle: 'second' })

    await expect(reorderProfileLinks(user.id, ['not-a-uuid'])).rejects.toMatchObject({
      status: 400,
      message: 'All profile links must be included in the reorder',
    })
    const links = await listProfileLinks(user.id)
    expect(links.map(link => [link.id, link.sort_order])).toEqual([
      [first.id, 0],
      [second.id, 1],
    ])
  })
})
