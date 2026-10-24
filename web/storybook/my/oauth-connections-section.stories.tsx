import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { OAuthConnectionsSection } from '@/components/my/oauth-connections-section'
import { StoryFrame } from '@/storybook/story-frame'
import type { OAuthAccountInfo, OAuthProvider } from '@/types/user'

const meta = {
  title: 'My/OAuth Connections Section',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const none: Record<OAuthProvider, OAuthAccountInfo | null> = {
  facebook: null,
  apple: null,
  google: null,
  x: null,
  linkedin: null,
  microsoft: null,
  github: null,
}

export const SomeConnected: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <OAuthConnectionsSection
        accounts={{
          ...none,
          google: { id: 'g-1', name: 'Alex Rivera', email_address: 'alex@example.com' },
          github: { id: 'gh-1', name: 'alexr', email_address: null },
        }}
      />
    </StoryFrame>
  ),
}
