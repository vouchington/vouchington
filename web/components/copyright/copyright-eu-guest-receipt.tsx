'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

export function CopyrightEuGuestReceipt({
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
  return (
    <section
      data-pw='copyright-eu-guest-receipt'
      aria-labelledby='copyright-eu-guest-receipt-heading'
      className='space-y-4'
    >
      <h2
        id='copyright-eu-guest-receipt-heading'
        ref={heading}
        tabIndex={-1}
        className='text-2xl font-semibold'
      >
        {duplicate ? 'Notice already received' : 'Notice received'}
      </h2>
      <p>
        Your case ID is <code className='rounded bg-muted px-1'>{noticeId}</code>. Keep it for your
        records.
      </p>
      {duplicate ? (
        <p>We already had this notice, so we did not open a second case.</p>
      ) : (
        <p>We will email a receipt with this case ID to {email}.</p>
      )}
      <p>A moderator will decide what happens next. We will send the decision to {email}.</p>
      <p>If you want to complain about the decision, reply to the decision email.</p>
      <Link
        className='underline'
        href='/copyright'
      >
        Back to the copyright policy
      </Link>
    </section>
  )
}
