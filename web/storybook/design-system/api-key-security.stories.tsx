import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import {
  ActiveApiKeysList,
  RevokedApiKeysList,
} from '@/components/my/api-keys-manager/api-key-lists'
import { KeyCreatedAlert } from '@/components/my/api-keys-manager/key-created-alert'

const meta = {
  title: 'Design System/API Key Security',
  parameters: { layout: 'centered' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const OneTimeReveal: Story = {
  render: () => (
    <div className='w-[min(92vw,640px)]'>
      <KeyCreatedAlert
        copied={false}
        rawKey='voucha_rss_storybook_one_time_secret'
        onCopy={fn()}
        onDismiss={fn()}
      />
    </div>
  ),
}

export const CopiedState: Story = {
  render: () => (
    <div className='w-[min(92vw,640px)]'>
      <KeyCreatedAlert
        copied
        rawKey='voucha_rss_storybook_one_time_secret'
        onCopy={fn()}
        onDismiss={fn()}
      />
    </div>
  ),
}

export const KeyLists: Story = {
  render: () => (
    <div className='w-[min(92vw,720px)] space-y-4'>
      <ActiveApiKeysList
        confirmingRevokeId={null}
        keys={[
          {
            id: 'storybook-active-key',
            label: 'Feed Reader',
            prefix: 'voucha_rss_feed',
            type: 'rss',
            permissions: ['rss:read'],
            created_at: '2026-05-25T00:00:00Z',
            updated_at: '2026-05-25T00:00:00Z',
            last_used_at: null,
            revoked_at: null,
          },
        ]}
        revokingIds={new Set()}
        onCancelRevoke={fn()}
        onConfirmRevoke={fn()}
        onStartRevoke={fn()}
      />
      <RevokedApiKeysList
        keys={[
          {
            id: 'storybook-revoked-key',
            label: 'Old Reader',
            prefix: 'voucha_rss_old1',
            type: 'rss',
            permissions: ['rss:read'],
            created_at: '2026-05-20T00:00:00Z',
            updated_at: '2026-05-24T00:00:00Z',
            last_used_at: '2026-05-22T00:00:00Z',
            revoked_at: '2026-05-24T00:00:00Z',
          },
        ]}
      />
    </div>
  ),
}
