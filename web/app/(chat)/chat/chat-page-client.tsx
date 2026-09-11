'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChatLayout } from '@/components/chat/chat-layout'
import { ChatMessages } from '@/components/chat/chat-messages'
import { ChatInput } from '@/components/chat/chat-input'
import { useChatStream } from '@/hooks/use-chat-stream'
import { createConversation } from '@/lib/api/client/conversations'
import { useOptionalChatSidebar } from '@/lib/use-chat-sidebar'
import { chatHref } from '@/lib/links/entity-href'

export function ChatPageClient() {
  const { push } = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const { isStreaming, abort } = useChatStream()
  const chatSidebar = useOptionalChatSidebar()

  async function handleSend(message: string) {
    if (isCreating) return
    setIsCreating(true)
    try {
      const { conversation } = await createConversation({ title: '' })
      chatSidebar?.prependConversation(conversation)
      push(`${chatHref(conversation)}?message=${encodeURIComponent(message)}`)
    } catch {
      setIsCreating(false)
    }
  }

  return (
    <ChatLayout>
      <ChatMessages
        messages={[]}
        isStreaming={false}
      />
      <ChatInput
        onSend={handleSend}
        isStreaming={isStreaming}
        onAbort={abort}
        disabled={isCreating}
      />
    </ChatLayout>
  )
}
