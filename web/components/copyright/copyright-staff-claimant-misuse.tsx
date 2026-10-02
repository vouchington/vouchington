import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'

const outcomes = [
  ['notice_withdrawn', 'withdrawn by the notifier'],
  ['notice_rejected', 'rejected on staff review'],
  ['restriction_reversed_by_counter_notice', 'restored after a counter-notice'],
  ['restriction_reversed_by_appeal', 'reversed on appeal'],
] as const

/**
 * The notifier's misuse ledger. It is evidence for a moderator deciding on a warned suspension;
 * nothing here suspends anyone.
 */
export function CopyrightStaffClaimantMisuse({
  misuse,
}: {
  misuse: CopyrightStaffQueueItem['claimant']['misuse']
}) {
  if (!misuse) {
    return <p className='text-sm text-muted-foreground'>No account is linked to this notifier.</p>
  }
  const recorded = outcomes.filter(([outcome]) => misuse[outcome] > 0)
  return (
    <section>
      <h3 className='font-medium'>Notifier history</h3>
      {recorded.length === 0 ? (
        <p className='text-sm'>No misuse recorded for this notifier.</p>
      ) : (
        <ul className='text-sm'>
          {recorded.map(([outcome, label]) => (
            <li key={outcome}>
              {misuse[outcome]} {misuse[outcome] === 1 ? 'notice' : 'notices'} {label}
            </li>
          ))}
        </ul>
      )}
      <p className='text-xs text-muted-foreground'>
        Evidence only. Suspending a notifier is a moderator decision.
      </p>
    </section>
  )
}
