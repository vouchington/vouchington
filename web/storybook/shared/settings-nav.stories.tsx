import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SettingsNav } from '@/components/my/settings-nav'

const meta = {
  title: 'Shared/SettingsNav',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='bg-background p-4 text-foreground'>
    <div className='mx-auto max-w-4xl'>{children}</div>
  </main>
)

export const AccountActive: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/my/identity' } },
  },
  render: () => (
    <Frame>
      <SettingsNav />
    </Frame>
  ),
}

export const ProfileActive: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/my/cards' } },
  },
  render: () => (
    <Frame>
      <SettingsNav />
    </Frame>
  ),
}

export const PreferencesActive: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/my/preferences' } },
  },
  render: () => (
    <Frame>
      <SettingsNav />
    </Frame>
  ),
}

export const AdvancedActive: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/my/api-keys' } },
  },
  render: () => (
    <Frame>
      <SettingsNav />
    </Frame>
  ),
}
