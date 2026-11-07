'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { sendModmailMessage, type ModmailMessage } from '@/lib/api/client/modmail'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ModmailThreadComposeForm({
  communitySlug,
  threadId,
  onSent,
}: {
  communitySlug: string
  threadId: string
  onSent: (message: ModmailMessage) => void
}) {
  const t = useTranslations()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    setText('')
    setSending(true)
    try {
      const result = await sendModmailMessage(communitySlug, threadId, trimmed)
      onSent(result.message)
    } catch (err) {
      onError(err, {
        fallback: t('extracted.threadid.modmailThreadClient.failedToSendMessage_66b8e077'),
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <form
      className='flex flex-col gap-2'
      onSubmit={event => {
        event.preventDefault()
        void handleSend()
      }}
    >
      <Textarea
        placeholder={t('extracted.threadid.modmailThreadClient.writeAReply_182fe0aa')}
        value={text}
        onChange={event => setText(event.target.value)}
        disabled={sending}
        data-pw='modmail-compose-input'
      />
      <Button
        type='submit'
        disabled={sending || !text.trim()}
        data-pw='modmail-send-button'
      >
        {t('extracted.threadid.modmailThreadClient.send_f6f4688f')}
      </Button>
    </form>
  )
}
