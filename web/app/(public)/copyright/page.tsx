import type { Metadata } from 'next'
import Link from 'next/link'
import { CopyrightStaffLinks } from '@/components/copyright/copyright-staff-links'
import { createPageMetadata } from '@/lib/seo/metadata'
import { getCopyrightJurisdictionAvailabilityServer } from '@/lib/api/server/copyright-notices'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createPageMetadata({
  title: 'Copyright policy',
  description: 'Voucha copyright notice and counter-notice information.',
  path: '/copyright',
})

export default async function CopyrightPage() {
  let euAvailable = false
  try {
    euAvailable = (await getCopyrightJurisdictionAvailabilityServer())
      .copyright_jurisdiction_availability.eu_dsa
  } catch {
    // The EU intake link is shown only when availability is confirmed.
  }
  return (
    <main className='mx-auto max-w-3xl space-y-6 py-8'>
      <h1 className='text-3xl font-bold'>Copyright policy</h1>
      <p>
        Voucha has a US copyright process for reports about hosted material. It is activation-gated.
        We will not represent that a designated agent or intake channel is active until the required
        registration and contact details are published.
      </p>
      <p>
        Signed-in members can see accepted case records and, when a signed-in member filed the
        notice, that member&apos;s public profile name and a link to their profile. We never show
        the legal name given in a notice. Case records do not show contact details, raw email,
        evidence, or agent analysis.
      </p>
      <p>
        Read{' '}
        <Link
          className='underline'
          href='/article/copyright-and-dmca'
        >
          Copyright and the DMCA on Voucha
        </Link>{' '}
        for how the process works, and{' '}
        <Link
          className='underline'
          href='/article/copyright-complaints'
        >
          How copyright complaints work
        </Link>{' '}
        before you file a notice or counter-notice.
      </p>
      <div className='space-y-2'>
        <Link
          className='block underline'
          href='/copyright/designated-agent'
        >
          Designated agent status
        </Link>
        <Link
          className='block underline'
          href='/copyright/repeat-infringer-policy'
        >
          Repeat-infringer policy
        </Link>
        <Link
          className='block underline'
          href='/copyright/notices/new'
        >
          Submit a copyright notice
        </Link>
        <Link
          className='block underline'
          href='/copyright/counter-notice'
        >
          Counter-notice and restoration
        </Link>
        {euAvailable && (
          <Link
            className='block underline'
            href='/copyright/eu-notices/new'
          >
            Submit an EU copyright notice
          </Link>
        )}
        <CopyrightStaffLinks />
      </div>
    </main>
  )
}
