import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { NewMessageClient } from './new-message-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('New Message')

export default async function NewMessagePage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) notFound()

  return <NewMessageClient currentUserId={currentUser.id} />
}
