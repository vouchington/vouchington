import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { OAuthClientVerificationRow } from '@/components/admin/oauth-clients/oauth-client-verification-row'
import type { AdminOAuthClientListItem } from '@/types/oauth-apps'

const meta = {
  title: 'Admin/OAuth Client Verification',
  parameters: { layout: 'centered' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const unverifiedClient: AdminOAuthClientListItem = {
  id: 'storybook-oauth-client',
  client_id: 'voucha_storybook-agent',
  client_name: 'Storybook Agent',
  client_type: 'confidential',
  redirect_uris: ['https://agent.example.com/oauth/callback'],
  scopes: ['mcp.user:read', 'mcp.user:write'],
  owner_user_id: 'storybook-owner',
  owner: {
    __entity_type: 'user',
    id: 'storybook-owner',
    username: 'storybook-owner',
    profile_image_id: null,
    roles: [],
  },
  verified_at: null,
  verified_by_id: null,
  created_at: '2026-09-01T12:00:00.000Z',
}

const verifiedOwnerlessClient: AdminOAuthClientListItem = {
  ...unverifiedClient,
  id: 'storybook-verified-client',
  client_id: 'voucha_storybook-verified',
  client_name: 'Verified Agent',
  client_type: 'public',
  owner_user_id: null,
  owner: null,
  verified_at: '2026-09-10T09:15:00.000Z',
  verified_by_id: 'storybook-admin',
}

export const VerificationQueue: Story = {
  render: () => (
    <table className='min-w-full divide-y divide-border'>
      <caption className='sr-only'>OAuth apps</caption>
      <tbody className='divide-y divide-border bg-card'>
        <OAuthClientVerificationRow client={unverifiedClient} />
        <OAuthClientVerificationRow client={verifiedOwnerlessClient} />
      </tbody>
    </table>
  ),
}
