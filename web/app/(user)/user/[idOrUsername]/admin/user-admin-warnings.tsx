'use client'

import { useEffect, useReducer } from 'react'
import { TimeAgo } from '@/components/shared/time-ago'
import { getAdminUserWarnings, type UserWarningItem } from '@/lib/api/client/warnings'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

type State =
  | { status: 'loading' }
  | { status: 'loaded'; warnings: UserWarningItem[] }
  | { status: 'error' }

type Action = { type: 'loaded'; warnings: UserWarningItem[] } | { type: 'error' }

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case 'loaded': {
      return { status: 'loaded', warnings: action.warnings }
    }
    case 'error': {
      return { status: 'error' }
    }
  }
}

interface UserAdminWarningsProps {
  userId: string
}

export function UserAdminWarnings({ userId }: UserAdminWarningsProps) {
  const t = useTranslations()
  const [state, dispatch] = useReducer(reducer, { status: 'loading' })

  useEffect(() => {
    let cancelled = false
    getAdminUserWarnings({ userId })
      .then(data => {
        if (!cancelled) dispatch({ type: 'loaded', warnings: data.warnings })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onError(error, {
            fallback: t('extracted.admin.userAdminWarnings.failedToLoadWarnings_9ea8e81e'),
          })
          dispatch({ type: 'error' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [userId, t])

  if (state.status === 'loading') {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-pw='user-admin-warnings-loading'
      >
        {t('extracted.admin.userAdminWarnings.loadingWarnings_72b03132')}
      </p>
    )
  }

  if (state.status === 'error' || state.warnings.length === 0) {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-pw='user-admin-warnings-empty'
      >
        {t('extracted.admin.userAdminWarnings.noWarningsHaveBeenIssuedTo_85c126ff')}
      </p>
    )
  }

  return (
    <ul
      className='space-y-3'
      data-pw='user-admin-warnings-list'
    >
      {state.warnings.map(warning => (
        <li
          key={warning.id}
          className='rounded-md border p-3 text-sm'
          data-pw='user-admin-warning-item'
        >
          <div className='flex flex-wrap items-start justify-between gap-2'>
            <p
              className='font-medium'
              data-pw='user-admin-warning-reason'
            >
              {warning.reason}
            </p>
            <time
              className='shrink-0 text-xs tabular-nums text-muted-foreground'
              data-pw='user-admin-warning-date'
            >
              <TimeAgo date={warning.created_at} />
            </time>
          </div>
          {warning.public_message ? (
            <p
              className='mt-1 whitespace-pre-wrap break-words text-muted-foreground'
              data-pw='user-admin-warning-public-message'
            >
              {warning.public_message}
            </p>
          ) : null}
          <div className='mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground'>
            {warning.issued_by_username ? (
              <span>
                {t('extracted.admin.userAdminWarnings.issuedByUsername_ed5130c7', {
                  username: warning.issued_by_username,
                })}
              </span>
            ) : null}
            {warning.community_slug ? (
              <span>
                {t('extracted.admin.userAdminWarnings.communityCommunityslug_0b84113f', {
                  communitySlug: warning.community_slug,
                })}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
