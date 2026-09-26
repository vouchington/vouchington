import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PasskeyList } from '@/components/my/passkey-manager/passkey-list'
import { StoryFrame } from '@/storybook/story-frame'
import type { Passkey } from '@/types/user'

const meta = {
  title: 'My/Passkey List',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const passkeys: Passkey[] = [
  {
    id: '019f38fe-0000-7000-8000-0000000000p1',
    name: 'MacBook Pro',
    device_type: 'multiDevice',
    backed_up: true,
    created_at: '2026-03-12T12:00:00.000Z',
    last_used_at: '2026-09-20T16:00:00.000Z',
  },
  {
    id: '019f38fe-0000-7000-8000-0000000000p2',
    name: 'YubiKey',
    device_type: 'singleDevice',
    backed_up: false,
    created_at: '2026-01-04T12:00:00.000Z',
    last_used_at: null,
  },
]

function PasskeyRows({ confirmingDeleteId }: { confirmingDeleteId: string | null }) {
  return (
    <PasskeyList
      confirmingDeleteId={confirmingDeleteId}
      loading={false}
      passkeys={passkeys}
      renameName=''
      renamingId={null}
      onConfirmRemove={() => {}}
      onRemoveClick={() => {}}
      onRename={() => {}}
      setConfirmingDeleteId={() => {}}
      setRenameName={() => {}}
      setRenamingId={() => {}}
    />
  )
}

export const WithPasskeys: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PasskeyRows confirmingDeleteId={null} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PasskeyList
        confirmingDeleteId={null}
        loading={false}
        passkeys={[]}
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
