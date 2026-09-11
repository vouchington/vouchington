import { useEffect, useReducer, useRef } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { getRssFeedCrawls } from '@/lib/api/client'
import { fetchRssFeeds, fetchTopic, updateTopic } from '@/lib/api/client/topics'
import {
  addAdditionalHostname,
  fetchAdditionalHostnames,
  removeAdditionalHostname,
} from '@/lib/api/client/topic-additional-hostnames'
import { useSourceActions } from './use-manage-source-actions'
import {
  initialManageSourceState,
  manageSourceReducer,
  toHostnamesPageInfo,
  toPrimaryHostname,
  type ManageSourceAction,
  type ManageSourceState,
  type ManageSourceRssFeed,
} from './manage-source-model'

export function useManageSourcePage(id: string, initialData?: Partial<ManageSourceState>) {
  const [state, dispatch] = useReducer(manageSourceReducer, {
    ...initialManageSourceState,
    ...initialData,
  })
  const initialIdRef = useRef(id)
  const hasInitialDataRef = useRef(initialData !== undefined)
  const hasLeftInitialIdRef = useRef(false)
  // Bumped every time `id` changes so in-flight load-more requests started under a
  // previous id can detect staleness and skip applying their (now-irrelevant) results.
  const idGenerationRef = useRef(0)

  useEffect(() => {
    idGenerationRef.current += 1
    if (id !== initialIdRef.current) hasLeftInitialIdRef.current = true
    if (hasInitialDataRef.current && !hasLeftInitialIdRef.current) return
    let active = true
    // A topic switch invalidates any additional-hostnames load-more in flight for the
    // previous topic: reset that state immediately rather than leaving it to the
    // (now-stale-gated) settlement of the old request, which may never touch it again.
    dispatch({ loadingMoreHostnames: false, hostnamesFetchError: null })
    void loadManageSourceState(id).then(nextState => {
      if (active) dispatch(nextState)
    })
    return () => {
      active = false
    }
  }, [id])

  const handlePrimaryHostnameSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    dispatch({ primaryHostnameSaving: true })
    try {
      const hostname =
        ((new FormData(e.currentTarget).get('primary_hostname') as string) ?? '').trim() || null
      const { topic } = await updateTopic(id, { hostname })
      dispatch({
        additionalHostnames: topic.hostname_id
          ? state.additionalHostnames.filter(h => h.hostname_id !== topic.hostname_id)
          : state.additionalHostnames,
        primaryHostname: toPrimaryHostname(topic),
      })
      onSuccess(hostname ? `Primary domain set to ${hostname}` : 'Primary domain removed')
    } catch (error) {
      onError(error, {
        fallback: 'Failed to update primary domain',
        tags: { form: 'admin-topic-domains' },
      })
    } finally {
      dispatch({ primaryHostnameSaving: false })
    }
  }

  const handleAddHostname = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    dispatch({ addingHostname: true })
    try {
      const hostname = (new FormData(form).get('new_hostname') as string)?.trim()
      if (!hostname) {
        onError(new Error('Hostname is required'), {
          fallback: 'Hostname is required',
          tags: { form: 'admin-topic-domains' },
          skipSentry: true,
        })
        return
      }
      const result = await addAdditionalHostname(id, hostname)
      const additionalHostnames = state.additionalHostnames.some(
        h => h.hostname_id === result.additional_hostname.hostname_id,
      )
        ? state.additionalHostnames
        : [...state.additionalHostnames, result.additional_hostname]
      dispatch({ additionalHostnames })
      form.reset()
      onSuccess(`Added ${result.additional_hostname.hostname}`)
    } catch (error) {
      onError(error, { fallback: 'Failed to add hostname', tags: { form: 'admin-topic-domains' } })
    } finally {
      dispatch({ addingHostname: false })
    }
  }

  const handleRemoveHostname = async (hostnameId: string, hostname: string) => {
    dispatch({ removingHostnameId: hostnameId })
    try {
      await removeAdditionalHostname(id, hostnameId)
      dispatch({
        additionalHostnames: state.additionalHostnames.filter(h => h.hostname_id !== hostnameId),
      })
      onSuccess(`Removed ${hostname}`)
    } catch (error) {
      onError(error, {
        fallback: 'Failed to remove hostname',
        tags: { form: 'admin-topic-domains' },
      })
    } finally {
      dispatch({ removingHostnameId: null })
    }
  }

  const handleLoadMoreHostnames = async () => {
    const cursor = state.additionalHostnamesPageInfo.end_cursor
    if (!state.additionalHostnamesPageInfo.has_next_page || !cursor) return
    const requestId = id
    const generation = idGenerationRef.current
    dispatch({ loadingMoreHostnames: true, hostnamesFetchError: null })
    try {
      const page = await fetchAdditionalHostnames(requestId, { after: cursor })
      // Skip applying results if `id` changed while this request was in flight — the
      // dedup/append below runs against the reducer's own current state, but a stale
      // response must never be attributed to whatever topic is now mounted.
      if (idGenerationRef.current === generation) {
        dispatch({
          type: 'append-additional-hostnames',
          hostnames: page.results,
          pageInfo: toHostnamesPageInfo(page.page_info),
        })
      }
    } catch (error) {
      if (idGenerationRef.current === generation) {
        dispatch({
          hostnamesFetchError:
            error instanceof Error ? error : new Error('Failed to load more domains'),
        })
      }
    } finally {
      // Also gated: if `id` changed again while this request was in flight, another
      // load-more for the new id may already be running -- clearing the flag here would
      // incorrectly stop that (unrelated) spinner.
      if (idGenerationRef.current === generation) {
        dispatch({ loadingMoreHostnames: false })
      }
    }
  }

  return {
    handlers: {
      handleAddHostname,
      handleClearHostnamesError: () => dispatch({ hostnamesFetchError: null }),
      handleLoadMoreHostnames,
      handlePrimaryHostnameSubmit,
      handleRemoveHostname,
      handleConfirmDeleteChange: (confirmDelete: boolean) => dispatch({ confirmDelete }),
      ...useSourceActions(id, state, dispatch),
    },
    state,
  }
}

async function loadManageSourceState(id: string): Promise<ManageSourceAction> {
  try {
    const [feedData, topicData, additionalHostnamesData] = await Promise.all([
      fetchRssFeeds(id, { enabled: null, discoverable: null }),
      fetchTopic(id),
      fetchAdditionalHostnames(id),
    ])
    const rssFeed = (feedData.results[0] as ManageSourceRssFeed | undefined) ?? null
    return {
      additionalHostnames: additionalHostnamesData.results,
      additionalHostnamesPageInfo: toHostnamesPageInfo(additionalHostnamesData.page_info),
      crawls: rssFeed ? (await getRssFeedCrawls(rssFeed.id)).results : [],
      loading: false,
      primaryHostname: topicData ? toPrimaryHostname(topicData) : null,
      rssFeed,
      topicName: topicData?.name ?? null,
    }
  } catch (error) {
    /* c8 ignore next -- error path requires injecting a load failure */
    return { loadError: error instanceof Error ? error.message : 'Failed to load', loading: false }
  }
}
