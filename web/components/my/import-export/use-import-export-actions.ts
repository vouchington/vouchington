'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  exportRssFeeds,
  importRssFeeds,
  exportTopics,
  importTopics,
  preflightExport,
  type RssFeedContentType,
} from '@/lib/api/client/import-export'
import {
  MAX_RSS_FEED_IMPORT_BODY_BYTES,
  RssFeedImportValidationError,
  validateRssFeedImportBody,
} from '@/lib/api/client/rss-feed-import-validation'
import { streamImportProgress } from '@/lib/api/client/import-stream'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { Action, State } from './import-export-state'

interface Options {
  isTopics: boolean
  selectedType: RssFeedContentType | 'all'
  state: State
  dispatch: (action: Action) => void
}

export function useImportExportActions({ isTopics, selectedType, state, dispatch }: Options) {
  const t = useTranslations()
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortControllerRef.current?.abort(), [])

  async function startImportStream(batchId: string, total: number) {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    dispatch({ importProgress: { batchId, completed: 0, failed: 0, total, done: false } })
    try {
      await streamImportProgress(
        batchId,
        progress => dispatch({ importProgress: progress }),
        controller.signal,
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      onError(error, { fallback: 'Import stream disconnected' })
    } finally {
      if (!controller.signal.aborted) dispatch({ importingFeeds: false })
    }
  }

  async function handleExport(format: 'opml' | 'csv') {
    if (isTopics) {
      dispatch({ exportingTopics: true })
      try {
        const url = exportTopics()
        await preflightExport(url)
        triggerDownload(url)
        onSuccess('Topics exported')
      } catch (error) {
        onError(error, { fallback: 'Failed to export topics' })
      } finally {
        dispatch({ exportingTopics: false })
      }
    } else {
      dispatch({ exportingFeeds: true })
      try {
        const url = exportRssFeeds(selectedType === 'all' ? undefined : selectedType, format)
        await preflightExport(url)
        triggerDownload(url)
        onSuccess('RSS feeds exported')
      } catch (error) {
        onError(error, { fallback: 'Failed to export RSS feeds' })
      } finally {
        dispatch({ exportingFeeds: false })
      }
    }
  }

  async function handleImport() {
    const items = state.rssFeedUrls.split('\n').flatMap(u => (u.trim() ? [u.trim()] : []))
    if (items.length === 0) {
      toast.error(isTopics ? 'Enter at least one topic name' : 'Enter at least one URL')
      return
    }
    dispatch({ importingFeeds: true, importProgress: null })
    try {
      if (isTopics) {
        const { results } = await importTopics({ names: items })
        const failed = results.filter(r => r.status === 'error').length
        dispatch({ rssFeedUrls: '', importingFeeds: false })
        if (failed > 0) {
          onError(new Error(`${failed}/${results.length} topic(s) failed`), {
            fallback: 'Some topics failed to import',
          })
        } else {
          onSuccess(`${results.length} topic(s) imported`)
        }
      } else {
        const data = await importRssFeeds({ urls: items, follow: true })
        dispatch({ rssFeedUrls: '' })
        await startImportStream(data.import.id, data.import.total_rows)
      }
    } catch (error) {
      onError(error, {
        fallback: isTopics ? 'Failed to import topics' : 'Failed to import RSS feeds',
      })
      dispatch({ importingFeeds: false })
    }
  }

  async function handleImportFile(file: File) {
    const isCsv = file.name.toLowerCase().endsWith('.csv')
    dispatch({ importingFeeds: true, importProgress: null })
    try {
      if (file.size > MAX_RSS_FEED_IMPORT_BODY_BYTES) {
        toast.error(t('extracted.importExport.sourceFileInput.requestIsTooLargeMax2Mib_53c0b35b'))
        dispatch({ importingFeeds: false })
        return
      }
      const contents = await file.text()
      const body = isCsv
        ? { csv: contents, follow: true as const }
        : { opml: contents, follow: true as const }
      try {
        validateRssFeedImportBody(body)
      } catch (error) {
        if (error instanceof RssFeedImportValidationError && error.code === 'body_too_large') {
          toast.error(t('extracted.importExport.sourceFileInput.requestIsTooLargeMax2Mib_53c0b35b'))
          dispatch({ importingFeeds: false })
          return
        }
        throw error
      }
      const data = await importRssFeeds(body)
      await startImportStream(data.import.id, data.import.total_rows)
    } catch (error) {
      onError(error, { fallback: `Failed to import ${isCsv ? 'CSV' : 'OPML'}` })
      dispatch({ importingFeeds: false })
    }
  }

  return { handleExport, handleImport, handleImportFile }
}

function triggerDownload(url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.click()
}
