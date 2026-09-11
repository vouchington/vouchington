import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Messages')

export default async function MessagesLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  return children
}
