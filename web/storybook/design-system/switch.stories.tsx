import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

const meta = {
  title: 'Design System/Components/Switch',
  component: Switch,
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-col gap-3 rounded-md border p-3'>{children}</div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor='switch-off'>Off by default</Label>
        <Switch id='switch-off' />
      </div>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor='switch-on'>On by default</Label>
        <Switch
          id='switch-on'
          defaultChecked
        />
      </div>
    </Frame>
  ),
}

export const Disabled: Story = {
  render: () => (
    <Frame>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor='switch-disabled-off'>Disabled off</Label>
        <Switch
          id='switch-disabled-off'
          disabled
        />
      </div>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor='switch-disabled-on'>Disabled on</Label>
        <Switch
          id='switch-disabled-on'
          disabled
          defaultChecked
        />
      </div>
    </Frame>
  ),
}
