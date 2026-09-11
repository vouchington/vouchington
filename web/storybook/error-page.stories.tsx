import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ErrorPage from '@/app/error'
import GlobalError from '@/app/global-error'

const meta = {
  title: 'Design System/Shared/ErrorPage',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>{children}</main>
)

export const RateLimited: Story = {
  render: () => (
    <Frame>
      <ErrorPage
        error={Object.assign(new Error('rate limited'), { digest: 'EXPECTED_CLIENT_ERROR;429' })}
        reset={() => {}}
      />
    </Frame>
  ),
}

export const BadRequest: Story = {
  render: () => (
    <Frame>
      <ErrorPage
        error={Object.assign(new Error('bad request'), { digest: 'EXPECTED_CLIENT_ERROR;400' })}
        reset={() => {}}
      />
    </Frame>
  ),
}

export const GenericError: Story = {
  render: () => (
    <Frame>
      <ErrorPage
        error={new Error('unexpected')}
        reset={() => {}}
      />
    </Frame>
  ),
}

export const GlobalErrorRateLimited: Story = {
  render: () => (
    <GlobalError
      error={Object.assign(new Error('rate limited'), { digest: 'EXPECTED_CLIENT_ERROR;429' })}
      reset={() => {}}
    />
  ),
}

export const GlobalErrorGeneric: Story = {
  render: () => (
    <GlobalError
      error={new Error('unexpected')}
      reset={() => {}}
    />
  ),
}
