import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SimilarityPanels } from '@/components/admin/similarity/similarity-panels'

const meta = {
  title: 'Design System/Components/Admin Similarity Panels',
  component: SimilarityPanels,
  parameters: { auth: { currentUser: null } },
} satisfies Meta<typeof SimilarityPanels>

export default meta
type Story = StoryObj<typeof meta>

/**
 * When the query is shorter than the 3-character minimum, the component shows
 * a hint instead of firing any API calls. No mocking required.
 */
export const Hint: Story = {
  args: {
    query: 'hi',
    layout: 'stacked',
  },
}

export const AsideLayout: Story = {
  args: {
    query: 'ab',
    layout: 'aside',
  },
  render: args => (
    <div className='w-80'>
      <SimilarityPanels {...args} />
    </div>
  ),
}
