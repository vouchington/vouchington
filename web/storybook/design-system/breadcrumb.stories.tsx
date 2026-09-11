import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Breadcrumbs,
} from '@/components/ui/breadcrumb'

const meta = {
  title: 'Design System/Components/Breadcrumb',
  component: Breadcrumb,
} satisfies Meta<typeof Breadcrumb>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/'>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/topics'>Topics</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Science</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </main>
  ),
}

export const WithEllipsis: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/'>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/topics/science'>Science</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Physics</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </main>
  ),
}

export const CompositeFromItems: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <Breadcrumbs
        items={[
          { name: 'Home', path: '/' },
          { name: 'Topics', path: '/topics' },
          { name: 'Science', path: '/topics/science' },
          { name: 'Physics', path: '/topics/science/physics' },
        ]}
      />
    </main>
  ),
}

export const VideoChannelSource: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <Breadcrumbs
        items={[
          { name: 'Home', path: '/' },
          { name: 'Channels', path: '/channels' },
          { name: 'Level1Techs', path: '/source/level1techs' },
        ]}
      />
    </main>
  ),
}
