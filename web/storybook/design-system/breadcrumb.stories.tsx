import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Breadcrumbs } from '@/components/ui/breadcrumb'

const meta = {
  title: 'Design System/Components/Breadcrumb',
  component: Breadcrumbs,
} satisfies Meta<typeof Breadcrumbs>

export default meta
type Story = StoryObj<typeof meta>

function renderBreadcrumbs(items: ComponentProps<typeof Breadcrumbs>['items']) {
  return (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <Breadcrumbs items={items} />
    </main>
  )
}

const basicItems = [
  { name: 'Home', path: '/' },
  { name: 'Topics', path: '/topics' },
  { name: 'Science', path: '/topics/science' },
]
const compositeItems = [...basicItems, { name: 'Physics', path: '/topics/science/physics' }]
const videoChannelItems = [
  { name: 'Home', path: '/' },
  { name: 'Channels', path: '/channels' },
  { name: 'Level1Techs', path: '/source/level1techs' },
]

export const Basic: Story = {
  args: { items: basicItems },
  render: () => renderBreadcrumbs(basicItems),
}

export const CompositeFromItems: Story = {
  args: { items: compositeItems },
  render: () => renderBreadcrumbs(compositeItems),
}

export const VideoChannelSource: Story = {
  args: { items: videoChannelItems },
  render: () => renderBreadcrumbs(videoChannelItems),
}
