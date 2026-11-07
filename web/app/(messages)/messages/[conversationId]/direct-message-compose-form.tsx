'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { sendDirectMessage } from '@/lib/api/client/messages'
import onError from '@/lib/on-error'
import type { DirectMessage } from '@/types/messages'
import { useTranslations } from '@/lib/i18n/use-translations'

export function DirectMessageComposeForm({
  conversationId,
  currentUserId,
  setMessages,
}: {
  conversationId: string
  currentUserId: string
  setMessages: Dispatch<SetStateAction<DirectMessage[]>>
}) {
  const t = useTranslations()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    const optimistic: DirectMessage = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId,
      body_text: trimmed,
      created_by_id: currentUserId,
      created_at: new Date().toISOString(),
    }

    setMessages(prev => [...prev, optimistic])
    setText('')
    setSending(true)
    try {
      const result = await sendDirectMessage(conversationId, trimmed)
      setMessages(prev =>
        prev.map(message =>
          message.id === optimistic.id
            ? {
                id: result.message.id,
                conversation_id: result.message.conversation_id,
                body_text: result.message.body_text,
                created_by_id: currentUserId,
                created_at: result.message.created_at,
              }
            : message,
        ),
      )
    } catch (err) {
      setMessages(prev => prev.filter(message => message.id !== optimistic.id))
      onError(err, {
        fallback: t('extracted.conversationid.conversationPageClient.failedToSendMessage_66b8e077'),
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
        aria-label={t('extracted.conversationid.conversationPageClient.directMessage_cd3e1605')}
        placeholder={t('extracted.conversationid.conversationPageClient.writeAMessage_dc9f3f9f')}
        value={text}
        onChange={event => setText(event.target.value)}
        disabled={sending}
        data-pw='dm-compose-input'
      />
      <Button
        type='submit'
        disabled={sending || !text.trim()}
        data-pw='dm-send-button'
      >
        {t('extracted.conversationid.conversationPageClient.send_f6f4688f')}
      </Button>
    </form>
  )
}
