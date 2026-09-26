import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ConnectedAppsManager } from '@/components/my/connected-apps-manager'
import { ConnectedAppRow } from '@/components/my/connected-apps-manager/connected-app-row'
import type { OAuthGrant } from '@/types/oauth-apps'

const meta = {
  title: 'My/Connected Apps',
  parameters: { layout: 'centered' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const verifiedGrant: OAuthGrant = {
  id: 'storybook-grant',
  client: {
    id: 'storybook-client',
    client_id: 'voucha_storybook-agent',
    client_name: 'Storybook Agent',
    verified: true,
  },
  resource: 'https://voucha.ai/api/v1/mcp',
  scopes: ['mcp.user:read', 'mcp.user:write'],
  consented_at: '2026-09-01T12:00:00.000Z',
  last_used_at: '2026-09-20T08:30:00.000Z',
}

const unverifiedGrant: OAuthGrant = {
  ...verifiedGrant,
  id: 'storybook-unverified-grant',
  client: {
    id: 'storybook-unverified-client',
    client_id: 'voucha_storybook-unknown',
    client_name: 'Unreviewed Agent',
    verified: false,
  },
  scopes: ['posts:read'],
}

const lastPage = { has_next_page: false, end_cursor: null, start_cursor: null }

export const Manager: Story = {
  render: () => (
    <div className='w-[min(92vw,720px)]'>
      <ConnectedAppsManager
        initialData={{ results: [verifiedGrant, unverifiedGrant], page_info: lastPage }}
      />
    </div>
  ),
}

export const Empty: Story = {
  render: () => (
    <div className='w-[min(92vw,720px)]'>
      <ConnectedAppsManager initialData={{ results: [], page_info: lastPage }} />
    </div>
  ),
}

export const UnverifiedRow: Story = {
  render: () => (
    <ul className='w-[min(92vw,720px)]'>
      <ConnectedAppRow
        grant={unverifiedGrant}
        onRevoke={fn(async () => {})}
      />
    </ul>
  ),
}
