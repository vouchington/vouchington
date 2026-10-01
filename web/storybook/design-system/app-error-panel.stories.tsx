import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AppErrorPanel } from '@/components/shared/app-error-panel'

const meta = {
  title: 'Design System/Shared/AppErrorPanel',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>{children}</main>
)

const routeSelectors = {
  root: 'error-page',
  title: 'error-page-title',
  description: 'error-page-description',
  retry: 'error-page-retry-button',
  home: 'error-page-home-link',
} as const

const globalSelectors = {
  root: 'global-error-page',
  title: 'global-error-page-title',
  description: 'global-error-page-description',
  retry: 'global-error-page-retry-button',
  home: 'global-error-page-home-link',
} as const

export const RouteError: Story = {
  render: () => (
    <Frame>
      <AppErrorPanel
        status={500}
        title='Something went wrong'
        description='Something went sideways on our end. Try again and it should sort itself out.'
        retryLabel='Try again'
        homeLabel='Home'
        onRetry={() => {}}
        variant='route'
        dataPw={routeSelectors}
      />
    </Frame>
  ),
}

export const GlobalDocumentError: Story = {
  render: () => (
    <Frame>
      <AppErrorPanel
        status={500}
        title='Something went wrong'
        description='Something went sideways on our end. Try again and it should sort itself out.'
        retryLabel='Try again'
        homeLabel='Go home'
        onRetry={() => {}}
        variant='global'
        dataPw={globalSelectors}
      />
    </Frame>
  ),
}
