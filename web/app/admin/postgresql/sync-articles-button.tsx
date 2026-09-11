'use client'

import { useState, useRef, useEffect } from 'react'
import onError, { onSuccess } from '@/lib/on-error'

import { Button } from '@/components/ui/button'
import {
  getArticleSyncStatus,
  triggerArticleSync,
  type ArticleSyncJobStatus,
  type ArticleSyncResult,
} from '@/lib/api/client/admin'
import { ApiError } from '@/lib/api/error'
import { useTranslations } from '@/lib/i18n/use-translations'

type SyncStatus =
  | { status: 'completed'; result: ArticleSyncResult }
  | { status: 'failed'; error?: string }
type TerminalSyncStatus =
  | Extract<ArticleSyncJobStatus, { status: 'completed' }>
  | { status: 'failed'; error?: string }

export function SyncArticlesButton() {
  const t = useTranslations()
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<ArticleSyncResult | null>(null)
  const streamRef = useRef<{ source: EventSource; close: () => void } | null>(null)

  function finishSync(
    data: TerminalSyncStatus,
    stream?: { source: EventSource; close: () => void },
  ) {
    if (stream && streamRef.current !== stream) return
    stream?.close()
    if (streamRef.current === stream) streamRef.current = null

    if (data.status === 'completed') {
      setResult(data.result)
      const { created, updated, skipped } = data.result.summary
      onSuccess(
        t(
          'extracted.postgresql.syncArticlesButton.articlesSyncedCreatedCreatedUpdatedUpdated_09cf91d7',
          { created, updated, skipped },
        ),
      )
      setSyncing(false)
    } else if (data.status === 'failed') {
      onError(new Error(data.error ?? 'Sync failed'), {
        fallback: t('extracted.postgresql.syncArticlesButton.syncFailedError_1ccd2643', {
          error: data.error ?? t('extracted.postgresql.syncArticlesButton.unknownError_3e8c5a92'),
        }),
        tags: { form: 'admin-article-sync' },
        skipSentry: true,
      })
      setSyncing(false)
    }
  }

  useEffect(() => {
    return () => {
      streamRef.current?.close()
      streamRef.current = null
    }
  }, [])

  function connectStream(jobId: string) {
    const es = new EventSource(`/api/v1/admin/article-syncs/${jobId}/stream`)
    const stream = {
      source: es,
      close: () => {
        es.removeEventListener('status', handleStatus)
        es.close()
      },
    }
    streamRef.current = stream

    function handleStatus(event: MessageEvent) {
      let data: SyncStatus
      try {
        data = JSON.parse(event.data) as SyncStatus
      } catch {
        return
      }

      finishSync(data, stream)
    }

    es.addEventListener('status', handleStatus)

    es.onerror = () => {
      getArticleSyncStatus(jobId)
        .then(status => {
          if (streamRef.current !== stream) return
          if (status.status === 'active') return
          finishSync(status, stream)
        })
        .catch(error => {
          if (streamRef.current !== stream) return
          if (!(error instanceof ApiError) || error.status >= 500 || error.status === 429) return
          stream.close()
          if (streamRef.current === stream) streamRef.current = null
          onError(error, {
            fallback: t(
              'extracted.postgresql.syncArticlesButton.failedToTrackArticleSyncStatus_d66a1c43',
            ),
            tags: { form: 'admin-article-sync' },
          })
          setSyncing(false)
        })
    }
  }

  async function handleSync() {
    setSyncing(true)
    setResult(null)
    streamRef.current?.close()
    streamRef.current = null
    try {
      const { jobId } = await triggerArticleSync()
      connectStream(jobId)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        onError(new Error('An article sync was already triggered recently'), {
          fallback: t(
            'extracted.postgresql.syncArticlesButton.anArticleSyncWasAlreadyTriggered_fb387842',
          ),
          tags: { form: 'admin-article-sync' },
          skipSentry: true,
        })
      } else {
        onError(error, {
          fallback: t(
            'extracted.postgresql.syncArticlesButton.failedToTriggerArticleSync_17646b04',
          ),
          tags: { form: 'admin-article-sync' },
        })
      }
      setSyncing(false)
    }
  }

  return (
    <div className='space-y-3'>
      <Button
        data-pw='sync-articles-button'
        onClick={handleSync}
        loading={syncing}
        disabled={syncing}
      >
        {syncing
          ? t('extracted.postgresql.syncArticlesButton.syncing_6d2a9c73')
          : t('extracted.postgresql.syncArticlesButton.syncArticles_1a7f3e84')}
      </Button>
      {result && (
        <p className='text-sm text-muted-foreground'>
          {t(
            'extracted.postgresql.syncArticlesButton.createdCreatedUpdatedUpdatedSkippedUnchanged_832291c8',
            {
              created: result.summary.created,
              updated: result.summary.updated,
              skipped: result.summary.skipped,
              errored: result.summary.errored,
            },
          )}
        </p>
      )}
    </div>
  )
}
