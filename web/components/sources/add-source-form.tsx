'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createSource } from '@/lib/api/client'
import onError, { onSuccess as onSuccessToast } from '@/lib/on-error'
import { topicHref } from '@/lib/links/entity-href'
import { ADD_SOURCE_CONTENT, type AddSourceKind } from './add-source-content'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AddSourceForm({
  kind,
  onSuccess,
}: {
  kind: AddSourceKind
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const { push } = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const content = ADD_SOURCE_CONTENT[kind]

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading || !url.trim()) return
    setLoading(true)
    try {
      const result = await createSource({ rss_feed_url: url.trim(), follow: true })
      onSuccess?.()
      onSuccessToast(t('extracted.sources.addSourceForm.sourceAddedSuccessfully_1817e3b7'))
      push(topicHref({ topic_type: 'rss_feed', slug: result.topic_slug }))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.sources.addSourceForm.failedToAddSource_206b335b'),
        tags: { form: 'add-source' },
      })
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-4'
    >
      <div className='space-y-2'>
        <Label htmlFor='add-source-url'>{content.inputLabel}</Label>
        <Input
          id='add-source-url'
          type='url'
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder={content.inputPlaceholder}
          data-pw='add-source-form-url'
        />
      </div>
      <Button
        type='submit'
        size='touch'
        loading={loading}
        disabled={loading || !url.trim()}
        data-pw='add-source-form-submit'
      >
        {content.buttonLabel}
      </Button>
    </form>
  )
}
