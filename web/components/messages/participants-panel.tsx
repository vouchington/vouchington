'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { useRouter } from 'next/navigation'
import { UserAvatar } from '@/components/shared/user-avatar'
import { Button } from '@/components/ui/button'
import {
  addConversationParticipant,
  removeConversationParticipant,
  updateConversationParticipantPolicy,
} from '@/lib/api/client/messages'
import onError from '@/lib/on-error'
import type { DirectMessageParticipant } from '@/types/messages'
import type { UserSearchResult } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ParticipantAddForm, ParticipantPolicyControls } from './participant-membership-controls'

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
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  const canAdd = isOwner || policy === 'all_members'
  const existingUserIds = new Set(
    participants.map(p => p.user_id).filter((id): id is string => id !== null),
  )

  async function handleAddParticipant(user: UserSearchResult) {
    try {
      const result = await addConversationParticipant(conversationId, user.id)
      const updated = [...participants, result.participant]
      setParticipants(updated)
      onParticipantsChange?.(updated)
    } catch (err) {
      onError(err, {
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
    } catch (err) {
      onError(err, {
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
    } catch (err) {
      onError(err, {
        fallback: t('extracted.messages.participantsPanel.failedToUpdatePolicy_7ed6e98a'),
      })
    } finally {
      setUpdating(false)
    }
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
                profileImagePlacement={participant.profile_image_placement}
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
                      if (participant.user_id) void handleRemoveParticipant(participant.user_id)
                    }}
                  >
                    {t('extracted.messages.participantsPanel.remove_c3812fc4')}
                  </Button>
                  <Button
                    data-pw='participants-panel-cancel-remove'
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

      {canAdd && (
        <ParticipantAddForm
          existingUserIds={existingUserIds}
          onAdd={handleAddParticipant}
        />
      )}

      {isOwner && (
        <ParticipantPolicyControls
          policy={policy}
          updating={updating}
          onPolicyChange={handlePolicyChange}
        />
      )}

      {!isOwner && (
        <Button
          size='sm'
          variant='outline'
          data-pw='leave-conversation-button'
          onClick={() => handleRemoveParticipant(currentUserId).catch(Sentry.captureException)}
        >
          {t('extracted.messages.participantsPanel.leaveConversation_cd3693d4')}
        </Button>
      )}
    </div>
  )
}
