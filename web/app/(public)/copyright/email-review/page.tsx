import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CopyrightEmailReview } from '@/components/copyright/copyright-email-review'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getCopyrightEmailIntakeReviewQueue } from '@/lib/api/server/copyright-notices'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CopyrightEmailReviewPage() {
  const currentUser = await requireCurrentUser()
  if (!currentUser.roles.includes('administrator') && !currentUser.roles.includes('moderator')) {
    notFound()
  }
  const data = await getCopyrightEmailIntakeReviewQueue()
  return <CopyrightEmailReview data={data} />
}
