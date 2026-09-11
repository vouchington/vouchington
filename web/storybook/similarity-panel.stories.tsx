import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SimilarityPanel } from '@/components/admin/similarity/similarity-panel'

const meta = {
  title: 'Design System/Components/Admin Similarity Panel',
  component: SimilarityPanel,
  parameters: { auth: { currentUser: null } },
} satisfies Meta<typeof SimilarityPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {
  args: {
    title: 'Similar topics',
    isLoading: false,
    items: [
      {
        id: '1',
        href: '/topics/developer-tools/settings',
        label: { kind: 'ui-text', text: 'Developer Tools' },
      },
      {
        id: '2',
        href: '/topics/dev-tooling/settings',
        label: { kind: 'ui-text', text: 'Dev Tooling' },
      },
      {
        id: '3',
        href: '/topics/software-development/settings',
        label: { kind: 'ui-text', text: 'Software Development' },
      },
    ],
  },
}

export const Loading: Story = {
  args: {
    title: 'Similar topics',
    isLoading: true,
    items: [],
  },
}

export const Empty: Story = {
  args: {
    title: 'Similar topics',
    isLoading: false,
    items: [],
    emptyHint: 'No similar topics found.',
  },
}

export const NewsPanel: Story = {
  args: {
    title: 'Similar news',
    isLoading: false,
    items: [
      {
        id: '1',
        href: 'https://example.com/article-1',
        label: { kind: 'ui-text', text: 'Best Developer Tools in 2024' },
      },
      {
        id: '2',
        href: 'https://example.com/article-2',
        label: { kind: 'ui-text', text: 'Top CLI Tools for Developers' },
      },
    ],
  },
}
