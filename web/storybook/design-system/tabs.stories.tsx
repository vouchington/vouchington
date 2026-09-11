import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const meta = {
  title: 'Design System/Components/Tabs',
  component: Tabs,
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-2xl flex-col gap-3'>{children}</div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <Tabs defaultValue='overview'>
        <TabsList>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='details'>Details</TabsTrigger>
          <TabsTrigger value='settings'>Settings</TabsTrigger>
        </TabsList>
        <TabsContent value='overview'>
          <p className='text-sm text-muted-foreground'>Overview tab content.</p>
        </TabsContent>
        <TabsContent value='details'>
          <p className='text-sm text-muted-foreground'>Details tab content.</p>
        </TabsContent>
        <TabsContent value='settings'>
          <p className='text-sm text-muted-foreground'>Settings tab content.</p>
        </TabsContent>
      </Tabs>
    </Frame>
  ),
}

export const Scrollable: Story = {
  render: () => {
    const tabs = [
      'Overview',
      'Discussions',
      'Reviews',
      'Data points',
      'Topics',
      'Followers',
      'Following',
      'Bookmarks',
      'Settings',
    ]
    return (
      <Frame>
        <Tabs defaultValue={tabs[0]}>
          <TabsList className='w-full overflow-x-auto scrollbar-hide'>
            {tabs.map(tab => (
              <TabsTrigger
                key={tab}
                value={tab}
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map(tab => (
            <TabsContent
              key={tab}
              value={tab}
            >
              <p className='text-sm text-muted-foreground'>{tab} content.</p>
            </TabsContent>
          ))}
        </Tabs>
      </Frame>
    )
  },
}
