import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import {
  getConversation,
  getConversationParticipants,
  getMyMessageThread,
} from '@/lib/api/server/messages'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { DirectMessagePageClient } from './conversation-page-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Messages')

interface Props {
  params: Promise<{ conversationId: string }>
}

export default async function DirectMessagePage({ params }: Props) {
  const { conversationId } = await params
  const [currentUser, threadResponse, participantsResponse, conversation] = await Promise.all([
    getCurrentUser(),
    getMyMessageThread(conversationId),
    getConversationParticipants(conversationId),
    getConversation(conversationId),
  ])

  if (!currentUser || !threadResponse) notFound()

  const participants = participantsResponse?.results ?? []
  const isOwner = participants.find(p => p.user_id === currentUser.id)?.role === 'owner'

  return (
    <Suspense fallback={null}>
      <DirectMessagePageClient
        key={conversationId}
        conversationId={conversationId}
        currentUserId={currentUser.id}
        initialMessages={threadResponse.results}
        initialHasMore={threadResponse.page_info.has_next_page}
        initialEndCursor={threadResponse.page_info.end_cursor}
        initialParticipants={participants}
        isOwner={isOwner}
        initialParticipantAddPolicy={conversation?.participant_add_policy ?? 'owner_only'}
      />
    </Suspense>
  )
}
