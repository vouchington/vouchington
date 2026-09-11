'use client'

import { Button } from '@/components/ui/button'
import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AddStatusFormProps {
  loading: boolean
  newStatusId: string | null
  newStatusLabel: string
  onAdd: (statusId: string) => void
  setNewStatusId: (id: string | null) => void
  setNewStatusLabel: (label: string) => void
}

export function AddStatusForm({
  loading,
  newStatusId,
  newStatusLabel,
  onAdd,
  setNewStatusId,
  setNewStatusLabel,
}: AddStatusFormProps) {
  const t = useTranslations()
  return (
    <form
      className='space-y-3 rounded-md border p-3 sm:p-4'
      onSubmit={e => {
        e.preventDefault()
        if (loading || !newStatusId) return
        onAdd(newStatusId)
      }}
    >
      <p
        className='text-sm font-medium'
        data-pw='rewards-status-add-heading'
      >
        {t(
          'extracted.rewardsProgramStatusesManager.addStatusForm.addARewardsProgramStatus_77e8d1de',
        )}
      </p>
      <TopicAutocomplete
        value={newStatusId}
        label={newStatusLabel}
        onChange={(id, name) => {
          setNewStatusId(id)
          setNewStatusLabel(name)
          if (id) onAdd(id)
        }}
        topicTypes={['rewards_program_status']}
        placeholder={t(
          'extracted.rewardsProgramStatusesManager.addStatusForm.searchRewardsProgramStatuses_a9286328',
        )}
        disabled={loading}
      />
      <Button
        type='submit'
        size='sm'
        className='sr-only'
        loading={loading}
        disabled={loading || !newStatusId}
        tabIndex={-1}
      >
        {t('extracted.rewardsProgramStatusesManager.addStatusForm.add_9fd728c6')}
      </Button>
    </form>
  )
}
