'use client'

import { Textarea } from '@/components/ui/textarea'
import {
  updateCommunityAgentPrompt,
  deleteCommunityAgentPrompt,
  allocateCommunityAgentPromptSlot,
  deallocateCommunityAgentPromptSlot,
  type CommunityAgentPrompt,
} from '@/lib/api/client/community-agent-prompts'
import onError, { onSuccess } from '@/lib/on-error'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CommunityAgentPromptStatus } from './community-agent-prompt-status'
import { CommunityAgentPromptTestPanel } from './community-agent-prompt-test-panel'
import { CommunityAgentPromptItemActions } from './community-agent-prompt-item-actions'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  prompt: CommunityAgentPrompt
  communitySlug: string
}

export function CommunityAgentPromptItem({ prompt, communitySlug }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [editText, setEditText] = useState(prompt.prompt)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startPending] = useTransition()
  const [isRefreshing, startRefreshing] = useTransition()

  const disabled = isPending || isRefreshing

  function refresh() {
    startRefreshing(() => router.refresh())
  }

  async function handleSaveEdit() {
    startPending(async () => {
      try {
        await updateCommunityAgentPrompt(communitySlug, prompt.id, { prompt: editText })
        setIsEditing(false)
        onSuccess(t('extracted.communities.communityAgentPromptItem.promptUpdated_8dc48c5d'))
        refresh()
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.communities.communityAgentPromptItem.failedToUpdatePrompt_db9aad3c',
          ),
        })
      }
    })
  }

  async function handleDelete() {
    startPending(async () => {
      try {
        await deleteCommunityAgentPrompt(communitySlug, prompt.id)
        onSuccess(t('extracted.communities.communityAgentPromptItem.promptDeleted_8e7b89b8'))
        refresh()
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.communities.communityAgentPromptItem.failedToDeletePrompt_daaf861e',
          ),
        })
      }
    })
  }

  async function handleToggleAllocation() {
    startPending(async () => {
      try {
        if (prompt.slot_allocated) {
          await deallocateCommunityAgentPromptSlot(communitySlug, prompt.id)
          onSuccess(t('extracted.communities.communityAgentPromptItem.slotDeallocated_b7497458'))
        } else {
          await allocateCommunityAgentPromptSlot(communitySlug, prompt.id)
          onSuccess(t('extracted.communities.communityAgentPromptItem.slotAllocated_417c6c1d'))
        }
        refresh()
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.communities.communityAgentPromptItem.failedToUpdateSlotAllocation_11311ec6',
          ),
        })
      }
    })
  }

  return (
    <div
      className='rounded-md border p-3 space-y-2'
      data-pw='community-agent-prompt-item'
    >
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0 space-y-1 text-sm'>
          <p className='font-mono text-xs text-muted-foreground'>
            {t('extracted.communities.communityAgentPromptItem.idId_12b0460b', { id: prompt.id })}
          </p>
          {isEditing ? (
            <Textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={4}
              disabled={disabled}
              aria-label={t(
                'extracted.communities.communityAgentPromptItem.editAgentPrompt_519966b7',
              )}
            />
          ) : (
            <p className='break-words'>
              {prompt.prompt.slice(0, 80)}
              {prompt.prompt.length > 80 ? '…' : ''}
            </p>
          )}
          <CommunityAgentPromptStatus prompt={prompt} />
        </div>
        <CommunityAgentPromptItemActions
          prompt={prompt}
          isEditing={isEditing}
          disabled={disabled}
          confirmDelete={confirmDelete}
          t={t}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={() => {
            setIsEditing(false)
            setEditText(prompt.prompt)
          }}
          onStartEdit={() => setIsEditing(true)}
          onToggleAllocation={handleToggleAllocation}
          onToggleTesting={() => setIsTesting(value => !value)}
          onRequestDelete={() => setConfirmDelete(true)}
          onDelete={handleDelete}
        />
      </div>
      {isTesting ? (
        <CommunityAgentPromptTestPanel
          prompt={prompt}
          communitySlug={communitySlug}
        />
      ) : null}
    </div>
  )
}
