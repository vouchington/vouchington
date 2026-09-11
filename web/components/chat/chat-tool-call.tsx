'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { ChatSSEEventToolCall } from '@/types/chat'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  toolCall: ChatSSEEventToolCall
  result?: string
}

export function ChatToolCall({ toolCall, result }: Props) {
  const t = useTranslations()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger className='flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-background/50'>
        {isOpen ? (
          <ChevronDown className='size-3 shrink-0' />
        ) : (
          <ChevronRight className='size-3 shrink-0' />
        )}
        <Wrench className='size-3 shrink-0' />
        <span className='font-mono'>{toolCall.name}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='mt-1 rounded-md bg-background/50 p-2 text-xs font-mono'>
          <div className='text-muted-foreground'>
            {t('extracted.chat.chatToolCall.arguments_a1281c0c')}
          </div>
          <pre className='mt-1 overflow-x-auto whitespace-pre-wrap break-words text-foreground'>
            {typeof toolCall.arguments === 'string'
              ? toolCall.arguments
              : JSON.stringify(toolCall.arguments, null, 2)}
          </pre>
          {result != null && (
            <>
              <div className='mt-2 text-muted-foreground'>
                {t('extracted.chat.chatToolCall.result_ccfbca65')}
              </div>
              <pre className='mt-1 overflow-x-auto whitespace-pre-wrap break-words text-foreground'>
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
