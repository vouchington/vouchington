'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageWithAside } from '@/components/page-with-aside'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RecipientPicker } from '@/components/messages/recipient-picker'
import { createDirectConversation, sendDirectMessage } from '@/lib/api/client/messages'
import { useOptionalMessagesSidebar } from '@/lib/messages-sidebar-context'
import { useResolvedBreadcrumbs } from '@/lib/navigation/use-resolved-breadcrumbs'
import onError from '@/lib/on-error'
import type { UserSearchResult } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  currentUserId: string
}

export function NewMessageClient({ currentUserId }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const sidebar = useOptionalMessagesSidebar()
  const breadcrumbItems = useResolvedBreadcrumbs({
    tail: [
      { name: 'Messages', path: '/messages' },
      { name: 'New Message', path: '/messages/new' },
    ],
  })
  const [recipients, setRecipients] = useState<UserSearchResult[]>([])
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (submitting || recipients.length === 0 || !body.trim()) return
    setSubmitting(true)
    try {
      const { conversation } = await createDirectConversation(recipients.map(r => r.id))
      await sendDirectMessage(conversation.id, body.trim())
      sidebar?.prependConversation(conversation)
      router.push(`/messages/${conversation.id}`)
    } catch (error) {
      onError(error, {
        fallback: t('extracted.new.newMessageClient.failedToCreateConversation_73dbb8f1'),
      })
      setSubmitting(false)
    }
  }

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <Breadcrumbs items={breadcrumbItems} />
        <PageHeader
          title={t('extracted.new.newMessageClient.newMessage_8e51a80a')}
          description={t('extracted.new.newMessageClient.startADirectOrGroupConversation_3a4b5c6d')}
        />
        <form
          data-pw='new-message-form'
          className='space-y-4'
          onSubmit={e => {
            e.preventDefault()
            void handleSubmit()
          }}
        >
          <div className='space-y-1'>
            <p className='text-sm font-medium'>{t('extracted.new.newMessageClient.to_f4b06ef6')}</p>
            <RecipientPicker
              recipients={recipients}
              onAdd={user => setRecipients(prev => [...prev, user])}
              onRemove={userId => setRecipients(prev => prev.filter(r => r.id !== userId))}
              excludeIds={[currentUserId]}
              disabled={submitting}
            />
          </div>
          <div className='space-y-1'>
            <p className='text-sm font-medium'>
              {t('extracted.new.newMessageClient.message_2f77668a')}
            </p>
            <Textarea
              aria-label={t('extracted.new.newMessageClient.messageBody_7136799d')}
              placeholder={t('extracted.new.newMessageClient.writeAMessage_dc9f3f9f')}
              value={body}
              onChange={e => setBody(e.target.value)}
              disabled={submitting}
              data-pw='new-message-body-input'
            />
          </div>
          <Button
            type='submit'
            disabled={submitting || recipients.length === 0 || !body.trim()}
            loading={submitting}
            data-pw='new-message-submit-button'
          >
            {t('extracted.new.newMessageClient.send_f6f4688f')}
          </Button>
        </form>
      </div>
    </PageWithAside>
  )
}
