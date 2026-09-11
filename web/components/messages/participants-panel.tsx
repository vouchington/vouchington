'use client'
/* oxlint-disable max-lines -- component covers the full participant lifecycle */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserAvatar } from '@/components/shared/user-avatar'
import { Button } from '@/components/ui/button'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import {
  addConversationParticipant,
  removeConversationParticipant,
  updateConversationParticipantPolicy,
} from '@/lib/api/client/messages'
import { searchUsersExcluding } from '@/components/shared/search-users-excluding'
import onError from '@/lib/on-error'
import type { DirectMessageParticipant } from '@/types/messages'
import type { UserSearchResult } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  conversationId: string
  currentUserId: string
  isOwner: boolean
  initialParticipants: DirectMessageParticipant[]
  initialParticipantAddPolicy: 'owner_only' | 'all_members'
  onParticipantsChange?: (participants: DirectMessageParticipant[]) => void
}

export function ParticipantsPanel({
  conversationId,
  currentUserId,
  isOwner,
  initialParticipants,
  initialParticipantAddPolicy,
  onParticipantsChange,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [participants, setParticipants] = useState(initialParticipants)
  const [policy, setPolicy] = useState(initialParticipantAddPolicy)
  const [showAddForm, setShowAddForm] = useState(false)
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  const canAdd = isOwner || policy === 'all_members'
  const existingUserIds = new Set(
    participants.map(p => p.user_id).filter((id): id is string => id !== null),
  )

  async function handleAddParticipant(user: UserSearchResult) {
    setShowAddForm(false)
    try {
      const result = await addConversationParticipant(conversationId, user.id)
      const updated = [...participants, result.participant]
      setParticipants(updated)
      onParticipantsChange?.(updated)
    } catch (error) {
      onError(error, {
        fallback: t('extracted.messages.participantsPanel.failedToAddParticipant_a1104c84'),
      })
    }
  }

  async function handleRemoveParticipant(userId: string) {
    setPendingRemoveId(null)
    try {
      await removeConversationParticipant(conversationId, userId)
      const updated = participants.filter(p => p.user_id !== userId)
      setParticipants(updated)
      onParticipantsChange?.(updated)
      if (userId === currentUserId) {
        router.push('/messages')
      }
    } catch (error) {
      onError(error, {
        fallback: t('extracted.messages.participantsPanel.failedToRemoveParticipant_16c63aa8'),
      })
    }
  }

  async function handlePolicyChange(newPolicy: 'owner_only' | 'all_members') {
    if (updating || newPolicy === policy) return
    setUpdating(true)
    try {
      await updateConversationParticipantPolicy(conversationId, newPolicy)
      setPolicy(newPolicy)
    } catch (error) {
      onError(error, {
        fallback: t('extracted.messages.participantsPanel.failedToUpdatePolicy_7ed6e98a'),
      })
    } finally {
      setUpdating(false)
    }
  }

  async function searchNonMembers(query: string, signal: AbortSignal) {
    return searchUsersExcluding(query, existingUserIds, { signal })
  }

  return (
    <div
      data-pw='participants-panel'
      className='space-y-4 p-4'
    >
      <h3 className='text-sm font-semibold'>
        {t('extracted.messages.participantsPanel.participants_0e27279b')}
      </h3>

      <div className='space-y-2'>
        {participants.map(participant => (
          <div
            key={participant.id}
            data-pw='participant-item'
            className='flex items-center justify-between gap-2'
          >
            <div className='flex items-center gap-2'>
              <UserAvatar
                profileImageId={participant.profile_image_id ?? null}
                username={participant.username ?? ''}
                size='sm'
              />
              <div>
                <p className='text-sm'>
                  {participant.username
                    ? `@${participant.username}`
                    : t('extracted.messages.participantsPanel.member_7c968fb7')}
                </p>
                <p className='text-xs capitalize text-muted-foreground'>{participant.role}</p>
              </div>
            </div>
            {isOwner && participant.user_id !== currentUserId ? (
              pendingRemoveId === participant.id ? (
                <div className='flex gap-1'>
                  <Button
                    size='sm'
                    variant='destructive'
                    data-pw='confirm-remove-participant'
                    onClick={() => {
                      if (participant.user_id)
                        handleRemoveParticipant(participant.user_id).catch(() => {})
                    }}
                  >
                    {t('extracted.messages.participantsPanel.remove_c3812fc4')}
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setPendingRemoveId(null)}
                  >
                    {t('extracted.messages.participantsPanel.cancel_19766ed6')}
                  </Button>
                </div>
              ) : (
                <Button
                  size='sm'
                  variant='ghost'
                  data-pw='remove-participant-button'
                  onClick={() => setPendingRemoveId(participant.id)}
                >
                  {t('extracted.messages.participantsPanel.remove_c3812fc4')}
                </Button>
              )
            ) : null}
          </div>
        ))}
      </div>

      {canAdd &&
        (showAddForm ? (
          <div className='space-y-2'>
            <EntityAutocomplete<UserSearchResult>
              search={searchNonMembers}
              getKey={u => u.id}
              renderItem={u => <span>{u.username ? `@${u.username}` : u.id}</span>}
              onSelect={(user, { setQuery }) => {
                setQuery('')
                handleAddParticipant(user).catch(() => {})
              }}
              clearResultsOnSelect
              placeholder={t('extracted.messages.participantsPanel.searchUsers_02b756f1')}
              ariaLabel={t('extracted.messages.participantsPanel.addParticipant_464c355c')}
              emptyText={t('extracted.messages.participantsPanel.noUsersFound_bf1e104f')}
              dataPw={{ input: 'add-participant-input', item: 'add-participant-item' }}
            />
            <Button
              size='sm'
              variant='outline'
              onClick={() => setShowAddForm(false)}
            >
              {t('extracted.messages.participantsPanel.cancel_19766ed6')}
            </Button>
          </div>
        ) : (
          <Button
            size='sm'
            variant='outline'
            data-pw='add-participant-button'
            onClick={() => setShowAddForm(true)}
          >
            {t('extracted.messages.participantsPanel.addParticipant_464c355c')}
          </Button>
        ))}

      {isOwner && (
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
              onClick={() => handlePolicyChange('owner_only').catch(() => {})}
            >
              {t('extracted.messages.participantsPanel.ownerOnly_55a834c8')}
            </Button>
            <Button
              size='sm'
              variant={policy === 'all_members' ? 'default' : 'outline'}
              data-pw='policy-all-members'
              disabled={updating}
              onClick={() => handlePolicyChange('all_members').catch(() => {})}
            >
              {t('extracted.messages.participantsPanel.allMembers_3d6fe3e7')}
            </Button>
          </div>
        </div>
      )}

      {!isOwner && (
        <Button
          size='sm'
          variant='outline'
          data-pw='leave-conversation-button'
          onClick={() => handleRemoveParticipant(currentUserId).catch(() => {})}
        >
          {t('extracted.messages.participantsPanel.leaveConversation_cd3693d4')}
        </Button>
      )}
    </div>
  )
}
