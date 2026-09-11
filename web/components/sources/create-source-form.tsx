'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createSource } from '@/lib/api/client'
import { importRssFeeds } from '@/lib/api/client/import-export'
import { streamImportProgress, type ImportProgress } from '@/lib/api/client/import-stream'
import { ApiError } from '@/lib/api/error'
import { topicHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CreateSourceForm({ onSuccess }: { onSuccess?: () => void }) {
  const t = useTranslations()
  const { push } = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [urls, setUrls] = useState('')
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return

    const parsedUrls = urls.split('\n').flatMap(u => (u.trim() ? [u.trim()] : []))

    if (parsedUrls.length === 0) return

    setError(null)
    setImportProgress(null)
    setLoading(true)

    try {
      if (parsedUrls.length === 1) {
        const result = await createSource({ rss_feed_url: parsedUrls[0]!, follow: true })
        onSuccess?.()
        push(topicHref({ topic_type: 'rss_feed', slug: result.topic_slug }))
      } else {
        abortControllerRef.current?.abort()
        const controller = new AbortController()
        abortControllerRef.current = controller

        const data = await importRssFeeds({ urls: parsedUrls, follow: true })
        setUrls('')
        setImportProgress({
          batchId: data.import.id,
          completed: 0,
          failed: 0,
          total: data.import.total_rows,
          done: false,
        })
        try {
          await streamImportProgress(
            data.import.id,
            progress => {
              setImportProgress(progress)
            },
            controller.signal,
          )
          if (!controller.signal.aborted) setLoading(false)
        } catch (error) {
          /* c8 ignore next -- error paths require injecting network/abort failures */
          if (error instanceof Error && error.name === 'AbortError') return
          if (!controller.signal.aborted) {
            /* c8 ignore next 2 -- if-aborted branch is untestable in jsdom */
            setError(
              error instanceof ApiError
                ? error.message
                : t('extracted.sources.createSourceForm.importStreamDisconnected_2a261662'),
            )
            setLoading(false)
          }
        }
      }
    } catch (error) {
      /* c8 ignore next 2 -- error path requires injecting a submission failure */
      setError(
        error instanceof ApiError
          ? error.message
          : t('extracted.sources.createSourceForm.failedToSubmitSource_aaa91562'),
      )
      setLoading(false)
    }
  }

  const progressPct =
    importProgress && importProgress.total > 0
      ? Math.round(
          ((importProgress.completed + importProgress.failed) / importProgress.total) * 100,
        )
      : 0

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-6'
    >
      {error && (
        <div className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>{error}</div>
      )}

      <div className='space-y-2'>
        <Label htmlFor='rss_feed_urls'>
          {t('extracted.sources.createSourceForm.rssFeedUrls_b14b2c75')}
        </Label>
        <Textarea
          id='rss_feed_urls'
          value={urls}
          onChange={e => setUrls(e.target.value)}
          placeholder={t('extracted.sources.createSourceForm.httpsExampleComFeedXmlHttps_97cf52c2')}
          rows={4}
          data-pw='create-source-form-urls'
        />
        <p className='text-xs text-muted-foreground'>
          {t('extracted.sources.createSourceForm.enterOneOrMoreRssOr_b47cb98e')}
        </p>
      </div>

      <Button
        type='submit'
        loading={loading}
        disabled={loading || !urls.trim()}
        data-pw='create-source-form-submit'
      >
        {loading
          ? t('extracted.sources.createSourceForm.submitting_64115d5b')
          : t('extracted.sources.createSourceForm.submitSource_525f8da6')}
      </Button>

      {importProgress && (
        <div
          className='space-y-2'
          data-pw='create-source-form-progress'
        >
          <div className='h-2 w-full overflow-hidden rounded-full bg-secondary'>
            <div
              className='h-full bg-primary transition-all duration-300'
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className='text-sm text-muted-foreground'>
            {importProgress.done
              ? t('extracted.sources.createSourceForm.doneCompletedImportedFailedFailed_d5eddc9e', {
                  completed: importProgress.completed,
                  failed: importProgress.failed,
                })
              : t('extracted.sources.createSourceForm.processingProcessedTotal_3076ee5e', {
                  processed: importProgress.completed + importProgress.failed,
                  total: importProgress.total,
                })}
          </p>
        </div>
      )}
    </form>
  )
}
