import { notFound } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getCopyrightParticipantNoticeServer } from '@/lib/api/server/copyright-notices'
import { CopyrightEuComplaintForm } from '@/components/copyright/copyright-eu-complaint-form'
import { PageWithAside } from '@/components/page-with-aside'

export const dynamic = 'force-dynamic'

export default async function CopyrightComplaintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireCurrentUser()
  const { id } = await params
  const notice = await getCopyrightParticipantNoticeServer(id)
  if (!notice || notice.jurisdiction !== 'eu_dsa' || !notice.eu.complaint.can_submit) notFound()
  return (
    <PageWithAside>
      <main className='mx-auto w-full max-w-2xl space-y-4 py-8'>
        <h1 className='text-3xl font-bold'>Copyright decision complaint</h1>
        <CopyrightEuComplaintForm noticeId={id} />
      </main>
    </PageWithAside>
  )
}
