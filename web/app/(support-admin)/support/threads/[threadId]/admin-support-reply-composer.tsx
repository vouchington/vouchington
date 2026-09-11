'use client'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AdminSupportReplyComposerProps {
  handleReplyTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSendReply: () => void
  replyLoading: boolean
  replyText: string
}

export function AdminSupportReplyComposer({
  handleReplyTextChange,
  handleSendReply,
  replyLoading,
  replyText,
}: AdminSupportReplyComposerProps) {
  const t = useTranslations()
  return (
    <div className='rounded-lg border bg-card p-4'>
      <h2
        data-pw='support-thread-send-reply-heading'
        className='mb-3 text-sm font-semibold text-foreground'
      >
        {t('extracted.threadid.adminSupportReplyComposer.saveOutboundReply_66822487')}
      </h2>
      <Textarea
        data-pw='support-thread-reply-textarea'
        aria-label={t('extracted.threadid.adminSupportReplyComposer.replyText_80b9dca9')}
        value={replyText}
        onChange={handleReplyTextChange}
        placeholder={t('extracted.threadid.adminSupportReplyComposer.typeYourReply_b6764937')}
        rows={4}
        className='mb-3 w-full'
      />
      <p className='mb-3 text-xs text-muted-foreground'>
        {t('extracted.threadid.adminSupportReplyComposer.savesThisReplyInTheThread_8a62c7fb')}
      </p>
      <Button
        data-pw='support-thread-send-reply'
        onClick={handleSendReply}
        loading={replyLoading}
        disabled={replyLoading || !replyText.trim()}
      >
        {t('extracted.threadid.adminSupportReplyComposer.saveOutboundReply_66822487')}
      </Button>
    </div>
  )
}
