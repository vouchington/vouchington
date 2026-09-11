'use client'

import { useRef, useState } from 'react'
import { useLoadingIds } from '@/hooks/use-loading-ids'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import {
  createMyRewardsProgramStatus,
  deleteMyRewardsProgramStatus,
  updateMyRewardsProgramStatus,
} from '@/lib/api/client'
import onError from '@/lib/on-error'
import { onSuccess } from '@/lib/on-error/on-success'
import { AddStatusForm } from './rewards-program-statuses-manager/add-status-form'
import { StatusList } from './rewards-program-statuses-manager/status-list'
import { mergeRewardsProgramStatusPages } from './rewards-program-statuses-manager/statuses-state'

import type { ListResponse } from '@/types/api-responses'
import type { RewardsProgramStatus } from '@/types/my'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  initialPage: ListResponse<RewardsProgramStatus>
}

export function RewardsProgramStatusesManager({ initialPage }: Props) {
  const t = useTranslations()
  const pagination = usePaginatedList(initialPage, '/api/v1/my/rewards-program-statuses', {
    limit: 25,
  })
  const [upserts, setUpserts] = useState(new Map<string, RewardsProgramStatus>())
  const [deletedIds, setDeletedIds] = useState(new Set<string>())
  const statuses = mergeRewardsProgramStatusPages(pagination.pages, upserts, deletedIds)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const { loadingIds, runWithLoadingId } = useLoadingIds()

  const [newStatusId, setNewStatusId] = useState<string | null>(null)
  const [newStatusLabel, setNewStatusLabel] = useState('')

  const [editForm, setEditForm] = useState({
    since: '',
    until: '',
  })

  const activeMutationIds = useRef(new Set<string>())

  async function handleAdd(statusId: string) {
    if (activeMutationIds.current.has('add')) return
    activeMutationIds.current.add('add')
    try {
      await runWithLoadingId('add', async () => {
        const { rewards_program_status: status } = await createMyRewardsProgramStatus({
          rewards_program_status_id: statusId,
        })
        setUpserts(previous => new Map(previous).set(status.id, status))
        setDeletedIds(previous => {
          const next = new Set(previous)
          next.delete(status.id)
          return next
        })
        setNewStatusId(null)
        setNewStatusLabel('')
        onSuccess(t('extracted.my.rewardsProgramStatusesManager.statusAdded_f8b22451'))
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.rewardsProgramStatusesManager.failedToAddStatus_1388f323'),
      })
    } finally {
      activeMutationIds.current.delete('add')
    }
  }

  function startEdit(status: RewardsProgramStatus) {
    setEditingId(status.id)
    setEditForm({
      since: status.since ?? '',
      until: status.until ?? '',
    })
  }

  async function handleSave(id: string) {
    if (activeMutationIds.current.has(id)) return
    const original = statuses.find(s => s.id === id)
    const payload: Record<string, string | null> = {}
    if (!original || (editForm.since || null) !== original.since)
      payload.since = editForm.since || null
    if (!original || (editForm.until || null) !== original.until)
      payload.until = editForm.until || null
    if (Object.keys(payload).length === 0) {
      setEditingId(null)
      return
    }
    const effectiveSince = 'since' in payload ? payload.since : original?.since
    const effectiveUntil = 'until' in payload ? payload.until : original?.until
    if (effectiveSince && effectiveUntil && effectiveSince > effectiveUntil) {
      onError(new Error('Since must be before until'), {
        fallback: t('extracted.my.rewardsProgramStatusesManager.sinceMustBeBeforeUntil_a4745364'),
        skipSentry: true,
      })
      return
    }
    try {
      activeMutationIds.current.add(id)
      await runWithLoadingId(id, async () => {
        const { rewards_program_status: updated } = await updateMyRewardsProgramStatus(id, payload)
        setUpserts(previous => new Map(previous).set(id, updated))
        setEditingId(currentEditingId => (currentEditingId === id ? null : currentEditingId))
        onSuccess(t('extracted.my.rewardsProgramStatusesManager.statusUpdated_b8220be6'))
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.rewardsProgramStatusesManager.failedToUpdateStatus_9e93be01'),
      })
    } finally {
      activeMutationIds.current.delete(id)
    }
  }

  async function handleDelete(id: string) {
    if (activeMutationIds.current.has(id)) return
    activeMutationIds.current.add(id)
    const status = statuses.find(candidate => candidate.id === id)
    setDeletedIds(previous => new Set(previous).add(id))
    try {
      await runWithLoadingId(id, async () => {
        await deleteMyRewardsProgramStatus(id)
        setUpserts(previous => {
          const next = new Map(previous)
          next.delete(id)
          return next
        })
        onSuccess(t('extracted.my.rewardsProgramStatusesManager.statusRemoved_ce6378df'))
      })
    } catch (error) {
      setDeletedIds(previous => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
      if (status) setUpserts(previous => new Map(previous).set(id, status))
      onError(error, {
        fallback: t('extracted.my.rewardsProgramStatusesManager.failedToRemoveStatus_9bb59413'),
      })
    } finally {
      activeMutationIds.current.delete(id)
    }
  }

  const handleLoadMore = pagination.loadMore
  return (
    <div
      className='space-y-4'
      data-pw='rewards-program-statuses-manager'
    >
      <InfiniteScroll
        hasNextPage={pagination.hasNextPage}
        endCursor={pagination.endCursor}
        onLoadMore={handleLoadMore}
        loadingMore={pagination.loadingMore}
        fetchError={pagination.fetchError}
        clearError={pagination.clearError}
        resetKey={pagination.resetKey}
      >
        <StatusList
          confirmingDeleteId={confirmingDeleteId}
          editForm={editForm}
          editingId={editingId}
          loadingIds={loadingIds}
          statuses={statuses}
          onDelete={handleDelete}
          onSave={handleSave}
          onStartEdit={startEdit}
          setConfirmingDeleteId={setConfirmingDeleteId}
          setEditForm={setEditForm}
          setEditingId={setEditingId}
        />
      </InfiniteScroll>

      <AddStatusForm
        loading={loadingIds.has('add')}
        newStatusId={newStatusId}
        newStatusLabel={newStatusLabel}
        onAdd={handleAdd}
        setNewStatusId={setNewStatusId}
        setNewStatusLabel={setNewStatusLabel}
      />
    </div>
  )
}
