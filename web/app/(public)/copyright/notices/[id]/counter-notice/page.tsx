import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getCopyrightParticipantNoticeServer } from '@/lib/api/server/copyright-notices'
import { CopyrightCounterNoticeForm } from '@/components/copyright/copyright-response-forms'
import { notFound } from 'next/navigation'
export const dynamic = 'force-dynamic'
export default async function CopyrightCounterNoticePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireCurrentUser()
  const { id } = await params
  const notice = await getCopyrightParticipantNoticeServer(id)
  if (!notice || notice.viewer_role !== 'poster' || notice.respondable_target_ids.length === 0)
    notFound()
  return (
    <main className='mx-auto max-w-2xl space-y-4 py-8'>
      <h1 className='text-3xl font-bold'>Counter-notice</h1>
      <CopyrightCounterNoticeForm
        noticeId={id}
        targetIds={notice.respondable_target_ids}
      />
    </main>
  )
}
