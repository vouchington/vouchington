import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CategoryRowActions } from '@/app/(rss-feed-categories)/rss-feed-categories/category-row-actions'

const meta = {
  title: 'Admin/RSS Feed Category Row Actions',
  component: CategoryRowActions,
} satisfies Meta<typeof CategoryRowActions>

export default meta
type Story = StoryObj<typeof meta>

export const Pending: Story = {
  args: {
    category: { category_text: 'credit-cards', item_count: 42, rejected: false },
  },
}

export const Rejected: Story = {
  args: {
    category: { category_text: 'news', item_count: 100, rejected: true },
  },
}
