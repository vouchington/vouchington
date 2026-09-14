import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { StatusPage } from '@/components/shared/status-page'

const meta = {
  title: 'Design System/Shared/StatusPage',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const t = createTranslator('en', await loadJsonMessages('en'))

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>{children}</main>
)

export const NotFound: Story = {
  render: () => (
    <Frame>
      <StatusPage
        status={404}
        title='Page not found'
        description="We couldn't find that page — it may have moved or never existed."
        t={t}
      />
    </Frame>
  ),
}

export const Unauthorized: Story = {
  render: () => (
    <Frame>
      <StatusPage
        status={401}
        title='Sign in required'
        description='Sign in to pick up right where you left off.'
        t={t}
      />
    </Frame>
  ),
}

export const Forbidden: Story = {
  render: () => (
    <Frame>
      <StatusPage
        status={403}
        title='Access denied'
        description='This page is private. If you think you should have access, reach out to the owner.'
        t={t}
      />
    </Frame>
  ),
}

export const RateLimited: Story = {
  render: () => (
    <Frame>
      <StatusPage
        status={429}
        title='Too many requests'
        description="You're sending requests too quickly. Please wait a moment and try again."
        t={t}
      />
    </Frame>
  ),
}

export const ServerError: Story = {
  render: () => (
    <Frame>
      <StatusPage
        status={500}
        title='Something went wrong'
        description='Something went sideways on our end. Try again and it should sort itself out.'
        t={t}
      />
    </Frame>
  ),
}
