export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getModmailThreadServer, getModmailThreadMessagesServer } from '@/lib/api/server/modmail'
import { ModmailThreadClient } from '@/app/(communities)/communities/[slug]/settings/moderation/modmail/[threadId]/modmail-thread-client'
import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ communitySlug: string; threadId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { communitySlug } = await params
  return createNoIndexMetadata(`Modmail — ${communitySlug}`)
}

export default async function MemberModmailThreadPage({ params }: PageProps) {
  const { communitySlug, threadId } = await params
  const currentUser = await getCurrentUser()

  // (messages) layout handles the redirect to /login when not signed in
  if (!currentUser) notFound()

  const [threadData, messagesData] = await Promise.all([
    getModmailThreadServer(communitySlug, threadId),
    getModmailThreadMessagesServer(communitySlug, threadId),
  ])

  if (!threadData) notFound()

  // Subject user is always isMod=false; any other authorized participant is a mod/staff
  const isMod = currentUser.id !== threadData.thread.subject_user_id

  return (
    <ModmailThreadClient
      communitySlug={communitySlug}
      thread={threadData.thread}
      initialMessages={messagesData?.results ?? []}
      initialHasMore={messagesData?.page_info.has_next_page ?? false}
      initialEndCursor={messagesData?.page_info.end_cursor ?? null}
      isMod={isMod}
    />
  )
}
