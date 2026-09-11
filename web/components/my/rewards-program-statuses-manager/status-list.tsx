'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RewardsProgramStatus } from '@/types/my'
import { StatusSummary } from './status-summary'
import { useTranslations } from '@/lib/i18n/use-translations'

interface EditForm {
  since: string
  until: string
}

interface StatusListProps {
  confirmingDeleteId: string | null
  editForm: EditForm
  editingId: string | null
  loadingIds: Set<string>
  statuses: RewardsProgramStatus[]
  onDelete: (id: string) => void
  onSave: (id: string) => void
  onStartEdit: (status: RewardsProgramStatus) => void
  setConfirmingDeleteId: (id: string | null) => void
  setEditForm: (updater: (form: EditForm) => EditForm) => void
  setEditingId: (id: string | null) => void
}

export function StatusList({
  confirmingDeleteId,
  editForm,
  editingId,
  loadingIds,
  statuses,
  onDelete,
  onSave,
  onStartEdit,
  setConfirmingDeleteId,
  setEditForm,
  setEditingId,
}: StatusListProps) {
  return (
    <ul className='space-y-3'>
      {statuses.map(status => (
        <li
          key={status.id}
          className='rounded-md border p-3 sm:p-4'
        >
          {editingId === status.id ? (
            <StatusEditForm
              editForm={editForm}
              loading={loadingIds.has(status.id)}
              status={status}
              onCancel={() => setEditingId(null)}
              onSave={() => onSave(status.id)}
              setEditForm={setEditForm}
            />
          ) : (
            <StatusSummary
              confirmingDeleteId={confirmingDeleteId}
              loading={loadingIds.has(status.id)}
              status={status}
              onCancelDelete={() => setConfirmingDeleteId(null)}
              onConfirmDelete={() => {
                setConfirmingDeleteId(null)
                onDelete(status.id)
              }}
              onStartDelete={() => setConfirmingDeleteId(status.id)}
              onStartEdit={() => onStartEdit(status)}
            />
          )}
        </li>
      ))}
    </ul>
  )
}

function StatusEditForm({
  editForm,
  loading,
  status,
  onCancel,
  onSave,
  setEditForm,
}: {
  editForm: EditForm
  loading: boolean
  status: RewardsProgramStatus
  onCancel: () => void
  onSave: () => void
  setEditForm: (updater: (form: EditForm) => EditForm) => void
}) {
  const t = useTranslations()
  return (
    <form
      className='space-y-3'
      onSubmit={e => {
        e.preventDefault()
        if (loading) return
        onSave()
      }}
    >
      <p className='font-medium'>{status.rewards_program_status.name}</p>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-1'>
          <Label
            htmlFor={`since-${status.id}`}
            data-pw='rewards-status-since-label'
          >
            {t('extracted.rewardsProgramStatusesManager.statusList.since_98af1ed6')}
          </Label>
          <Input
            id={`since-${status.id}`}
            type='date'
            value={editForm.since}
            onChange={e => setEditForm(f => ({ ...f, since: e.target.value }))}
          />
        </div>
        <div className='space-y-1'>
          <Label
            htmlFor={`until-${status.id}`}
            data-pw='rewards-status-until-label'
          >
            {t('extracted.rewardsProgramStatusesManager.statusList.until_7caf856e')}
          </Label>
          <Input
            id={`until-${status.id}`}
            type='date'
            value={editForm.until}
            onChange={e => setEditForm(f => ({ ...f, until: e.target.value }))}
          />
        </div>
      </div>
      <div className='flex gap-2'>
        <Button
          size='sm'
          type='submit'
          loading={loading}
          disabled={loading}
        >
          {t('extracted.rewardsProgramStatusesManager.statusList.save_1509f561')}
        </Button>
        <Button
          size='sm'
          type='button'
          variant='outline'
          onClick={onCancel}
        >
          {t('extracted.rewardsProgramStatusesManager.statusList.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}
