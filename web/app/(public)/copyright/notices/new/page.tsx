import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { CopyrightNoticeForm } from '@/components/copyright/copyright-notice-form'
export const dynamic = 'force-dynamic'
export default async function NewCopyrightNoticePage() {
  await requireCurrentUser()
  return (
    <main className='mx-auto max-w-2xl space-y-5 py-8'>
      <h1 className='text-3xl font-bold'>Copyright notice</h1>
      <p className='text-muted-foreground'>
        Use this form for a US copyright claim about an image hosted on Voucha.
      </p>
      <CopyrightNoticeForm />
    </main>
  )
}
