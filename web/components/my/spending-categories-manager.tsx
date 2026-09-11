'use client'

import { useMemo, useState } from 'react'
import { AddCategoryForm } from './spending-categories-manager/add-category-form'
import { CategoryListPagination } from './spending-categories-manager/category-list-pagination'
import {
  mergeSpendingCategoryPages,
  normalizeSpendingCategoryPage,
  type SpendingCategoriesManagerProps,
} from './spending-categories-manager/categories-state'
import { useSpendingCategoryManagement } from './spending-categories-manager/use-spending-category-management'
import { useSpendingCategoryPagination } from './spending-categories-manager/use-spending-category-pagination'
import type { SpendingCategory } from '@/types/my'

export function SpendingCategoriesManager({
  initialData,
  initialSpendingCategories,
}: SpendingCategoriesManagerProps) {
  const normalizedInitialData = useMemo(
    () =>
      normalizeSpendingCategoryPage(initialData ?? { results: initialSpendingCategories ?? [] }),
    [initialData, initialSpendingCategories],
  )
  const pagination = useSpendingCategoryPagination(normalizedInitialData)
  const [upserts, setUpserts] = useState(new Map<string, SpendingCategory>())
  const [deletedIds, setDeletedIds] = useState(new Set<string>())
  const categories = mergeSpendingCategoryPages(pagination.pages, { upserts, deletedIds })
  const management = useSpendingCategoryManagement({
    categories,
    setDeletedIds,
    setUpserts,
  })
  const handleStartEdit = management.startEdit
  return (
    <div
      className='space-y-4'
      data-pw='spending-categories-manager'
    >
      <CategoryListPagination
        pagination={pagination}
        categories={categories}
        confirmingDeleteId={management.confirmingDeleteId}
        editForm={management.editForm}
        editingId={management.editingId}
        loadingIds={management.loadingIds}
        onDelete={management.handleDelete}
        onSave={management.handleSave}
        onStartEdit={handleStartEdit}
        setConfirmingDeleteId={management.setConfirmingDeleteId}
        setEditForm={management.setEditForm}
        setEditingId={management.setEditingId}
      />
      <AddCategoryForm
        loading={management.loadingIds.has('add')}
        newAmount={management.newAmount}
        newCurrency={management.newCurrency}
        newCategoryId={management.newCategoryId}
        newCategoryLabel={management.newCategoryLabel}
        newFrequency={management.newFrequency}
        newNote={management.newNote}
        onAdd={management.handleAdd}
        setNewAmount={management.setNewAmount}
        setNewCurrency={management.setNewCurrency}
        setNewCategoryId={management.setNewCategoryId}
        setNewCategoryLabel={management.setNewCategoryLabel}
        setNewFrequency={management.setNewFrequency}
        setNewNote={management.setNewNote}
      />
    </div>
  )
}
