import onError, { onSuccess } from '@/lib/on-error'
import { deleteRssFeed, getRssFeedCrawls, refreshRssFeed, updateRssFeed } from '@/lib/api/client'
import { fetchRssFeeds } from '@/lib/api/client/topics'
import type { ManageSourceState, ManageSourceRssFeed } from './manage-source-model'

type Action = Partial<ManageSourceState>

export function useSourceActions(
  id: string,
  state: ManageSourceState,
  dispatch: (action: Action) => void,
) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!state.rssFeed) return
    dispatch({ saving: true })
    try {
      const formData = new FormData(e.currentTarget)
      const titleRaw = formData.get('title')
      const title = typeof titleRaw === 'string' ? titleRaw.trim() || null : null
      const urlRaw = formData.get('rss_feed_url')
      const rss_feed_url = typeof urlRaw === 'string' ? urlRaw.trim() : ''
      const result = await updateRssFeed(state.rssFeed.id, {
        title,
        rss_feed_url,
        topic_id: id,
      })
      dispatch({ rssFeed: result.rss_feed as ManageSourceRssFeed })
      onSuccess('Source updated')
    } catch (error) {
      onError(error, { fallback: 'Failed to save source', tags: { form: 'admin-topic-source' } })
    } finally {
      dispatch({ saving: false })
    }
  }

  return {
    handleDelete: () => handleDelete(state, dispatch),
    handleRefresh: () => handleRefresh(id, state, dispatch),
    handleSubmit,
    handleToggle: () => handleToggle(state, dispatch),
    handleToggleDiscoverability: () => handleToggleDiscoverability(state, dispatch),
  }
}

async function handleToggle(state: ManageSourceState, dispatch: (action: Action) => void) {
  if (!state.rssFeed) return
  dispatch({ toggling: true })
  try {
    const result = await updateRssFeed(state.rssFeed.id, {
      enabled: !state.rssFeed.is_enabled,
    })
    dispatch({ rssFeed: result.rss_feed as ManageSourceRssFeed })
    onSuccess(state.rssFeed.is_enabled ? 'Source disabled' : 'Source enabled')
  } catch (error) {
    onError(error, { fallback: 'Failed to toggle source', tags: { form: 'admin-topic-source' } })
  } finally {
    dispatch({ toggling: false })
  }
}

async function handleToggleDiscoverability(
  state: ManageSourceState,
  dispatch: (action: Action) => void,
) {
  if (!state.rssFeed) return
  dispatch({ togglingDiscoverability: true })
  try {
    const next = !state.rssFeed.is_discoverable
    const result = await updateRssFeed(state.rssFeed.id, { discoverable: next })
    dispatch({ rssFeed: result.rss_feed as ManageSourceRssFeed })
    onSuccess(next ? 'Source made discoverable' : 'Source hidden from discovery')
  } catch (error) {
    onError(error, {
      fallback: 'Failed to update discoverability',
      tags: { form: 'admin-topic-source' },
    })
  } finally {
    dispatch({ togglingDiscoverability: false })
  }
}

async function handleDelete(state: ManageSourceState, dispatch: (action: Action) => void) {
  if (!state.rssFeed) return
  dispatch({ deleting: true })
  try {
    await deleteRssFeed(state.rssFeed.id)
    dispatch({ confirmDelete: false, crawls: [], rssFeed: null })
    onSuccess('Source deleted')
  } catch (error) {
    onError(error, { fallback: 'Failed to delete source', tags: { form: 'admin-topic-source' } })
  } finally {
    dispatch({ deleting: false })
  }
}

async function handleRefresh(
  id: string,
  state: ManageSourceState,
  dispatch: (action: Action) => void,
) {
  if (!state.rssFeed) return
  dispatch({ refreshing: true })
  try {
    await refreshRssFeed(state.rssFeed.id, { force: true })
    onSuccess('RSS refresh enqueued')
    const [crawlsData, feedData] = await Promise.all([
      getRssFeedCrawls(state.rssFeed.id),
      fetchRssFeeds(id, { enabled: null, discoverable: null }),
    ])
    dispatch({
      crawls: crawlsData.results,
      rssFeed: (feedData.results[0] as ManageSourceRssFeed | undefined) ?? state.rssFeed,
    })
  } catch (error) {
    onError(error, { fallback: 'Failed to refresh source', tags: { form: 'admin-topic-source' } })
  } finally {
    dispatch({ refreshing: false })
  }
}
