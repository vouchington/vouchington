import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'

const meta = {
  title: 'Design System/Components/Sidebar',
  component: Sidebar,
} satisfies Meta<typeof Sidebar>

export default meta
type Story = StoryObj<typeof meta>

export const Expanded: Story = {
  render: () => (
    <SidebarProvider>
      <Sidebar collapsible='icon'>
        <SidebarHeader>
          <SidebarInput
            aria-label='Search navigation'
            placeholder='Search'
          />
        </SidebarHeader>
        <SidebarSeparator decorative />
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                type='button'
                isActive
              >
                Home
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton type='button'>Topics</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <p className='px-2 text-xs text-sidebar-foreground/70'>cardholder</p>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className='flex h-12 items-center gap-2 border-b px-3'>
          <SidebarTrigger />
          <h1 className='text-sm font-medium'>Home</h1>
        </header>
        <p className='p-4 text-sm text-muted-foreground'>
          Reviews and referral links from people you trust.
        </p>
      </SidebarInset>
    </SidebarProvider>
  ),
}
