import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'

const meta = {
  title: 'Design System/Components/InputOTP',
  component: InputOTP,
  args: { maxLength: 6 },
} satisfies Meta<typeof InputOTP>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-col items-center gap-3 rounded-md border p-6'>
      {children}
    </div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <InputOTP
        aria-label='One-time password'
        maxLength={6}
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
      <p className='text-xs text-muted-foreground'>Empty 6-digit OTP input.</p>
    </Frame>
  ),
}

export const Filled: Story = {
  render: () => (
    <Frame>
      <InputOTP
        aria-label='One-time password'
        maxLength={6}
        value='123456'
        onChange={() => {}}
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
      <p className='text-xs text-muted-foreground'>Pre-filled OTP value.</p>
    </Frame>
  ),
}
