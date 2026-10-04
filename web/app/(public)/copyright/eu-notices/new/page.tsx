import { notFound } from 'next/navigation'
import { CopyrightEuNoticeForm } from '@/components/copyright/copyright-eu-notice-form'
import { getCopyrightJurisdictionAvailabilityServer } from '@/lib/api/server/copyright-notices'

export const dynamic = 'force-dynamic'

export default async function NewCopyrightEuNoticePage() {
  let available = false
  try {
    available = (await getCopyrightJurisdictionAvailabilityServer())
      .copyright_jurisdiction_availability.eu_dsa
  } catch {
    // An unavailable read never exposes the filing form.
  }
  if (!available) notFound()
  return (
    <main className='mx-auto max-w-2xl space-y-5 py-8'>
      <h1 className='text-3xl font-bold'>EU copyright notice</h1>
      <p className='text-muted-foreground'>
        Report an image hosted on Voucha when you believe it infringes your copyright in the EU.
      </p>
      <CopyrightEuNoticeForm />
    </main>
  )
}
