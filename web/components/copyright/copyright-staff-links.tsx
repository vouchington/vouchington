'use client'

import Link from 'next/link'
import { useOptionalAuth } from '@/lib/auth/context'

const STAFF_ROLES = new Set(['administrator', 'moderator'])

/** Staff queue links for the public copyright page; the page HTML is shared, so gate on the client. */
export function CopyrightStaffLinks() {
  const roles = useOptionalAuth()?.currentUser?.roles ?? []
  if (!roles.some(role => STAFF_ROLES.has(role))) return null
  return (
    <>
      <Link
        className='block underline'
        href='/copyright/review-queue'
      >
        Copyright review queue
      </Link>
      <Link
        className='block underline'
        href='/copyright/email-review'
      >
        Copyright email review
      </Link>
    </>
  )
}
