import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AuthenticatorList } from '@/components/my/totp-manager/authenticator-list'
import { StoryFrame } from '@/storybook/story-frame'
import type { TotpAuthenticator } from '@/types/user'

const meta = {
  title: 'My/Authenticator List',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const authenticators: TotpAuthenticator[] = [
  {
    id: '019f38fe-0000-7000-8000-0000000000t1',
    name: '1Password',
    created_at: '2026-04-01T12:00:00.000Z',
  },
  {
    id: '019f38fe-0000-7000-8000-0000000000t2',
    name: 'Authy on iPhone',
    created_at: '2025-11-18T12:00:00.000Z',
  },
]

function AuthenticatorRows() {
  const [rows, setRows] = useState(authenticators)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  return (
    <AuthenticatorList
      authenticators={rows}
      confirmingDeleteId={confirmingDeleteId}
      loading={false}
      renameName={renameName}
      renamingId={renamingId}
      onConfirmRemove={id => {
        setRows(current => current.filter(row => row.id !== id))
        setConfirmingDeleteId(null)
      }}
      onRemoveClick={setConfirmingDeleteId}
      onRename={id => {
        setRows(current => current.map(row => (row.id === id ? { ...row, name: renameName } : row)))
        setRenamingId(null)
      }}
      setConfirmingDeleteId={setConfirmingDeleteId}
      setRenameName={setRenameName}
      setRenamingId={setRenamingId}
    />
  )
}

export const WithAuthenticators: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <AuthenticatorRows />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <AuthenticatorList
        authenticators={[]}
        confirmingDeleteId={null}
        loading={false}
        renameName=''
        renamingId={null}
        onConfirmRemove={() => {}}
        onRemoveClick={() => {}}
        onRename={() => {}}
        setConfirmingDeleteId={() => {}}
        setRenameName={() => {}}
        setRenamingId={() => {}}
      />
    </StoryFrame>
  ),
}
