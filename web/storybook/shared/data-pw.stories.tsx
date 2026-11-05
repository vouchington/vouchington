import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DataPw } from '@/components/shared/data-pw'

const meta = {
  title: 'Shared/DataPw',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>{children}</main>
)

export const WithCallerId: Story = {
  render: () => (
    <Frame>
      <DataPw
        as='div'
        dataPw='data-pw-story'
      >
        Caller selector
      </DataPw>
    </Frame>
  ),
}

export const OmittedId: Story = {
  render: () => (
    <Frame>
      <DataPw as='div'>Omitted selector</DataPw>
    </Frame>
  ),
}
