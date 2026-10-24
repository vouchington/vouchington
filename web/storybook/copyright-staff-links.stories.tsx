import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CopyrightStaffLinks } from '@/components/copyright/copyright-staff-links'
import type { User } from '@/types/user'

function userWithRoles(roles: string[]): User {
  return { account_type: null, id: 'user-1', roles }
}

const meta = {
  title: 'Copyright/Staff Links',
  component: CopyrightStaffLinks,
} satisfies Meta<typeof CopyrightStaffLinks>

export default meta
type Story = StoryObj<typeof meta>

export const Moderator: Story = {
  parameters: { auth: { currentUser: userWithRoles(['moderator']) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Copyright review queue' })).toHaveAttribute(
      'href',
      '/copyright/review-queue',
    )
    await expect(canvas.getByRole('link', { name: 'Copyright email review' })).toHaveAttribute(
      'href',
      '/copyright/email-review',
    )
  },
}

export const OrdinaryMemberSeesNothing: Story = {
  parameters: { auth: { currentUser: userWithRoles([]) } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('link')).toBeNull()
  },
}
