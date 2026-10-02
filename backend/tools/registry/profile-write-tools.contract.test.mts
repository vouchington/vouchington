import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { getProfile } from '@services/my/profile'
import { createProfileLink, listProfileLinks, MAX_PROFILE_LINKS } from '@services/my/profile-links'
import deleteMyProfileLinkTool from '../delete-my-profile-link.mts'
import reorderMyProfileLinksTool from '../reorder-my-profile-links.mts'
import updateMyProfileLinkTool from '../update-my-profile-link.mts'

const SCOPES = ['profile:read', 'profile:write'] as const

async function createCaller() {
  return { ...(await createTestUser()), membership_plan: 'plus' as const }
}

const names = async (userId: string) => (await listProfileLinks(userId)).map(link => link.name)

// Tool results are serialized, so Dates arrive as ISO strings.
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown
const order = (links: unknown) =>
  (links as { id: string; sort_order: number }[]).map(link => [link.id, link.sort_order])

describe('profile bio and link tools contract — real DB', () => {
  it('update_my_bio returns the profile the REST route returns and replaces the whole bio', async () => {
    const caller = await createCaller()
    const request = createRequest()
    await request.authenticateAs(caller)
    const rest = await request
      .patch('/api/v1/my/profile')
      .set('Content-Type', 'application/json')
      .send({ markdown: 'From REST' })
      .expect(200)

    const result = await callStructuredMcpTool(
      caller,
      'update_my_bio',
      { markdown: 'From the tool' },
      SCOPES,
    )

    expect(Object.keys(result.profile as object).toSorted()).toEqual(
      Object.keys(rest.body.profile).toSorted(),
    )
    expect(result.profile).toEqual({ id: caller.id, markdown: 'From the tool' })
    expect(await getProfile(caller.id)).toEqual(result.profile)

    await callStructuredMcpTool(caller, 'update_my_bio', { markdown: '' }, SCOPES)
    expect(await getProfile(caller.id)).toEqual({ id: caller.id, markdown: '' })
  })

  it.each([
    ['too long', { markdown: 'x'.repeat(10_001) }],
    ['not a string', { markdown: 7 }],
    ['missing', {}],
    ['carrying another user', { markdown: 'ok', user_id: crypto.randomUUID() }],
  ])('update_my_bio refuses a markdown argument that is %s and keeps the bio', async (_, args) => {
    const caller = await createCaller()
    await callStructuredMcpTool(caller, 'update_my_bio', { markdown: 'Kept' }, SCOPES)

    expect(await callRejectedMcpTool(caller, 'update_my_bio', args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
    expect(await getProfile(caller.id)).toMatchObject({ markdown: 'Kept' })
  })

  it('add_my_profile_link returns the link the REST route creates, after the existing links', async () => {
    const caller = await createCaller()
    const request = createRequest()
    await request.authenticateAs(caller)
    const rest = await request
      .post('/api/v1/my/profile/links')
      .set('Content-Type', 'application/json')
      .send({ link_type: 'url', url: 'https://example.com/rest', name: 'REST' })
      .expect(201)

    const url = await callStructuredMcpTool(
      caller,
      'add_my_profile_link',
      { link_type: 'url', url: 'https://example.com/tool', name: 'Site' },
      SCOPES,
    )
    const platform = await callStructuredMcpTool(
      caller,
      'add_my_profile_link',
      { link_type: 'github', handle: 'octo-cat', name: 'Code' },
      SCOPES,
    )

    expect(Object.keys(url.profile_link as object).toSorted()).toEqual(
      Object.keys(rest.body.profile_link).toSorted(),
    )
    expect(url.profile_link).toMatchObject({
      user_id: caller.id,
      link_type: 'url',
      url: 'https://example.com/tool',
      name: 'Site',
      handle: null,
      image_id: null,
    })
    expect(platform.profile_link).toMatchObject({ link_type: 'github', handle: 'octo-cat' })
    expect(await names(caller.id)).toEqual(['REST', 'Site', 'Code'])
  })

  it.each([
    ['a url link without a url', { link_type: 'url' }],
    ['a url that is not http', { link_type: 'url', url: 'ftp://example.com/x' }],
    ['a url with a fragment', { link_type: 'url', url: 'https://example.com/#frag' }],
    ['a handle with spaces', { link_type: 'github', handle: 'not valid' }],
  ])('add_my_profile_link refuses %s as the REST route does', async (_, args) => {
    const caller = await createCaller()

    await callRejectedMcpTool(caller, 'add_my_profile_link', args, SCOPES)

    expect(await listProfileLinks(caller.id)).toEqual([])
  })

  it.each([
    ['an unknown link type', { link_type: 'myspace' }],
    [
      'an image id',
      { link_type: 'url', url: 'https://example.com', image_id: crypto.randomUUID() },
    ],
    [
      'a name over 255 characters',
      { link_type: 'url', url: 'https://example.com', name: 'n'.repeat(256) },
    ],
    ['no link type', { url: 'https://example.com' }],
  ])('add_my_profile_link refuses %s before any change', async (_, args) => {
    const caller = await createCaller()

    expect(await callRejectedMcpTool(caller, 'add_my_profile_link', args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
    expect(await listProfileLinks(caller.id)).toEqual([])
  })

  it('add_my_profile_link refuses a link beyond the limit', async () => {
    const caller = await createCaller()
    for (let index = 0; index < MAX_PROFILE_LINKS; index++) {
      await createProfileLink(caller.id, { link_type: 'url', url: `https://example.com/${index}` })
    }

    await callRejectedMcpTool(
      caller,
      'add_my_profile_link',
      { link_type: 'url', url: 'https://example.com/over' },
      SCOPES,
    )

    expect(await listProfileLinks(caller.id)).toHaveLength(MAX_PROFILE_LINKS)
  })

  it('update_my_profile_link changes only the fields sent and clears one with null', async () => {
    const caller = await createCaller()
    const link = await createProfileLink(caller.id, {
      link_type: 'url',
      url: 'https://example.com/before',
      name: 'Before',
    })

    const renamed = await callStructuredMcpTool(
      caller,
      'update_my_profile_link',
      { link_id: link.id, name: 'After' },
      SCOPES,
    )
    const cleared = await callStructuredMcpTool(
      caller,
      'update_my_profile_link',
      { link_id: link.id, name: null, url: 'https://example.com/after' },
      SCOPES,
    )

    expect(renamed.profile_link).toMatchObject({ url: 'https://example.com/before', name: 'After' })
    expect(cleared.profile_link).toMatchObject({
      id: link.id,
      link_type: 'url',
      sort_order: link.sort_order,
      url: 'https://example.com/after',
      name: null,
    })
    expect(asJson(await listProfileLinks(caller.id))).toEqual([cleared.profile_link])
  })

  it('delete_my_profile_link removes the link, and deleting it again is not found', async () => {
    const caller = await createCaller()
    const link = await createProfileLink(caller.id, {
      link_type: 'url',
      url: 'https://example.com',
    })

    expect(
      await callStructuredMcpTool(caller, 'delete_my_profile_link', { link_id: link.id }, SCOPES),
    ).toEqual({ success: true })
    expect(await listProfileLinks(caller.id)).toEqual([])
    await expect(
      deleteMyProfileLinkTool.function(caller)({ link_id: link.id }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('reorder_my_profile_links returns the whole list in the new order, and repeats the same', async () => {
    const caller = await createCaller()
    const [first, second, third] = await Promise.all(
      ['one', 'two', 'three'].map(name =>
        createProfileLink(caller.id, {
          link_type: 'url',
          url: `https://example.com/${name}`,
          name,
        }),
      ),
    )
    const ids = [third!.id, first!.id, second!.id]

    const result = await callStructuredMcpTool(caller, 'reorder_my_profile_links', { ids }, SCOPES)
    const again = await callStructuredMcpTool(caller, 'reorder_my_profile_links', { ids }, SCOPES)

    expect((result.results as { id: string }[]).map(link => link.id)).toEqual(ids)
    expect(order(again.results)).toEqual(order(result.results))
    expect(order(await listProfileLinks(caller.id))).toEqual(order(result.results))
  })

  it.each([
    ['a partial list', (ids: string[]) => ids.slice(1)],
    ['an unknown id', (ids: string[]) => [...ids.slice(1), crypto.randomUUID()]],
  ])('reorder_my_profile_links refuses %s and keeps the order', async (_, change) => {
    const caller = await createCaller()
    const links = await Promise.all(
      ['a', 'b', 'c'].map(name =>
        createProfileLink(caller.id, {
          link_type: 'url',
          url: `https://example.com/${name}`,
          name,
        }),
      ),
    )
    const before = await names(caller.id)

    await callRejectedMcpTool(
      caller,
      'reorder_my_profile_links',
      { ids: change(links.map(link => link.id)) },
      SCOPES,
    )

    expect(await names(caller.id)).toEqual(before)
  })

  it('never lets one user change, delete or reorder another user’s links', async () => {
    const caller = await createCaller()
    const owner = await createTestUser()
    const link = await createProfileLink(owner.id, {
      link_type: 'url',
      url: 'https://example.com/owner',
      name: 'Owner',
    })

    await expect(
      updateMyProfileLinkTool.function(caller)({ link_id: link.id, name: 'Taken' }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      deleteMyProfileLinkTool.function(caller)({ link_id: link.id }),
    ).rejects.toMatchObject({ status: 404 })
    await createProfileLink(caller.id, { link_type: 'url', url: 'https://example.com' })
    const own = await listProfileLinks(caller.id)
    await expect(
      reorderMyProfileLinksTool.function(caller)({ ids: [link.id] }),
    ).rejects.toMatchObject({ status: 400 })
    expect(
      await callRejectedMcpTool(
        caller,
        'update_my_profile_link',
        { link_id: crypto.randomUUID(), name: 'Missing' },
        SCOPES,
      ),
    ).toContain('Profile link not found')

    expect(await listProfileLinks(owner.id)).toEqual([link])
    expect(await listProfileLinks(caller.id)).toEqual(own)
  })

  it.each([
    ['update_my_profile_link', { link_id: crypto.randomUUID() }],
    ['update_my_profile_link', { link_id: 'nope', name: 'x' }],
    ['delete_my_profile_link', { link_id: 'nope' }],
    ['reorder_my_profile_links', { ids: [] }],
    ['reorder_my_profile_links', { ids: ['nope'] }],
  ])('refuses invalid %s arguments before any change', async (name, args) => {
    const caller = await createCaller()

    expect(await callRejectedMcpTool(caller, name, args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
  })
})
