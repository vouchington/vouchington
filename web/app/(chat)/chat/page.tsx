import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { ChatConversationPage } from '@/components/chat/chat-conversation-page'
import { ChatPageClient } from './chat-page-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Chat')

export default async function ChatPage() {
  return (
    <ChatConversationPage>
      <ChatPageClient />
    </ChatConversationPage>
  )
}
