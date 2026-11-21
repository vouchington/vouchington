import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProviderIcon } from '@/components/auth/oauth-provider-icons'
import { StoryFrame } from '@/storybook/story-frame'
import type { OAuthProvider } from '@/types/user'

const providers: OAuthProvider[] = [
  'google',
  'facebook',
  'apple',
  'microsoft',
  'linkedin',
  'x',
  'github',
]

const meta = {
  title: 'Auth/OAuth Provider Icon',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AllProviders: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <div className='flex gap-3 rounded bg-slate-700 p-3'>
        {providers.map(provider => (
          <ProviderIcon
            key={provider}
            provider={provider}
          />
        ))}
      </div>
    </StoryFrame>
  ),
}
