'use client'

import Link from 'next/link'
import { createUserPathname, domainHref } from '@/lib/links/entity-href'
import type { ReportIntegrityFlag } from '@/types/report-integrity'

export function EntityLink({ flag }: { flag: ReportIntegrityFlag }) {
  if (flag.reported_user_id && flag.reported_username) {
    return (
      <Link
        href={createUserPathname(flag.reported_username, '/admin')}
        className='hover:underline'
      >
        {flag.entity_label}
      </Link>
    )
  }
  if (flag.hostname) {
    return (
      <Link
        href={domainHref(flag.hostname)}
        className='hover:underline'
      >
        {flag.entity_label}
      </Link>
    )
  }
  return <span>{flag.entity_label}</span>
}
