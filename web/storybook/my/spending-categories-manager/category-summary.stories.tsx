import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CategorySummary } from '@/components/my/spending-categories-manager/category-summary'
import { StoryFrame } from '@/storybook/story-frame'
import type { SpendingCategory } from '@/types/my'

const meta = {
  title: 'My/Category Summary',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const groceries: SpendingCategory = {
  id: 'spend-groceries',
  spending_category_id: 'topic-groceries',
  amount: { amount: 60_000, currency: 'usd' },
  spending_frequency: 'monthly',
  note: 'Weekly supermarket runs.',
  owner_type: 'individual',
  can_manage: true,
  spending_category: { id: 'topic-groceries', name: 'Groceries', slug: 'groceries' },
}

const householdGroceries: SpendingCategory = {
  ...groceries,
  id: 'spend-household-groceries',
  owner_type: 'household',
  can_manage: false,
  note: 'Shared grocery budget for the household.',
}

export const Manageable: Story = {
  render: () => (
    <StoryFrame>
      <CategorySummary
        category={groceries}
        confirmingDeleteId={null}
        loading={false}
        onCancelDelete={() => {}}
        onConfirmDelete={() => {}}
        onStartDelete={() => {}}
        onStartEdit={() => {}}
      />
    </StoryFrame>
  ),
}

export const HouseholdReadOnly: Story = {
  render: () => (
    <StoryFrame>
      <CategorySummary
        category={householdGroceries}
        confirmingDeleteId={null}
        loading={false}
        onCancelDelete={() => {}}
        onConfirmDelete={() => {}}
        onStartDelete={() => {}}
        onStartEdit={() => {}}
      />
    </StoryFrame>
  ),
}
