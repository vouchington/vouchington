'use client'

import { useState, useRef, useEffect } from 'react'
import onError, { onSuccess } from '@/lib/on-error'

import { Button } from '@/components/ui/button'
import {
  getArticleSyncStatus,
  triggerArticleSync,
  type ArticleSyncResult,
} from '@/lib/api/client/admin'
import { ApiError } from '@vouchington/api-client'
import { useTranslations } from '@/lib/i18n/use-translations'
import { createArticleSyncStreamSession } from './article-sync-stream-session'

type SyncStatus =
  | { status: 'completed'; result: ArticleSyncResult }
  | { status: 'failed'; error?: string }

export function SyncArticlesButton() {
  const t = useTranslations()
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<ArticleSyncResult | null>(null)
  const actions = useRef({
    finish(_status: SyncStatus) {},
    fail(_error: unknown) {},
  })

  function finishSync(data: SyncStatus) {
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
      return
    }
    if (data.status === 'failed') {
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

  function failTracking(error: unknown) {
    onError(error, {
      fallback: t(
        'extracted.postgresql.syncArticlesButton.failedToTrackArticleSyncStatus_d66a1c43',
      ),
      tags: { form: 'admin-article-sync' },
    })
    setSyncing(false)
  }

  const session = useRef<ReturnType<typeof createArticleSyncStreamSession> | null>(null)

  useEffect(() => {
    actions.current = { finish: finishSync, fail: failTracking }
  })

  useEffect(() => {
    const current = createArticleSyncStreamSession({
      readStatus: getArticleSyncStatus,
      onTerminal: status => actions.current.finish(status),
      onTrackingFailure: error => actions.current.fail(error),
    })
    session.current = current
    return () => {
      current.stop()
      session.current = null
    }
  }, [])

  async function handleSync() {
    const current = session.current
    if (!current) return
    setSyncing(true)
    setResult(null)
    current.stop()
    try {
      const { jobId } = await triggerArticleSync()
      current.start(jobId)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        onError(new Error('An article sync was already triggered recently'), {
          fallback: t(
            'extracted.postgresql.syncArticlesButton.anArticleSyncWasAlreadyTriggered_fb387842',
          ),
          tags: { form: 'admin-article-sync' },
          skipSentry: true,
        })
      } else {
        onError(err, {
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
