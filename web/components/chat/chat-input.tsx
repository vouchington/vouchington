'use client'

import { useRef } from 'react'
import { Square } from 'lucide-react'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  onSend: (message: string) => void
  isStreaming: boolean
  onAbort: () => void
  disabled?: boolean
}

export function ChatInput({ onSend, isStreaming, onAbort, disabled }: Props) {
  const t = useTranslations()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const SendMessageIcon = EntityActionIcons.sendChatMessage

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isStreaming) return
    const value = textareaRef.current?.value.trim()
    if (!value || disabled) return
    if (textareaRef.current) textareaRef.current.value = ''
    onSend(value)
  }

  return (
    <div
      data-pw='chat-input'
      className='border-t bg-background p-4'
    >
      <form
        onSubmit={handleSubmit}
        className='flex gap-2'
      >
        <Textarea
          ref={textareaRef}
          aria-label={t('extracted.chat.chatInput.chatMessage_f6820511')}
          placeholder={t('extracted.chat.chatInput.typeAMessageCmdEnterCtrl_4a76fabf')}
          className='min-h-[44px] resize-none'
          rows={1}
          disabled={disabled}
          data-pw='chat-input-textarea'
        />
        {isStreaming ? (
          <Button
            type='button'
            size='icon'
            variant='outline'
            className='min-h-[44px] min-w-[44px] shrink-0'
            onClick={onAbort}
            aria-label={t('extracted.chat.chatInput.stopGenerating_f6a74a27')}
            data-pw='chat-input-abort-button'
          >
            <Square className='size-4' />
          </Button>
        ) : (
          <Button
            type='submit'
            size='icon'
            className='min-h-[44px] min-w-[44px] shrink-0'
            disabled={disabled}
            aria-label={t('extracted.chat.chatInput.sendMessage_93a26b1e')}
            data-pw='chat-input-send-button'
          >
            <SendMessageIcon
              className='size-4'
              data-icon='send-chat-message'
            />
          </Button>
        )}
      </form>
    </div>
  )
}
