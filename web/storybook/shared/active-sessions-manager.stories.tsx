import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'
import { ActiveSessionRow } from '@/components/my/active-session-row'
import { ActiveSessionsManager } from '@/components/my/active-sessions-manager'
import type { AuthSession } from '@/types/my'

const meta = {
  title: 'Shared/ActiveSessionsManager',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sessions: AuthSession[] = [
  {
    id: '019f38fe-0000-7000-8000-000000000001',
    device_id: '019f38fe-0000-7000-8000-000000000101',
    device_name: 'MacBook Pro',
    user_agent: 'Safari on macOS',
    ip_address: '203.0.113.8',
    created_at: '2026-07-01T12:00:00Z',
    last_seen_at: '2026-07-06T18:00:00Z',
    expires_at: '2026-07-31T12:00:00Z',
    is_current: true,
  },
  {
    id: '019f38fe-0000-7000-8000-000000000002',
    device_id: '019f38fe-0000-7000-8000-000000000102',
    device_name: 'iPhone',
    user_agent: 'Voucha iOS',
    ip_address: '198.51.100.24',
    created_at: '2026-07-03T09:30:00Z',
    last_seen_at: '2026-07-05T16:45:00Z',
    expires_at: '2026-08-02T09:30:00Z',
    is_current: false,
  },
]

export const Default: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <ActiveSessionsManager initialSessions={sessions} />
      </div>
    </main>
  ),
}

export const Row: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <ul>
          <ActiveSessionRow
            loading={false}
            session={sessions[0]!}
            t={defaultTranslator}
            uiLocale='en'
            onSignOut={() => undefined}
          />
        </ul>
      </div>
    </main>
  ),
}
