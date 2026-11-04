import { useMemo, useState } from 'react'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { Button } from '@/components/ui/button'
import { getClaimantMisuseSummary } from '@/lib/api/client/copyright-notices'
import type { CopyrightClaimantMisuse } from '@/types/copyright-claimant-misuse'

const outcomes = [
  ['notice_withdrawn', 'withdrawn by the notifier'],
  ['notice_rejected', 'rejected on staff review'],
  ['restriction_reversed_by_counter_notice', 'restored after a counter-notice'],
  ['restriction_reversed_by_appeal', 'reversed on appeal'],
] as const

export function CopyrightStaffClaimantMisuse({
  claimantUserId,
  misuse,
}: {
  claimantUserId: string | null
  misuse: CopyrightClaimantMisuse | null
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const receiptTime = useMemo(
    () =>
      new Intl.DateTimeFormat(uiLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      }),
    [uiLocale],
  )
  const [older, setOlder] = useState<CopyrightClaimantMisuse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  if (!misuse || !claimantUserId) {
    return <p className='text-sm text-muted-foreground'>No account is linked to this notifier.</p>
  }
  const windows = [misuse, ...older]
  const last = windows[windows.length - 1]!
  async function loadOlder() {
    if (!claimantUserId || !last.page_info.end_cursor || loading) return
    setLoading(true)
    setError(false)
    try {
      const result = await getClaimantMisuseSummary(claimantUserId, last.page_info.end_cursor)
      setOlder(previous => [...previous, result.claimant_misuse])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }
  return (
    <section className='space-y-2'>
      <h3 className='font-medium'>Notifier history</h3>
      <p className='text-xs text-muted-foreground'>
        Each window shows separate counts; counts are not running totals.
      </p>
      {windows.map((window, index) => {
        const recorded = outcomes.filter(([outcome]) => window[outcome] > 0)
        return (
          <div
            className='space-y-1'
            key={index === 0 ? 'latest' : window.page_info.start_cursor}
          >
            <h4 className='text-sm font-medium'>
              {index === 0 ? 'Latest notices' : `Older notices, window ${index + 1}`}
            </h4>
            <p className='text-sm'>
              {t('copyright.claimantMisuse.noticesInspected', { count: window.notice_count })}
            </p>
            <dl className='text-sm text-muted-foreground'>
              {window.oldest_notice_at && (
                <>
                  <dt>{t('copyright.claimantMisuse.oldestNoticeReceived')}</dt>
                  <dd>
                    <time dateTime={window.oldest_notice_at}>
                      {receiptTime.format(new Date(window.oldest_notice_at))}
                    </time>
                  </dd>
                </>
              )}
              {window.newest_notice_at && (
                <>
                  <dt>{t('copyright.claimantMisuse.newestNoticeReceived')}</dt>
                  <dd>
                    <time dateTime={window.newest_notice_at}>
                      {receiptTime.format(new Date(window.newest_notice_at))}
                    </time>
                  </dd>
                </>
              )}
            </dl>
            {recorded.length === 0 ? (
              <p className='text-sm'>No misuse recorded in this window.</p>
            ) : (
              <ul className='text-sm'>
                {recorded.map(([outcome, label]) => (
                  <li key={outcome}>
                    {window[outcome]} {window[outcome] === 1 ? 'notice' : 'notices'} {label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {error && <p role='alert'>Could not load older notices. Please try again.</p>}
      {last.page_info.has_next_page && (
        <Button
          type='button'
          variant='outline'
          size='sm'
          loading={loading}
          onClick={loadOlder}
        >
          {loading
            ? 'Loading older notices…'
            : error
              ? 'Retry loading older notices'
              : 'Load older notices'}
        </Button>
      )}
      <p className='text-xs text-muted-foreground'>
        Evidence only. Suspending a notifier is a moderator decision.
      </p>
    </section>
  )
}
