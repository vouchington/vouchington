import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCopyrightReviewQueue } from '@/lib/api/server/copyright-notices'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { CopyrightStaffQueue } from '@/components/copyright/copyright-staff-queue'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Copyright Review Queue | Staff')

export default async function CopyrightReviewQueuePage() {
  const currentUser = await requireCurrentUser()
  if (!currentUser.roles.includes('administrator') && !currentUser.roles.includes('moderator')) {
    notFound()
  }
  const data = await getCopyrightReviewQueue()
  return (
    <main className='mx-auto max-w-3xl space-y-5 py-8'>
      <div>
        <h1 className='text-3xl font-bold'>Copyright review queue</h1>
        <p className='text-muted-foreground'>
          Review copyright intake, provisional actions, EU and UK notices, and complaints with the
          private staff tools.
        </p>
      </div>
      <CopyrightStaffQueue
        canAdminister={currentUser.roles.includes('administrator')}
        data={data}
      />
    </main>
  )
}
