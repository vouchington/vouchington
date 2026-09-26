import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ApiKeysManager } from '@/components/my/api-keys-manager'
import { StoryFrame } from '@/storybook/story-frame'
import type { ApiKey } from '@/types/api-keys'

const meta = {
  title: 'My/Api Keys Manager',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }

const keys: ApiKey[] = [
  {
    id: '019f38fe-0000-7000-8000-0000000000a1',
    prefix: 'vk_rss',
    type: 'rss',
    label: 'Fintech Daily reader',
    permissions: ['rss:read'],
    created_at: '2026-05-10T12:00:00.000Z',
    last_used_at: '2026-09-01T15:04:00.000Z',
    revoked_at: null,
    updated_at: '2026-09-01T15:04:00.000Z',
  },
  {
    id: '019f38fe-0000-7000-8000-0000000000a2',
    prefix: 'vk_mcp',
    type: 'mcp',
    label: 'Old laptop MCP',
    permissions: ['mcp.user:read'],
    created_at: '2026-02-02T12:00:00.000Z',
    last_used_at: '2026-04-11T09:00:00.000Z',
    revoked_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-06-01T12:00:00.000Z',
  },
]

export const WithKeys: Story = {
  render: () => (
    <StoryFrame>
      <ApiKeysManager initialData={{ results: keys, page_info: pageInfo }} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <ApiKeysManager initialData={{ results: [], page_info: pageInfo }} />
    </StoryFrame>
  ),
}
