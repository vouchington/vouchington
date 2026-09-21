import type { Metadata } from 'next'
import Link from 'next/link'
import { createPageMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createPageMetadata({
  title: 'Copyright policy',
  description: 'Voucha copyright notice and counter-notice information.',
  path: '/copyright',
})

export default function CopyrightPage() {
  return (
    <main className='mx-auto max-w-3xl space-y-6 py-8'>
      <h1 className='text-3xl font-bold'>Copyright policy</h1>
      <p>
        Voucha has a US copyright process for reports about hosted material. It is activation-gated.
        We will not represent that a designated agent or intake channel is active until the required
        registration and contact details are published.
      </p>
      <p>
        Signed-in members can see accepted case records. Public case views do not show names,
        contact details, raw email, evidence, or agent analysis.
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
        <Link
          className='block underline'
          href='/copyright/review-queue'
        >
          Copyright review queue
        </Link>
      </div>
    </main>
  )
}
