import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  CategoryList,
  type EditForm,
} from '@/components/my/spending-categories-manager/category-list'
import { StoryFrame } from '@/storybook/story-frame'
import type { SpendingCategory } from '@/types/my'

const meta = {
  title: 'My/Category List',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const categories: SpendingCategory[] = [
  {
    id: 'spend-groceries',
    spending_category_id: 'topic-groceries',
    amount: { amount: 60_000, currency: 'usd' },
    spending_frequency: 'monthly',
    note: 'Weekly supermarket runs.',
    spending_category: { id: 'topic-groceries', name: 'Groceries', slug: 'groceries' },
  },
  {
    id: 'spend-dining',
    spending_category_id: 'topic-dining',
    amount: { amount: 25_000, currency: 'usd' },
    spending_frequency: 'monthly',
    note: 'Restaurants that earn 3x on Sapphire Reserve.',
    spending_category: { id: 'topic-dining', name: 'Dining', slug: 'dining' },
  },
]

const emptyEditForm: EditForm = {
  amount: '600.00',
  currency: 'usd',
  spending_frequency: 'monthly',
  note: '',
}

function CategoryRows() {
  const [rows, setRows] = useState(categories)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm)
  return (
    <CategoryList
      categories={rows}
      confirmingDeleteId={confirmingDeleteId}
      editForm={editForm}
      editingId={editingId}
      loadingIds={new Set()}
      onDelete={id => setRows(current => current.filter(row => row.id !== id))}
      onSave={id => {
        setRows(current =>
          current.map(row => (row.id === id ? { ...row, note: editForm.note || null } : row)),
        )
        setEditingId(null)
      }}
      onStartEdit={category => {
        setEditingId(category.id)
        setEditForm({
          amount: '600.00',
          currency: 'usd',
          spending_frequency: category.spending_frequency,
          note: category.note ?? '',
        })
      }}
      setConfirmingDeleteId={setConfirmingDeleteId}
      setEditForm={setEditForm}
      setEditingId={setEditingId}
    />
  )
}

export const WithCategories: Story = {
  render: () => (
    <StoryFrame>
      <CategoryRows />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <CategoryList
        categories={[]}
        confirmingDeleteId={null}
        editForm={emptyEditForm}
        editingId={null}
        loadingIds={new Set()}
        onDelete={() => {}}
        onSave={() => {}}
        onStartEdit={() => {}}
        setConfirmingDeleteId={() => {}}
        setEditForm={() => {}}
        setEditingId={() => {}}
      />
    </StoryFrame>
  ),
}
