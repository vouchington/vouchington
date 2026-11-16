'use client'

import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatUtcDateTime } from '@ts-shared/utils/format'
import { Button } from '@/components/ui/button'
import type {
  CopyrightGuestCapabilityRow,
  useCopyrightGuestCapabilities,
} from './copyright-staff-guest-capability-list'

export function CopyrightGuestCapabilityRows({
  list,
  pending,
  onRequest,
  onRevoke,
  onLoadOlder,
}: {
  list: ReturnType<typeof useCopyrightGuestCapabilities>
  pending: boolean
  onRequest: (capabilityId: string) => void
  onRevoke: (capabilityId: string) => void
  onLoadOlder: () => void
}) {
  const uiLocale = useUiLocale()
  if (list.status === 'loading') {
    return <p className='text-sm text-muted-foreground'>Loading guest access…</p>
  }
  if (list.status === 'failed') {
    return (
      <p className='text-sm text-destructive'>
        Could not load guest access.{' '}
        <Button
          data-pw='copyright-staff-guest-capability-rows-reload'
          type='button'
          size='sm'
          variant='link'
          onClick={() => list.reload()}
        >
          Retry
        </Button>
      </p>
    )
  }
  if (list.rows.length === 0) {
    return <p className='text-sm text-muted-foreground'>No guest access issued.</p>
  }
  return (
    <div className='space-y-2'>
      <ul
        aria-label='Issued guest access'
        className='divide-y rounded-md border text-sm'
      >
        {list.rows.map(row => (
          <li
            key={row.id}
            className='flex flex-wrap items-center justify-between gap-2 p-2'
          >
            <span>{describeCapability(row, uiLocale)}</span>
            {row.status === 'active' && (
              <span className='flex gap-2'>
                <Button
                  data-pw='copyright-staff-guest-capability-rows-request'
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={pending}
                  onClick={() => onRequest(row.id)}
                >
                  Request information
                </Button>
                <Button
                  data-pw='copyright-staff-guest-capability-rows-revoke'
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={pending}
                  onClick={() => onRevoke(row.id)}
                >
                  Revoke
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <Button
          data-pw='copyright-staff-guest-capability-rows-load-older'
          type='button'
          size='sm'
          variant='ghost'
          disabled={pending}
          onClick={onLoadOlder}
        >
          Load older guest access
        </Button>
      )}
    </div>
  )
}

function describeCapability(row: CopyrightGuestCapabilityRow, uiLocale: string): string {
  const issuer = row.issued_by_username ? `@${row.issued_by_username}` : 'a deleted account'
  const issued = `Issued ${formatUtcDateTime(row.issued_at, uiLocale)} by ${issuer}`
  if (row.status === 'revoked') {
    return `${issued} · revoked ${formatUtcDateTime(row.revoked_at ?? row.expires_at, uiLocale)}`
  }
  const verb = row.status === 'expired' ? 'expired' : 'expires'
  return `${issued} · ${verb} ${formatUtcDateTime(row.expires_at, uiLocale)}`
}
