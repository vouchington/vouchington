'use client'

import Link from 'next/link'
import { createUserPathname, domainHref } from '@/lib/links/entity-href'
import { useModerationTargetLabel } from '@/components/moderation/use-moderation-target-label'
import type { ReportIntegrityFlag } from '@/types/report-integrity'

export function EntityLink({ flag }: { flag: ReportIntegrityFlag }) {
  const targetLabel = useModerationTargetLabel()
  const label = targetLabel(flag.entity_label)
  if (flag.reported_user_id && flag.reported_username) {
    return (
      <Link
        href={createUserPathname(flag.reported_username, '/admin')}
        className='hover:underline'
      >
        {label}
      </Link>
    )
  }
  if (flag.hostname) {
    return (
      <Link
        href={domainHref(flag.hostname)}
        className='hover:underline'
      >
        {label}
      </Link>
    )
  }
  return <span>{label}</span>
}
