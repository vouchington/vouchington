import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { HouseholdInvitationsView } from '@/components/my/household-invitations-view'
import { makeHouseholdInvitation } from '@/test-helpers/api-responses/household-invitations'

const meta = {
  title: 'My/Household Invitations',
  component: HouseholdInvitationsView,
  args: {
    kind: 'received',
    invitations: [makeHouseholdInvitation()],
    pending: false,
    loadError: false,
    hasMore: false,
    loadingMore: false,
    pageError: false,
    selectedUserId: null,
    relationship: '',
    onSelectUser: fn(),
    onRelationshipChange: fn(),
    onInvite: fn(),
    onResolve: fn(),
    onRetry: fn(),
    onLoadMore: fn(),
  },
} satisfies Meta<typeof HouseholdInvitationsView>

export default meta
type Story = StoryObj<typeof meta>

export const Incoming: Story = {
  args: { onResolve: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }))
    await expect(args.onResolve).toHaveBeenCalledWith(args.invitations[0], 'accept')
  },
}
export const Owner: Story = {
  args: { kind: 'sent' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox')).toHaveValue('')
  },
}
export const Empty: Story = { args: { invitations: [] } }
export const LoadFailure: Story = { args: { invitations: [], loadError: true } }
export const Saving: Story = { args: { pending: true } }
export const MoreInvitations: Story = { args: { hasMore: true } }

export const MultipleReceived: Story = {
  args: {
    invitations: [
      makeHouseholdInvitation(),
      makeHouseholdInvitation({
        id: '00000000-0000-7000-8000-000000000302',
        household_id: '00000000-0000-7000-8000-000000000102',
        invited_by_id: '00000000-0000-7000-8000-000000000203',
      }),
    ],
  },
}
export const MultipleSent: Story = {
  args: {
    kind: 'sent',
    invitations: [
      makeHouseholdInvitation(),
      makeHouseholdInvitation({
        id: '00000000-0000-7000-8000-000000000302',
        invited_user_id: '00000000-0000-7000-8000-000000000204',
      }),
    ],
  },
}
