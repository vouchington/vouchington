import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { RecipientPicker } from '@/components/messages/recipient-picker'
import type { UserSearchResult } from '@/types/user'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'
import { clearUserSearchFixture, setUserSearchFixture } from '@/storybook/mocks/client-api-instance'

const meta = {
  title: 'Messages/Recipient Picker',
  beforeEach: () => {
    setUserSearchFixture()
    return () => clearUserSearchFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const alex: UserSearchResult = publicUsers[0]!

function WithAlex() {
  const [recipients, setRecipients] = useState<UserSearchResult[]>([alex])
  return (
    <RecipientPicker
      recipients={recipients}
      onAdd={user => setRecipients(current => [...current, user])}
      onRemove={userId => setRecipients(current => current.filter(user => user.id !== userId))}
    />
  )
}

function EmptyPicker() {
  const [recipients, setRecipients] = useState<UserSearchResult[]>([])
  return (
    <RecipientPicker
      recipients={recipients}
      onAdd={user => setRecipients(current => [...current, user])}
      onRemove={userId => setRecipients(current => current.filter(user => user.id !== userId))}
    />
  )
}

export const Selected: Story = {
  render: () => (
    <StoryFrame>
      <WithAlex />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <EmptyPicker />
    </StoryFrame>
  ),
}
