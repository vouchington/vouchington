'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

/**
 * What a signed-out filer sees after submitting. The case list and case pages require sign-in, so
 * this panel says exactly what the filer can rely on to follow the case instead of linking there.
 */
export function CopyrightGuestReceipt({
  noticeId,
  email,
  duplicate,
}: {
  noticeId: string
  email: string
  duplicate: boolean
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  const filingPath = `/copyright/notices/${noticeId}/guest`
  return (
    <section
      data-pw='copyright-guest-receipt'
      aria-labelledby='copyright-guest-receipt-heading'
      className='space-y-4'
    >
      <h2
        id='copyright-guest-receipt-heading'
        ref={heading}
        tabIndex={-1}
        className='text-2xl font-semibold'
      >
        {duplicate ? 'Notice already received' : 'Notice received'}
      </h2>
      <p>
        Your case ID is <code className='rounded bg-muted px-1'>{noticeId}</code>. Keep it. It
        identifies your case.
      </p>
      {duplicate ? (
        <p>We already had this notice, so we did not open a second case.</p>
      ) : (
        <p>We will email a receipt with this case ID to {email}.</p>
      )}
      <h3 className='text-lg font-medium'>How your case is tracked</h3>
      <ul className='list-disc space-y-2 pl-5 text-sm'>
        <li>A moderator reviews every notice. We will contact you at {email} if we need more.</li>
        <li>You filed without signing in, so you cannot follow this case online.</li>
        <li>
          If Voucha sends you an access token for this case, enter it at{' '}
          <Link
            className='underline'
            href={filingPath}
          >
            {filingPath}
          </Link>{' '}
          to correct your notice, withdraw it, or report a court or Copyright Claims Board filing.
        </li>
      </ul>
      <p className='text-sm'>
        <Link
          className='underline'
          href='/copyright'
        >
          Back to the copyright policy
        </Link>
      </p>
    </section>
  )
}
