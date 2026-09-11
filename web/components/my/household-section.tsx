import { Button } from '@/components/ui/button'
import type { HouseholdMembership, HouseholdSection } from '@/types/my'

interface Props {
  confirmingKey: string | null
  onCancelRemove: () => void
  onConfirmRemove: (section: HouseholdSection, membership: HouseholdMembership) => void
  onRequestRemove: (requestKey: string) => void
  onRetry: () => void
  retrying: boolean
  section: HouseholdSection
  sharedCount: number
  sharedIndex: number
}

function memberName(membership: HouseholdMembership) {
  const username = membership.individual.username?.trim()
  return username ? `@${username}` : 'Household member'
}

export function HouseholdSectionView({
  confirmingKey,
  onCancelRemove,
  onConfirmRemove,
  onRequestRemove,
  onRetry,
  retrying,
  section,
  sharedCount,
  sharedIndex,
}: Props) {
  const title = section.isOwner
    ? 'Your household'
    : sharedCount > 1
      ? `Shared household ${sharedIndex}`
      : 'Shared household'

  return (
    <section
      className='space-y-3 rounded-md border p-4'
      data-pw='household-section'
    >
      <div>
        <h2
          className='text-lg font-semibold'
          data-pw='household-members-heading'
        >
          {title}
        </h2>
        {!section.isOwner && (
          <p
            className='text-sm text-muted-foreground'
            data-pw='household-read-only-copy'
          >
            You can view this household. Only its owner can manage members.
          </p>
        )}
      </div>

      {section.membershipLoadError && (
        <div className='space-y-2'>
          <p className='text-sm text-destructive'>Household members could not be loaded.</p>
          <Button
            size='sm'
            variant='outline'
            onClick={onRetry}
            data-pw='household-members-retry'
          >
            {retrying ? 'Retrying...' : 'Retry'}
          </Button>
        </div>
      )}
      {!section.membershipLoadError && section.memberships.length === 0 ? (
        <p
          className='text-sm text-muted-foreground'
          data-pw='household-members-empty'
        >
          No members yet.
        </p>
      ) : section.memberships.length > 0 ? (
        <ul className='space-y-2'>
          {section.memberships.map(membership => {
            const requestKey = `${section.household.id}:${membership.id}`
            return (
              <li
                key={membership.id}
                className='flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between'
                data-pw='household-member-row'
              >
                <div>
                  <p
                    className='text-sm font-medium'
                    data-pw='household-member-name'
                  >
                    {memberName(membership)}
                  </p>
                  {membership.relationship?.trim() && (
                    <span className='rounded bg-secondary px-1.5 py-0.5 text-xs'>
                      {membership.relationship.trim()}
                    </span>
                  )}
                </div>
                {section.isOwner &&
                  (confirmingKey === requestKey ? (
                    <div
                      className='flex flex-wrap gap-2'
                      data-pw='household-remove-confirmation'
                    >
                      <span className='self-center text-sm text-destructive'>Remove member?</span>
                      <Button
                        size='sm'
                        variant='destructive'
                        onClick={() => onConfirmRemove(section, membership)}
                        data-pw='household-remove-confirm'
                      >
                        Confirm
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={onCancelRemove}
                        data-pw='household-remove-cancel'
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => onRequestRemove(requestKey)}
                      data-pw='household-remove'
                    >
                      Remove
                    </Button>
                  ))}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
