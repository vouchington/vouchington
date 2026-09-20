import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getCopyrightParticipantNoticeServer } from '@/lib/api/server/copyright-notices'
import { CopyrightAppealForm } from '@/components/copyright/copyright-appeal-form'
import { notFound } from 'next/navigation'
export const dynamic = 'force-dynamic'
export default async function CopyrightAppealPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCurrentUser()
  const { id } = await params
  const notice = await getCopyrightParticipantNoticeServer(id)
  if (!notice || notice.respondable_target_ids.length === 0) notFound()
  return (
    <main className='mx-auto max-w-2xl space-y-4 py-8'>
      <h1 className='text-3xl font-bold'>Appeal copyright action</h1>
      <CopyrightAppealForm
        noticeId={id}
        targetIds={notice.respondable_target_ids}
      />
    </main>
  )
}
