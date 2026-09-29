import { CopyrightGuestFilingForm } from '@/components/copyright/copyright-guest-filing-form'

export const dynamic = 'force-dynamic'

export default async function CopyrightGuestFilingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <main className='mx-auto max-w-2xl space-y-4 py-8'>
      <h1 className='text-3xl font-bold'>Copyright case filing</h1>
      <p className='text-muted-foreground'>
        Use the access token from Voucha for this case. A correction does not change the original
        receipt time.
      </p>
      <CopyrightGuestFilingForm noticeId={id} />
    </main>
  )
}
