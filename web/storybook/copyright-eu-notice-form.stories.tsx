import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightEuNoticeForm } from '@/components/copyright/copyright-eu-notice-form'
import { storyCurrentUser } from './entities/entity-fixtures'

const meta = {
  title: 'Copyright/EU Notice Form',
  component: CopyrightEuNoticeForm,
  parameters: { auth: { currentUser: null } },
} satisfies Meta<typeof CopyrightEuNoticeForm>

export default meta
type Story = StoryObj<typeof meta>

export const Guest: Story = {}
export const SignedIn: Story = { parameters: { auth: { currentUser: storyCurrentUser } } }
