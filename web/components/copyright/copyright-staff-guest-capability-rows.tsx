'use client'

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
  if (list.status === 'loading') {
    return <p className='text-sm text-muted-foreground'>Loading guest access…</p>
  }
  if (list.status === 'failed') {
    return (
      <p className='text-sm text-destructive'>
        Could not load guest access.{' '}
        <Button
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
            <span>{describeCapability(row)}</span>
            {row.status === 'active' && (
              <span className='flex gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={pending}
                  onClick={() => onRequest(row.id)}
                >
                  Request information
                </Button>
                <Button
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

function describeCapability(row: CopyrightGuestCapabilityRow): string {
  const issuer = row.issued_by_username ? `@${row.issued_by_username}` : 'a deleted account'
  const issued = `Issued ${new Date(row.issued_at).toLocaleString()} by ${issuer}`
  if (row.status === 'revoked') {
    return `${issued} · revoked ${new Date(row.revoked_at ?? row.expires_at).toLocaleString()}`
  }
  const verb = row.status === 'expired' ? 'expired' : 'expires'
  return `${issued} · ${verb} ${new Date(row.expires_at).toLocaleString()}`
}
