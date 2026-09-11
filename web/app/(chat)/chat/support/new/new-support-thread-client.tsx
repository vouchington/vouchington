'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createMySupportThread } from '@/lib/api/client/support'
import { chatSupportThreadHref } from '@/lib/links/entity-href'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

export function NewSupportThreadClient({ conversationId }: { conversationId: string | undefined }) {
  const t = useTranslations()
  const { push } = useRouter()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim()) return

    setLoading(true)
    setError(null)
    try {
      const data = await createMySupportThread({
        subject: subject.trim(),
        message: message.trim() || undefined,
        conversation_id: conversationId,
      })
      push(chatSupportThreadHref(data.thread))
    } catch (error) {
      setError(
        onError(error, {
          fallback: t('extracted.new.newSupportThreadClient.failedToSubmitRequest_3ae27e37'),
          tags: { form: 'support-thread-new' },
        }),
      )
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-4'
    >
      {conversationId && (
        <div
          className='rounded-md border bg-muted/50 px-4 py-3 text-sm text-muted-foreground'
          data-pw='support-thread-conversation-notice'
        >
          {t('extracted.new.newSupportThreadClient.thisRequestWillBeLinkedTo_d4dad542')}
        </div>
      )}

      <div className='space-y-2'>
        <Label htmlFor='subject'>
          {t('extracted.new.newSupportThreadClient.subject_68971283')}
        </Label>
        <Input
          id='subject'
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder={t(
            'extracted.new.newSupportThreadClient.briefDescriptionOfYourIssue_e4d60aa7',
          )}
          required
          data-pw='support-thread-subject-input'
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='message'>
          {t('extracted.new.newSupportThreadClient.messageOptional_0a411b50')}
        </Label>
        <Textarea
          id='message'
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={t(
            'extracted.new.newSupportThreadClient.provideMoreDetailAboutYourIssue_31510b5a',
          )}
          rows={5}
          data-pw='support-thread-message-input'
        />
      </div>

      {error && <p className='text-sm text-destructive'>{error}</p>}

      <div className='flex gap-3'>
        <Button
          type='submit'
          loading={loading}
          disabled={loading || !subject.trim()}
          data-pw='support-thread-submit-button'
        >
          {t('extracted.new.newSupportThreadClient.submitRequest_cffa014c')}
        </Button>
        <Button
          type='button'
          variant='outline'
          asChild
        >
          <Link
            href='/chat/support'
            prefetch={false}
            data-pw='support-thread-cancel-link'
          >
            {t('extracted.new.newSupportThreadClient.cancel_19766ed6')}
          </Link>
        </Button>
      </div>
    </form>
  )
}
