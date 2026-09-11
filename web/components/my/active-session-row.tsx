import { formatUtcDate } from '@ts-shared/utils/format'
import type { Translator } from '@ts-shared/ui-messages'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AuthSession } from '@/types/my'

export function ActiveSessionRow({
  loading,
  session,
  t,
  uiLocale,
  onSignOut,
}: {
  loading: boolean
  session: AuthSession
  t: Translator
  uiLocale: string
  onSignOut: (session: AuthSession) => void
}) {
  return (
    <li
      className='rounded-md border p-4'
      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
      data-pw={`active-session-item-${session.id}`}
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0 space-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium'>
              {session.device_name || t('settings.activeSessions.unknownDevice')}
            </span>
            {session.is_current ? (
              <Badge variant='secondary'>{t('settings.activeSessions.thisDevice')}</Badge>
            ) : null}
          </div>
          <p className='text-xs text-muted-foreground'>
            {t('settings.activeSessions.signedInLastSeen', {
              createdAt: formatUtcDate(session.created_at, uiLocale),
              lastSeenAt: formatUtcDate(session.last_seen_at, uiLocale),
            })}
          </p>
          <p className='text-xs text-muted-foreground'>
            {session.ip_address
              ? t('settings.activeSessions.expiresWithIp', {
                  expiresAt: formatUtcDate(session.expires_at, uiLocale),
                  ipAddress: session.ip_address,
                })
              : t('settings.activeSessions.expires', {
                  expiresAt: formatUtcDate(session.expires_at, uiLocale),
                })}
          </p>
          {session.user_agent ? (
            <p className='break-words text-xs text-muted-foreground'>{session.user_agent}</p>
          ) : null}
        </div>
        <Button
          variant={session.is_current ? 'destructive' : 'outline'}
          size='sm'
          onClick={() => onSignOut(session)}
          loading={loading}
          disabled={loading}
          data-pw='active-session-sign-out-button'
        >
          {t('settings.activeSessions.signOut')}
        </Button>
      </div>
    </li>
  )
}
