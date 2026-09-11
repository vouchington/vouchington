'use client'

import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useLoadingIds } from '@/hooks/use-loading-ids'
import {
  createMySpendingCategory,
  deleteMySpendingCategory,
  updateMySpendingCategory,
} from '@/lib/api/client'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError from '@/lib/on-error'
import { onSuccess } from '@/lib/on-error/on-success'
import { majorUnitsInputValue } from '@/lib/money'
import type { SpendingCategory } from '@/types/my'
import { parseMajorUnitMoneyDraft } from '@/lib/money-input-draft'
import type { CurrencyCode, Money } from '@ts-shared/money'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import type { EditForm } from './category-list'
import { buildSpendingCategoryUpdatePayload } from './categories-state'
import type { SpendingFrequency } from './frequency-select'
type ManagementOptions = {
  categories: SpendingCategory[]
  setDeletedIds: Dispatch<SetStateAction<Set<string>>>
  setUpserts: Dispatch<SetStateAction<Map<string, SpendingCategory>>>
}
function parseAmount(amount: string, currency: CurrencyCode, locale: string): Money | undefined {
  const parsed = parseMajorUnitMoneyDraft(amount, currency, locale)
  return parsed.accepted ? (parsed.money ?? undefined) : undefined
}
export function useSpendingCategoryManagement({
  categories,
  setDeletedIds,
  setUpserts,
}: ManagementOptions) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const { loadingIds, runWithLoadingId } = useLoadingIds()
  const activeMutationsRef = useRef(new Set<string>())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [newCategoryId, setNewCategoryId] = useState<string | null>(null)
  const [newCategoryLabel, setNewCategoryLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newCurrency, setNewCurrency] = useState<CurrencyCode>('usd')
  const [newFrequency, setNewFrequency] = useState<SpendingFrequency>('monthly')
  const [newNote, setNewNote] = useState('')
  const [editForm, setEditForm] = useState<EditForm>({
    amount: '',
    currency: 'usd',
    spending_frequency: 'monthly',
    note: '',
  })
  function reportInvalidAmount() {
    onError(new Error('Please enter a valid amount'), {
      fallback: t('extracted.my.spendingCategoriesManager.pleaseEnterAValidAmount_010f1dd6'),
      skipSentry: true,
    })
  }
  async function handleAdd() {
    if (activeMutationsRef.current.has('add')) return
    if (!newCategoryId) {
      onError(new Error('Please select a spending category'), {
        fallback: t(
          'extracted.my.spendingCategoriesManager.pleaseSelectASpendingCategory_17c434e1',
        ),
        skipSentry: true,
      })
      return
    }
    const amount = parseAmount(newAmount, newCurrency, uiLocale)
    if (!amount) return reportInvalidAmount()
    try {
      activeMutationsRef.current.add('add')
      await runWithLoadingId('add', async () => {
        const { spending_category: category } = await createMySpendingCategory({
          spending_category_id: newCategoryId,
          amount,
          spending_frequency: newFrequency,
          note: newNote || undefined,
        })
        setUpserts(previous => new Map(previous).set(category.id, category))
        setNewCategoryId(null)
        setNewCategoryLabel('')
        setNewAmount('')
        setNewFrequency('monthly')
        setNewNote('')
        onSuccess(t('extracted.my.spendingCategoriesManager.spendingCategoryAdded_e64ee56b'))
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.spendingCategoriesManager.failedToAddSpendingCategory_0809dda4'),
      })
    } finally {
      activeMutationsRef.current.delete('add')
    }
  }
  function startEdit(category: SpendingCategory) {
    setEditingId(category.id)
    setEditForm({
      amount: majorUnitsInputValue(category.amount),
      currency: category.amount.currency,
      spending_frequency: category.spending_frequency,
      note: category.note ?? '',
    })
  }
  async function handleSave(id: string) {
    if (activeMutationsRef.current.has(id)) return
    const amount = parseAmount(editForm.amount, editForm.currency, uiLocale)
    if (!amount) return reportInvalidAmount()
    const original = categories.find(category => category.id === id)
    const note = editForm.note || null
    const payload = buildSpendingCategoryUpdatePayload(
      original,
      amount,
      editForm.spending_frequency,
      note,
    )
    if (!payload) return setEditingId(null)
    try {
      activeMutationsRef.current.add(id)
      await runWithLoadingId(id, async () => {
        const { spending_category: updated } = await updateMySpendingCategory(id, payload)
        setUpserts(previous => new Map(previous).set(id, updated))
        setEditingId(null)
        onSuccess(t('extracted.my.spendingCategoriesManager.spendingCategoryUpdated_60051d4b'))
      })
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.my.spendingCategoriesManager.failedToUpdateSpendingCategory_be2766c6',
        ),
      })
    } finally {
      activeMutationsRef.current.delete(id)
    }
  }

  async function handleDelete(id: string) {
    if (activeMutationsRef.current.has(id)) return
    activeMutationsRef.current.add(id)
    const category = categories.find(item => item.id === id)
    setDeletedIds(previous => new Set(previous).add(id))
    try {
      await runWithLoadingId(id, async () => {
        await deleteMySpendingCategory(id)
        setUpserts(previous => {
          const next = new Map(previous)
          next.delete(id)
          return next
        })
        onSuccess(t('extracted.my.spendingCategoriesManager.spendingCategoryRemoved_3882b8fc'))
      })
    } catch (error) {
      setDeletedIds(previous => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
      if (category) setUpserts(previous => new Map(previous).set(id, category))
      onError(error, {
        fallback: t(
          'extracted.my.spendingCategoriesManager.failedToRemoveSpendingCategory_a217ac9b',
        ),
      })
    } finally {
      activeMutationsRef.current.delete(id)
    }
  }

  return {
    confirmingDeleteId,
    editForm,
    editingId,
    handleAdd,
    handleDelete,
    handleSave,
    loadingIds,
    newAmount,
    newCurrency,
    newCategoryId,
    newCategoryLabel,
    newFrequency,
    newNote,
    setConfirmingDeleteId,
    setEditForm,
    setEditingId,
    setNewAmount,
    setNewCurrency,
    setNewCategoryId,
    setNewCategoryLabel,
    setNewFrequency,
    setNewNote,
    startEdit,
  }
}
