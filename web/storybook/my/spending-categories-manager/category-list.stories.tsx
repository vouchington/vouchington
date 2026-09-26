import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CategoryList } from '@/components/my/spending-categories-manager/category-list'
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

const editForm = {
  amount: '600.00',
  currency: 'usd' as const,
  spending_frequency: 'monthly' as const,
  note: '',
}

export const WithCategories: Story = {
  render: () => (
    <StoryFrame>
      <CategoryList
        categories={categories}
        confirmingDeleteId={null}
        editForm={editForm}
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

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <CategoryList
        categories={[]}
        confirmingDeleteId={null}
        editForm={editForm}
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
