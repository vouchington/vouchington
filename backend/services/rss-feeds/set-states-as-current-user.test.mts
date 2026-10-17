import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { getLatestDiscoverabilityChange, getLatestEnablementChange } from './discoverability.mts'
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
    const enablement = await getLatestEnablementChange(feed.id)
    const discoverability = await getLatestDiscoverabilityChange(feed.id)
    expect(enablement).toMatchObject({ is_enabled: false, changed_by_id: administrator.id })
    expect(discoverability).toMatchObject({ is_enabled: false, changed_by_id: administrator.id })

    await expect(
      setRssFeedStatesAsCurrentUser(administrator, feed.id, [
        { kind: 'enablement', is_enabled: false },
        { kind: 'discoverability', is_enabled: true },
      ]),
    ).resolves.toBe('updated')
    expect((await getLatestEnablementChange(feed.id))?.id).toBe(enablement?.id)
    expect(await getLatestDiscoverabilityChange(feed.id)).toMatchObject({ is_enabled: true })

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
    const before = await getLatestEnablementChange(feed.id)

    await expect(
      setRssFeedStatesAsCurrentUser(user, feed.id, [{ kind: 'enablement', is_enabled: false }]),
    ).rejects.toMatchObject({ status: 403 })
    expect((await getLatestEnablementChange(feed.id))?.id).toBe(before?.id)
  })

  it('rejects a reason that is too long without appending either kind', async () => {
    const feed = await createTestRssFeed({})
    const administrator = await createTestUser({ administrator: true })
    const before = await getLatestDiscoverabilityChange(feed.id)

    await expect(
      setRssFeedStatesAsCurrentUser(administrator, feed.id, [
        { kind: 'enablement', is_enabled: false },
        { kind: 'discoverability', is_enabled: false, reason: 'x'.repeat(1001) },
      ]),
    ).rejects.toMatchObject({ status: 400 })
    expect((await getLatestDiscoverabilityChange(feed.id))?.id).toBe(before?.id)
    expect(await getLatestEnablementChange(feed.id)).toMatchObject({ is_enabled: true })
  })

  it('does nothing when no kind is requested', async () => {
    const feed = await createTestRssFeed({})
    const administrator = await createTestUser({ administrator: true })

    await expect(setRssFeedStatesAsCurrentUser(administrator, feed.id, [])).resolves.toBe('noop')
  })
})
