'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { searchUsersExcluding } from '@/components/shared/search-users-excluding'
import type { UserSearchResult } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

type ParticipantAddPolicy = 'owner_only' | 'all_members'

export function ParticipantAddForm({
  existingUserIds,
  onAdd,
}: {
  existingUserIds: ReadonlySet<string>
  onAdd: (user: UserSearchResult) => Promise<void> | void
}) {
  const t = useTranslations()
  const [showAddForm, setShowAddForm] = useState(false)

  async function searchNonMembers(query: string, signal: AbortSignal) {
    return searchUsersExcluding(query, existingUserIds, { signal })
  }

  if (!showAddForm) {
    return (
      <Button
        size='sm'
        variant='outline'
        data-pw='add-participant-button'
        onClick={() => setShowAddForm(true)}
      >
        {t('extracted.messages.participantsPanel.addParticipant_464c355c')}
      </Button>
    )
  }

  return (
    <div className='space-y-2'>
      <EntityAutocomplete<UserSearchResult>
        search={searchNonMembers}
        getKey={u => u.id}
        renderItem={u => <span>{u.username ? `@${u.username}` : u.id}</span>}
        onSelect={(user, { setQuery }) => {
          setQuery('')
          setShowAddForm(false)
          void onAdd(user)
        }}
        clearResultsOnSelect
        placeholder={t('extracted.messages.participantsPanel.searchUsers_02b756f1')}
        ariaLabel={t('extracted.messages.participantsPanel.addParticipant_464c355c')}
        emptyText={t('extracted.messages.participantsPanel.noUsersFound_bf1e104f')}
        dataPw={{ input: 'add-participant-input', item: 'add-participant-item' }}
      />
      <Button
        data-pw='participants-panel-cancel-add'
        size='sm'
        variant='outline'
        onClick={() => setShowAddForm(false)}
      >
        {t('extracted.messages.participantsPanel.cancel_19766ed6')}
      </Button>
    </div>
  )
}

export function ParticipantPolicyControls({
  policy,
  updating,
  onPolicyChange,
}: {
  policy: ParticipantAddPolicy
  updating: boolean
  onPolicyChange: (policy: ParticipantAddPolicy) => Promise<void>
}) {
  const t = useTranslations()
  return (
    <div className='space-y-2'>
      <p className='text-xs font-medium text-muted-foreground'>
        {t('extracted.messages.participantsPanel.whoCanAddParticipants_2281bfc0')}
      </p>
      <div className='flex gap-2'>
        <Button
          size='sm'
          variant={policy === 'owner_only' ? 'default' : 'outline'}
          data-pw='policy-owner-only'
          disabled={updating}
          onClick={() => onPolicyChange('owner_only').catch(Sentry.captureException)}
        >
          {t('extracted.messages.participantsPanel.ownerOnly_55a834c8')}
        </Button>
        <Button
          size='sm'
          variant={policy === 'all_members' ? 'default' : 'outline'}
          data-pw='policy-all-members'
          disabled={updating}
          onClick={() => onPolicyChange('all_members').catch(Sentry.captureException)}
        >
          {t('extracted.messages.participantsPanel.allMembers_3d6fe3e7')}
        </Button>
      </div>
    </div>
  )
}
