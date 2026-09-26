import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AddPasskeyForm } from '@/components/my/passkey-manager/add-passkey-form'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Add Passkey Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function PasskeyName({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName)
  return (
    <AddPasskeyForm
      loading={false}
      newName={name}
      onAddPasskey={event => event.preventDefault()}
      setNewName={setName}
      setStep={() => {}}
    />
  )
}

export const Named: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PasskeyName initialName='MacBook Pro' />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PasskeyName initialName='' />
    </StoryFrame>
  ),
}
