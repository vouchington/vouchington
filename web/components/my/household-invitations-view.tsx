'use client'

import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAutocomplete } from '@/components/users/user-autocomplete'
import { UserLink } from '@/components/users/user-link'
import type { HouseholdInvitation } from '@/types/household-invitations'

export interface HouseholdInvitationsViewProps {
  kind: 'sent' | 'received'
  invitations: HouseholdInvitation[]
  pending: boolean
  loadError: boolean
  hasMore: boolean
  loadingMore: boolean
  pageError: boolean
  selectedUserId: string | null
  relationship: string
  formKey?: number
  usernames?: Readonly<Record<string, string>>
  onSelectUser: (id: string, username: string) => void
  onRelationshipChange: (value: string) => void
  onInvite: () => void
  onResolve: (invitation: HouseholdInvitation, action: 'accept' | 'decline' | 'revoke') => void
  onRetry: () => void
  onLoadMore: () => void
}

export function HouseholdInvitationsView(props: HouseholdInvitationsViewProps) {
  const formId = useId()
  const sent = props.kind === 'sent'
  return (
    <section
      className='space-y-4 rounded-md border p-4'
      data-pw='household-invitations'
    >
      <h2 className='text-lg font-semibold'>
        {sent ? 'Sent invitations' : 'Household invitations'}
      </h2>
      {sent && (
        <form
          className='space-y-3'
          onSubmit={event => {
            event.preventDefault()
            props.onInvite()
          }}
          data-pw='household-invitation-form'
        >
          <Label htmlFor={`${formId}-user`}>Username</Label>
          <UserAutocomplete
            key={props.formKey}
            id={`${formId}-user`}
            value={props.selectedUserId}
            label=''
            placeholder='Search by username'
            ariaLabel='Username'
            clearOnTextEdit
            onChange={props.onSelectUser}
            disabled={props.pending}
            dataPw={{ input: 'household-invitation-user' }}
          />
          <div className='space-y-1'>
            <Label htmlFor={`${formId}-relationship`}>Relationship (optional)</Label>
            <Input
              id={`${formId}-relationship`}
              value={props.relationship}
              onChange={event => props.onRelationshipChange(event.target.value)}
              maxLength={64}
              disabled={props.pending}
              data-pw='household-invitation-relationship'
            />
          </div>
          <Button
            type='submit'
            disabled={props.pending || !props.selectedUserId}
          >
            Send invitation
          </Button>
        </form>
      )}
      {props.loadError ? (
        <div
          className='space-y-2'
          role='alert'
        >
          <p>Invitations could not be loaded.</p>
          <Button
            variant='outline'
            onClick={props.onRetry}
            disabled={props.pending}
          >
            Retry
          </Button>
        </div>
      ) : props.invitations.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No pending invitations.</p>
      ) : (
        <ul className='space-y-3'>
          {props.invitations.map(invitation => (
            <li
              key={invitation.id}
              className='space-y-2 rounded-md border p-3'
              data-pw='household-invitation-row'
            >
              <p className='text-sm'>
                {sent ? 'Invitation for ' : 'Invited by '}
                <UserLink
                  user={userFor(
                    sent ? invitation.invited_user_id : invitation.invited_by_id,
                    props.usernames,
                  )}
                  className='underline'
                >
                  {usernameLabel(
                    sent ? invitation.invited_user_id : invitation.invited_by_id,
                    props.usernames,
                  )}
                </UserLink>
              </p>
              <p className='break-all text-sm text-muted-foreground'>
                Household: <span>{invitation.household_id}</span>
              </p>
              {invitation.relationship && (
                <p className='text-sm text-muted-foreground'>{invitation.relationship}</p>
              )}
              <div className='flex gap-2'>
                {sent ? (
                  <Button
                    variant='outline'
                    disabled={props.pending}
                    onClick={() => props.onResolve(invitation, 'revoke')}
                  >
                    Revoke invitation
                  </Button>
                ) : (
                  <>
                    <Button
                      disabled={props.pending}
                      onClick={() => props.onResolve(invitation, 'accept')}
                    >
                      Accept
                    </Button>
                    <Button
                      variant='outline'
                      disabled={props.pending}
                      onClick={() => props.onResolve(invitation, 'decline')}
                    >
                      Decline
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!props.loadError && (props.hasMore || props.pageError) && (
        <Button
          variant='outline'
          disabled={props.pending || props.loadingMore}
          onClick={props.onLoadMore}
        >
          {props.pageError
            ? 'Retry loading invitations'
            : props.loadingMore
              ? 'Loading...'
              : 'Load more invitations'}
        </Button>
      )}
    </section>
  )
}

function userFor(id: string, usernames: Readonly<Record<string, string>> = {}) {
  return { id, username: usernames[id] ?? null }
}

/** Never expose an opaque id as link text when no username has been resolved. */
function usernameLabel(id: string, usernames: Readonly<Record<string, string>> = {}) {
  return usernames[id] ? `@${usernames[id]}` : 'A Voucha member'
}
