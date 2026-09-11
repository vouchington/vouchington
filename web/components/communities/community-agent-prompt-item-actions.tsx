import { Button } from '@/components/ui/button'
import { FlaskConical } from 'lucide-react'
import type { CommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'
import type { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  prompt: CommunityAgentPrompt
  isEditing: boolean
  disabled: boolean
  confirmDelete: boolean
  t: ReturnType<typeof useTranslations>
  onSaveEdit: () => void
  onCancelEdit: () => void
  onStartEdit: () => void
  onToggleAllocation: () => void
  onToggleTesting: () => void
  onRequestDelete: () => void
  onDelete: () => void
}

export function CommunityAgentPromptItemActions({
  prompt,
  isEditing,
  disabled,
  confirmDelete,
  t,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onToggleAllocation,
  onToggleTesting,
  onRequestDelete,
  onDelete,
}: Props) {
  return (
    <div className='flex flex-wrap gap-1 shrink-0'>
      {isEditing ? (
        <>
          <Button
            size='touchSm'
            onClick={onSaveEdit}
            disabled={disabled}
          >
            {t('extracted.communities.communityAgentPromptItem.save_1509f561')}
          </Button>
          <Button
            size='touchSm'
            variant='ghost'
            onClick={onCancelEdit}
            disabled={disabled}
          >
            {t('extracted.communities.communityAgentPromptItem.cancel_19766ed6')}
          </Button>
        </>
      ) : (
        <Button
          size='touchSm'
          variant='outline'
          onClick={onStartEdit}
          disabled={disabled}
        >
          {t('extracted.communities.communityAgentPromptItem.edit_464c4ffd')}
        </Button>
      )}
      <Button
        size='touchSm'
        variant='outline'
        onClick={onToggleAllocation}
        disabled={disabled}
      >
        {prompt.slot_allocated ? 'Deallocate' : 'Allocate'}
      </Button>
      <Button
        size='touchSm'
        variant='outline'
        onClick={onToggleTesting}
        disabled={disabled}
      >
        <FlaskConical className='size-4' />
        {t('extracted.communities.communityAgentPromptItem.test_532eaabd')}
      </Button>
      {confirmDelete ? (
        <Button
          size='touchSm'
          variant='destructive'
          onClick={onDelete}
          disabled={disabled}
        >
          {t('extracted.communities.communityAgentPromptItem.confirmDelete_a7f54311')}
        </Button>
      ) : (
        <Button
          size='touchSm'
          variant='ghost'
          onClick={onRequestDelete}
          disabled={disabled}
        >
          {t('extracted.communities.communityAgentPromptItem.delete_e2d0a549')}
        </Button>
      )}
    </div>
  )
}
