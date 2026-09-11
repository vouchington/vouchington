'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  patchAdminSupportMessage,
  approveAdminSupportMessage,
  sendAdminSupportMessage,
} from '@/lib/api/client/support'
import { ApiError } from '@/lib/api/error'
import type { SupportMessage } from '@/types/support'
import { useTranslations } from '@/lib/i18n/use-translations'
import { SupportActionConfirmationDialog } from './support-action-confirmation-dialog'
import { AdminSupportMessageMetadata } from './admin-support-message-metadata'

export function AdminSupportMessageCard({
  message,
  threadId,
  onMessageUpdate,
  onRefreshMessages,
  threadResolved = false,
}: {
  message: SupportMessage
  threadId: string
  onMessageUpdate: (msg: SupportMessage) => void
  onRefreshMessages?: () => Promise<void>
  threadResolved?: boolean
}) {
  const t = useTranslations()
  const isDraft =
    message.drafted_at !== null && message.sent_at === null && message.approved_at === null
  const isApproved = message.approved_at !== null && message.sent_at === null
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState(message.body_text)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'approve' | 'send' | null>(null)

  async function runMessageAction(
    action: () => Promise<{ message: SupportMessage }>,
    fallback: string,
  ) {
    setLoading(true)
    setError(null)
    try {
      const data = await action()
      onMessageUpdate(data.message)
      return true
    } catch (error) {
      setError(error instanceof ApiError ? error.message : fallback)
      return false
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    const ok = await runMessageAction(
      () => patchAdminSupportMessage(threadId, message.id, { body_text: editText }),
      t('extracted.threadid.adminSupportMessageCard.failedToSave_2f6c8b93'),
    )
    if (ok) setEditMode(false)
  }

  async function handleApprove() {
    await runMessageAction(
      () => approveAdminSupportMessage(threadId, message.id),
      t('extracted.threadid.adminSupportMessageCard.failedToApprove_9d4a3e71'),
    )
  }

  async function handleSend() {
    const ok = await runMessageAction(
      () => sendAdminSupportMessage(threadId, message.id),
      t('extracted.threadid.adminSupportMessageCard.failedToSend_5b7f2c48'),
    )
    if (!ok) await onRefreshMessages?.()
  }

  const isInbound = message.direction === 'inbound'

  return (
    <div
      className={`rounded-lg border p-4 ${isInbound ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'bg-card'}`}
      data-pw='support-message'
    >
      <AdminSupportMessageMetadata
        isApproved={isApproved}
        isDraft={isDraft}
        message={message}
      />

      {editMode && !threadResolved ? (
        <div className='space-y-2'>
          <Textarea
            aria-label={t(
              'extracted.threadid.adminSupportMessageCard.editedSupportMessage_1af4ce31',
            )}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            placeholder={t('extracted.threadid.adminSupportMessageCard.editMessage_e60b6fb8')}
            rows={6}
            className='w-full'
          />
          {error && <p className='text-sm text-destructive'>{error}</p>}
          <div className='flex gap-2'>
            <Button
              size='sm'
              onClick={handleSave}
              loading={loading}
              disabled={loading}
            >
              {t('extracted.threadid.adminSupportMessageCard.save_1509f561')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => {
                setEditMode(false)
                setEditText(message.body_text)
              }}
            >
              {t('extracted.threadid.adminSupportMessageCard.cancel_19766ed6')}
            </Button>
          </div>
        </div>
      ) : (
        <p className='whitespace-pre-wrap text-sm text-foreground'>{message.body_text}</p>
      )}

      {(isDraft || isApproved) && !editMode && !threadResolved && (
        <div className='mt-3 flex flex-wrap gap-2'>
          {isDraft && (
            <>
              <Button
                size='sm'
                variant='outline'
                onClick={() => setEditMode(true)}
                disabled={loading}
              >
                {t('extracted.threadid.adminSupportMessageCard.edit_464c4ffd')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                onClick={() => setPendingAction('approve')}
                loading={loading}
                disabled={loading}
              >
                {t('extracted.threadid.adminSupportMessageCard.approve_6007acbe')}
              </Button>
            </>
          )}
          {isApproved && (
            <Button
              size='sm'
              onClick={() => setPendingAction('send')}
              loading={loading}
              disabled={loading}
            >
              {t('extracted.threadid.adminSupportMessageCard.send_f6f4688f')}
            </Button>
          )}
          {error && <p className='text-sm text-destructive'>{error}</p>}
        </div>
      )}
      <SupportActionConfirmationDialog
        actionLabel={
          pendingAction === 'approve'
            ? t('extracted.threadid.adminSupportMessageCard.approve_6007acbe')
            : t('extracted.threadid.adminSupportMessageCard.send_f6f4688f')
        }
        description={
          pendingAction === 'approve'
            ? t('extracted.threadid.adminSupportMessageCard.approveThisDraft_52ee65ef')
            : t('extracted.threadid.adminSupportMessageCard.sendThisApprovedReply_2e84c461')
        }
        onConfirm={() => {
          setPendingAction(null)
          void (pendingAction === 'approve' ? handleApprove() : handleSend())
        }}
        onOpenChange={open => {
          if (!open) setPendingAction(null)
        }}
        open={pendingAction !== null}
      />
    </div>
  )
}
