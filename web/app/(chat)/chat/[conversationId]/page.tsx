import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getMyConversationMessages } from '@/lib/api/server/conversations'
import { ChatConversationPage } from '@/components/chat/chat-conversation-page'
import { ConversationPageClient } from './conversation-page-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Chat')

interface Props {
  params: Promise<{ conversationId: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { conversationId } = await params
  const messagesResponse = await getMyConversationMessages(conversationId)

  if (!messagesResponse) notFound()

  return (
    <ChatConversationPage>
      <Suspense fallback={null}>
        <ConversationPageClient
          key={conversationId}
          conversationId={conversationId}
          initialMessages={messagesResponse.results}
        />
      </Suspense>
    </ChatConversationPage>
  )
}
