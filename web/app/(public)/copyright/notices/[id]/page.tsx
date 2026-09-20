import { notFound } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getCopyrightNoticeServer } from '@/lib/api/server/copyright-notices'
import { CopyrightNoticeDetailView } from '@/components/copyright/copyright-notice-detail'
export const dynamic = 'force-dynamic'
export default async function CopyrightNoticePage({ params }: { params: Promise<{ id: string }> }) {
  await requireCurrentUser()
  const { id } = await params
  const notice = await getCopyrightNoticeServer(id)
  if (!notice) notFound()
  return (
    <main className='mx-auto max-w-3xl py-8'>
      <CopyrightNoticeDetailView notice={notice} />
    </main>
  )
}
