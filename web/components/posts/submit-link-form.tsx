'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { createLinkPost } from '@/lib/api/client/posts'
import { getCanonicalPostPath } from '@/lib/post-helpers'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  isEmailVerificationRequired,
  useEmailVerificationRecovery,
} from '@/lib/email-verification-recovery-context'

export function SubmitLinkForm() {
  const t = useTranslations()
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const turnstile = useTurnstileToken()
  const emailRecovery = useEmailVerificationRecovery()

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!url.trim()) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await createLinkPost({
        url: url.trim(),
        title: title.trim() || undefined,
        cf_turnstile_response: turnstile.token ?? undefined,
      })
      const post = result.post
      if (post) {
        router.push(getCanonicalPostPath(post))
      }
    } catch (error) {
      if (isEmailVerificationRequired(error)) {
        emailRecovery?.openEmailVerificationRecovery()
        turnstile.reset()
        return
      }
      setError(
        error instanceof Error
          ? error.message
          : t('extracted.posts.submitLinkForm.failedToSubmitLinkPleaseTry_9e15315e'),
      )
      turnstile.reset()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-4'
      data-pw='submit-link-form'
    >
      <div className='space-y-2'>
        <Label htmlFor='link-url'>{t('extracted.posts.submitLinkForm.url_e7a241de')}</Label>
        <Input
          id='link-url'
          type='url'
          placeholder={t('extracted.posts.submitLinkForm.httpsExampleComArticle_63253829')}
          value={url}
          onChange={e => setUrl(e.target.value)}
          required
          disabled={isSubmitting}
          data-pw='submit-link-url-input'
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='link-title'>
          {t('extracted.posts.submitLinkForm.title_7e8cd205')}{' '}
          <span className='text-muted-foreground'>
            {t('extracted.posts.submitLinkForm.optional_0059798b')}
          </span>
        </Label>
        <Input
          id='link-title'
          type='text'
          placeholder={t('extracted.posts.submitLinkForm.overrideThePageTitle_aede2cfb')}
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={isSubmitting}
          data-pw='submit-link-title-input'
        />
      </div>
      <TurnstileField turnstile={turnstile} />
      {error && (
        <p
          className='text-sm text-destructive'
          data-pw='submit-link-error'
        >
          {error}
        </p>
      )}
      <Button
        type='submit'
        disabled={isSubmitting || !url.trim() || !turnstile.token}
        data-pw='submit-link-button'
      >
        {isSubmitting
          ? t('extracted.posts.submitLinkForm.submitting_49195f55')
          : t('extracted.posts.submitLinkForm.submitLink_dbd47817')}
      </Button>
    </form>
  )
}
