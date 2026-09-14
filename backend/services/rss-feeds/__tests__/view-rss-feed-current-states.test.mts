import { it, expect, describe } from 'vitest'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { updateRssFeedById } from '../update.mts'
import {
  queryRssFeedBaseState,
  queryRssFeedCurrentState,
  queryRssFeedCurrentStatesViewDefinition,
} from '@voucha/test-helpers/data-stores/psql/views/view-rss-feed-current-states'

describe('view-rss-feed-current-states', () => {
  it('view_rss_feed_current_states exposes the latest enablement and discoverability rows', async () => {
    const feed = await createTestRssFeed({})

    await updateRssFeedById(feed.id, { enabled: false, discoverable: false })
    await updateRssFeedById(feed.id, { enabled: true, discoverable: true })

    const state = await queryRssFeedCurrentState(feed.id)

    expect(state).toEqual({ is_enabled: true, is_discoverable: true })
  })

  it('projects denormalized base-table state without history lookups', async () => {
    const feed = await createTestRssFeed({})

    await updateRssFeedById(feed.id, { enabled: true, discoverable: false })

    const [baseState, viewState, viewDefinition] = await Promise.all([
      queryRssFeedBaseState(feed.id),
      queryRssFeedCurrentState(feed.id),
      queryRssFeedCurrentStatesViewDefinition(),
    ])

    expect(viewState).toEqual(baseState)
    expect(viewDefinition).not.toMatch(/LATERAL|rss_feed_(enablement|discoverability)_changes/i)
  })
})
