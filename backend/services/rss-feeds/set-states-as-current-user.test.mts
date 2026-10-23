import { describe, expect, it } from 'vitest'
import { createTestUser, getLatestTestRssFeedStateChange } from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { setRssFeedDiscoverabilityAsSystem } from './discoverability.mts'
import { setRssFeedStatesAsCurrentUser } from './set-states-as-current-user.mts'

describe('setRssFeedStatesAsCurrentUser', () => {
  it('appends every changed kind together and leaves an unchanged kind alone', async () => {
    const feed = await createTestRssFeed({})
    const administrator = await createTestUser({ administrator: true })

    await expect(
      setRssFeedStatesAsCurrentUser(administrator, feed.id, [
        { kind: 'enablement', is_enabled: false, reason: 'test: both' },
        { kind: 'discoverability', is_enabled: false, reason: 'test: both' },
      ]),
    ).resolves.toBe('updated')
    const enablement = await getLatestTestRssFeedStateChange('enablement', feed.id)
    const discoverability = await getLatestTestRssFeedStateChange('discoverability', feed.id)
    expect(enablement).toMatchObject({ is_enabled: false, changed_by_id: administrator.id })
    expect(discoverability).toMatchObject({ is_enabled: false, changed_by_id: administrator.id })

    await expect(
      setRssFeedStatesAsCurrentUser(administrator, feed.id, [
        { kind: 'enablement', is_enabled: false },
        { kind: 'discoverability', is_enabled: true },
      ]),
    ).resolves.toBe('updated')
    expect((await getLatestTestRssFeedStateChange('enablement', feed.id))?.id).toBe(enablement?.id)
    expect(await getLatestTestRssFeedStateChange('discoverability', feed.id)).toMatchObject({
      is_enabled: true,
    })

    await expect(
      setRssFeedStatesAsCurrentUser(administrator, feed.id, [
        { kind: 'enablement', is_enabled: false },
        { kind: 'discoverability', is_enabled: true },
      ]),
    ).resolves.toBe('noop')
  })

  it('refuses a caller who cannot change a kind before it writes anything', async () => {
    const feed = await createTestRssFeed({})
    const user = await createTestUser()
    const before = await getLatestTestRssFeedStateChange('enablement', feed.id)

    await expect(
      setRssFeedStatesAsCurrentUser(user, feed.id, [{ kind: 'enablement', is_enabled: false }]),
    ).rejects.toMatchObject({ status: 403 })
    expect((await getLatestTestRssFeedStateChange('enablement', feed.id))?.id).toBe(before?.id)
  })

  it('keeps a human discoverability decision until a system override is explicit', async () => {
    const feed = await createTestRssFeed({})
    const administrator = await createTestUser({ administrator: true })
    await setRssFeedStatesAsCurrentUser(administrator, feed.id, [
      { kind: 'discoverability', is_enabled: false },
    ])
    const humanChange = await getLatestTestRssFeedStateChange('discoverability', feed.id)
    expect(humanChange).toMatchObject({
      is_enabled: false,
      changed_by_id: administrator.id,
    })

    await expect(
      setRssFeedDiscoverabilityAsSystem({ rssFeedId: feed.id, is_enabled: true }),
    ).resolves.toBe('skipped:human-locked')
    expect((await getLatestTestRssFeedStateChange('discoverability', feed.id))?.id).toBe(
      humanChange?.id,
    )

    await expect(
      setRssFeedDiscoverabilityAsSystem({
        rssFeedId: feed.id,
        is_enabled: true,
        overrideHumanLock: true,
      }),
    ).resolves.toBe('updated')
    expect(await getLatestTestRssFeedStateChange('discoverability', feed.id)).toMatchObject({
      is_enabled: true,
    })
  })

  it('rejects a reason that is too long without appending either kind', async () => {
    const feed = await createTestRssFeed({})
    const administrator = await createTestUser({ administrator: true })
    const before = await getLatestTestRssFeedStateChange('discoverability', feed.id)

    await expect(
      setRssFeedStatesAsCurrentUser(administrator, feed.id, [
        { kind: 'enablement', is_enabled: false },
        { kind: 'discoverability', is_enabled: false, reason: 'x'.repeat(1001) },
      ]),
    ).rejects.toMatchObject({ status: 400 })
    expect((await getLatestTestRssFeedStateChange('discoverability', feed.id))?.id).toBe(before?.id)
    expect(await getLatestTestRssFeedStateChange('enablement', feed.id)).toMatchObject({
      is_enabled: true,
    })
  })

  it('does nothing when no kind is requested', async () => {
    const feed = await createTestRssFeed({})
    const administrator = await createTestUser({ administrator: true })

    await expect(setRssFeedStatesAsCurrentUser(administrator, feed.id, [])).resolves.toBe('noop')
  })
})
