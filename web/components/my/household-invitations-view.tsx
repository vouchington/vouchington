'use client'

import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAutocomplete } from '@/components/users/user-autocomplete'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { HouseholdInvitation } from '@/types/household-invitations'
import {
  INVITEE_SLOT,
  INVITER_SLOT,
  OWNER_SLOT,
  renderInvitationMessage,
} from './household-invitation-message'

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
  onSelectUser: (id: string, username: string) => void
  onRelationshipChange: (value: string) => void
  onInvite: () => void
  onResolve: (invitation: HouseholdInvitation, action: 'accept' | 'decline' | 'revoke') => void
  onRetry: () => void
  onLoadMore: () => void
}

export function HouseholdInvitationsView(props: HouseholdInvitationsViewProps) {
  const t = useTranslations()
  const formId = useId()
  const sent = props.kind === 'sent'
  return (
    <section
      className='space-y-4 rounded-md border p-4'
      data-pw='household-invitations'
    >
      <h2 className='text-lg font-semibold'>
        {sent
          ? t('settings.householdInvitations.sentTitle')
          : t('settings.householdInvitations.receivedTitle')}
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
          <Label htmlFor={`${formId}-user`}>{t('settings.householdInvitations.username')}</Label>
          <UserAutocomplete
            key={props.formKey}
            id={`${formId}-user`}
            value={props.selectedUserId}
            label=''
            placeholder={t('settings.householdInvitations.searchByUsername')}
            ariaLabel={t('settings.householdInvitations.username')}
            clearOnTextEdit
            onChange={props.onSelectUser}
            disabled={props.pending}
            dataPw={{ input: 'household-invitation-user' }}
          />
          <div className='space-y-1'>
            <Label htmlFor={`${formId}-relationship`}>
              {t('settings.householdInvitations.relationshipOptional')}
            </Label>
            <Input
              id={`${formId}-relationship`}
              value={props.relationship}
              onChange={event =>
                props.onRelationshipChange(Array.from(event.target.value).slice(0, 64).join(''))
              }
              disabled={props.pending}
              data-pw='household-invitation-relationship'
            />
          </div>
          <Button
            type='submit'
            disabled={props.pending || !props.selectedUserId}
          >
            {t('settings.householdInvitations.sendInvitation')}
          </Button>
        </form>
      )}
      {props.loadError ? (
        <div
          className='space-y-2'
          role='alert'
        >
          <p>{t('settings.householdInvitations.loadFailed')}</p>
          <Button
            variant='outline'
            onClick={props.onRetry}
            disabled={props.pending}
          >
            {t('settings.householdInvitations.retry')}
          </Button>
        </div>
      ) : props.invitations.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('settings.householdInvitations.noPendingInvitations')}
        </p>
      ) : (
        <ul className='space-y-3'>
          {props.invitations.map(invitation => (
            <li
              key={invitation.id}
              className='space-y-2 rounded-md border p-3'
              data-pw='household-invitation-row'
            >
              <p className='text-sm'>
                {sent
                  ? renderInvitationMessage(
                      t('settings.householdInvitations.sentFor', { invitee: INVITEE_SLOT }),
                      { [INVITEE_SLOT]: invitation.invited_user },
                      t('settings.householdInvitations.memberFallback'),
                    )
                  : invitation.invited_by.id === invitation.household_owner.id
                    ? renderInvitationMessage(
                        t('settings.householdInvitations.receivedFromOwner', { owner: OWNER_SLOT }),
                        { [OWNER_SLOT]: invitation.household_owner },
                        t('settings.householdInvitations.memberFallback'),
                      )
                    : renderInvitationMessage(
                        t('settings.householdInvitations.receivedFromOther', {
                          inviter: INVITER_SLOT,
                          owner: OWNER_SLOT,
                        }),
                        {
                          [INVITER_SLOT]: invitation.invited_by,
                          [OWNER_SLOT]: invitation.household_owner,
                        },
                        t('settings.householdInvitations.memberFallback'),
                      )}
              </p>
              {invitation.relationship?.trim() && (
                <p className='text-sm text-muted-foreground'>{invitation.relationship.trim()}</p>
              )}
              <div className='flex gap-2'>
                {sent ? (
                  <Button
                    variant='outline'
                    disabled={props.pending}
                    onClick={() => props.onResolve(invitation, 'revoke')}
                  >
                    {t('settings.householdInvitations.revokeInvitation')}
                  </Button>
                ) : (
                  <>
                    <Button
                      disabled={props.pending}
                      onClick={() => props.onResolve(invitation, 'accept')}
                    >
                      {t('settings.householdInvitations.accept')}
                    </Button>
                    <Button
                      variant='outline'
                      disabled={props.pending}
                      onClick={() => props.onResolve(invitation, 'decline')}
                    >
                      {t('settings.householdInvitations.decline')}
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
            ? t('settings.householdInvitations.retryLoading')
            : props.loadingMore
              ? t('common.loading')
              : t('settings.householdInvitations.loadMore')}
        </Button>
      )}
    </section>
  )
}
