import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PreferencesForm } from '@/components/my/preferences-form'

const meta = {
  title: 'Shared/PreferencesForm',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-3xl space-y-6'>{children}</div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <div>
        <h1 className='text-2xl font-bold'>Display</h1>
        <p className='text-sm text-muted-foreground'>Customize your browsing experience</p>
      </div>
      <PreferencesForm
        hnDiscussionsEnabled={false}
        userId='storybook-user'
      />
    </Frame>
  ),
}
