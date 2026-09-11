/* oxlint-disable max-lines, react-doctor/prefer-useReducer -- established component API; locale-aware exact parsing adds a small amount of state wiring */
'use client'

import { useMemo, useRef, useState } from 'react'
import { useLoadingIds } from '@/hooks/use-loading-ids'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import {
  createMyRewardsProgramPointValuation,
  updateMyRewardsProgramPointValuation,
} from '@/lib/api/client'
import onError from '@/lib/on-error'
import { onSuccess } from '@/lib/on-error/on-success'
import { AddValuationForm } from './point-valuations-manager/add-valuation-form'
import { deletePointValuationWithMutationGuard } from './point-valuations-manager/delete-point-valuation'
import {
  pointValuationEditForm,
  pointValuationUpdatePayload,
  parsePointValuationInput,
  type PointValuationEditForm,
} from './point-valuations-manager/edit-form'
import { ValuationList } from './point-valuations-manager/valuation-list'
import {
  mergePointValuationPages,
  normalizePointValuationPage,
  type PointValuationPageInput,
} from './point-valuations-manager/valuations-state'
import type { PointValuation } from '@/types/my'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { CurrencyCode, ScaledMoney } from '@ts-shared/money'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'

export function PointValuationsManager({ initialData }: { initialData: PointValuationPageInput }) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const normalizedInitialData = useMemo(
    () => normalizePointValuationPage(initialData),
    [initialData],
  )
  const pagination = usePaginatedList(
    normalizedInitialData,
    '/api/v1/my/rewards-program-point-valuations',
    { limit: 25 },
  )
  const handleLoadMore = pagination.loadMore
  const [upserts, setUpserts] = useState(new Map<string, PointValuation>())
  const [deletedIds, setDeletedIds] = useState(new Set<string>())
  const valuations = mergePointValuationPages(pagination.pages, upserts, deletedIds)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const { loadingIds, runWithLoadingId } = useLoadingIds()
  const activeMutationsRef = useRef(new Set<string>())
  const [newProgramId, setNewProgramId] = useState<string | null>(null)
  const [newProgramLabel, setNewProgramLabel] = useState('')
  const [newValuePerPoint, setNewValuePerPoint] = useState('')
  const [newCurrency, setNewCurrency] = useState<CurrencyCode>('usd')
  const [newNote, setNewNote] = useState('')
  const [editForm, setEditForm] = useState<PointValuationEditForm>({
    value_per_point: '',
    currency: 'usd' as CurrencyCode,
    note: '',
  })
  async function handleAdd() {
    if (activeMutationsRef.current.has('add')) return
    if (!newProgramId) {
      onError(new Error('Please select a rewards program'), {
        fallback: t('extracted.my.pointValuationsManager.pleaseSelectARewardsProgram_99889f49'),
        skipSentry: true,
      })
      return
    }
    let valuePerPoint: ScaledMoney
    try {
      valuePerPoint = parsePointValuationInput(newValuePerPoint, newCurrency, uiLocale)
    } catch {
      onError(new Error('Please enter a valid value per point'), {
        fallback: t('extracted.my.pointValuationsManager.pleaseEnterAValidValuePerPoint_67b38bc3'),
        skipSentry: true,
      })
      return
    }
    try {
      activeMutationsRef.current.add('add')
      await runWithLoadingId('add', async () => {
        const { point_valuation: valuation } = await createMyRewardsProgramPointValuation({
          rewards_program_id: newProgramId,
          value_per_point: valuePerPoint,
          note: newNote || undefined,
        })
        setUpserts(prev => new Map(prev).set(valuation.id, valuation))
        setNewProgramId(null)
        setNewProgramLabel('')
        setNewValuePerPoint('')
        setNewNote('')
        onSuccess(t('extracted.my.pointValuationsManager.pointValuationAdded_e529b3a3'))
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.pointValuationsManager.failedToAddPointValuation_f5379775'),
      })
    } finally {
      activeMutationsRef.current.delete('add')
    }
  }
  function startEdit(valuation: PointValuation) {
    setEditingId(valuation.id)
    setEditForm(pointValuationEditForm(valuation))
  }
  async function handleSave(id: string) {
    if (activeMutationsRef.current.has(id)) return
    let valuePerPoint: ScaledMoney
    try {
      valuePerPoint = parsePointValuationInput(
        editForm.value_per_point,
        editForm.currency,
        uiLocale,
      )
    } catch {
      onError(new Error('Please enter a valid value per point'), {
        fallback: t('extracted.my.pointValuationsManager.pleaseEnterAValidValuePerPoint_67b38bc3'),
        skipSentry: true,
      })
      return
    }
    const original = valuations.find(v => v.id === id)
    const note = editForm.note || null
    const payload = pointValuationUpdatePayload(original, valuePerPoint, note)
    if (Object.keys(payload).length === 0) {
      setEditingId(null)
      return
    }
    try {
      activeMutationsRef.current.add(id)
      await runWithLoadingId(id, async () => {
        const { point_valuation: updated } = await updateMyRewardsProgramPointValuation(id, payload)
        setUpserts(prev => new Map(prev).set(id, updated))
        setEditingId(null)
        onSuccess(t('extracted.my.pointValuationsManager.pointValuationUpdated_fd959a9b'))
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.pointValuationsManager.failedToUpdatePointValuation_2a4e566a'),
      })
    } finally {
      activeMutationsRef.current.delete(id)
    }
  }
  async function handleDelete(id: string) {
    await deletePointValuationWithMutationGuard({
      activeIds: activeMutationsRef.current,
      id,
      runWithLoadingId,
      setDeletedIds,
      setUpserts,
      translate: t,
      valuations,
    })
  }
  return (
    <div
      className='space-y-4'
      data-pw='point-valuations-manager'
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
        <ValuationList
          confirmingDeleteId={confirmingDeleteId}
          editForm={editForm}
          editingId={editingId}
          loadingIds={loadingIds}
          valuations={valuations}
          onDelete={handleDelete}
          onSave={handleSave}
          onStartEdit={startEdit}
          setConfirmingDeleteId={setConfirmingDeleteId}
          setEditForm={setEditForm}
          setEditingId={setEditingId}
        />
      </InfiniteScroll>

      <AddValuationForm
        loading={loadingIds.has('add')}
        newValuePerPoint={newValuePerPoint}
        newCurrency={newCurrency}
        newNote={newNote}
        newProgramId={newProgramId}
        newProgramLabel={newProgramLabel}
        onAdd={handleAdd}
        setNewValuePerPoint={setNewValuePerPoint}
        setNewCurrency={setNewCurrency}
        setNewNote={setNewNote}
        setNewProgramId={setNewProgramId}
        setNewProgramLabel={setNewProgramLabel}
      />
    </div>
  )
}
