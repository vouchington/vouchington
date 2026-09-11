import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpendingCategoriesManager } from '@/components/my/spending-categories-manager'
import type { SpendingCategory } from '@/types/my'

const meta = {
  title: 'Design System/Settings/Spending Categories Manager',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const fixtureCategories: SpendingCategory[] = [
  {
    id: 'sc-1',
    spending_category_id: 'cat-1',
    amount: { amount: 15_000, currency: 'usd' },
    spending_frequency: 'monthly',
    note: 'Morning coffee and tea',
    spending_category: {
      id: 'cat-1',
      name: 'Coffee',
      slug: 'coffee',
    },
  },
  {
    id: 'sc-2',
    spending_category_id: 'cat-2',
    amount: { amount: 60_000, currency: 'usd' },
    spending_frequency: 'monthly',
    note: null,
    spending_category: {
      id: 'cat-2',
      name: 'Groceries',
      slug: 'groceries',
    },
  },
  {
    id: 'sc-3',
    spending_category_id: 'cat-3',
    amount: { amount: 3000, currency: 'jpy' },
    spending_frequency: 'annually',
    note: 'Flights and hotels',
    spending_category: {
      id: 'cat-3',
      name: 'Travel',
      slug: 'travel',
    },
    owner_type: 'household',
    can_manage: false,
  },
]

const terminalPageInfo = {
  has_next_page: false,
  start_cursor: null,
  end_cursor: null,
}

export const EmptyState: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <SpendingCategoriesManager initialData={{ results: [], page_info: terminalPageInfo }} />
      </div>
    </main>
  ),
}

export const WithItems: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <SpendingCategoriesManager
          initialData={{ results: fixtureCategories, page_info: terminalPageInfo }}
        />
      </div>
    </main>
  ),
}

export const ReadOnlyHousehold: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <SpendingCategoriesManager initialData={{ results: [fixtureCategories[2]!] }} />
      </div>
    </main>
  ),
}
