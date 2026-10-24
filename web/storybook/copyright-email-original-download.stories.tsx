import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightEmailOriginalDownload } from '@/components/copyright/copyright-email-original-download'

const meta = {
  title: 'Copyright/Email Original Download',
  component: CopyrightEmailOriginalDownload,
  args: {
    downloadUrl: '/api/v1/copyright-email-intakes/019f0000-0000-7000-8000-0000000000f1/original',
    virus: 'pass',
  },
} satisfies Meta<typeof CopyrightEmailOriginalDownload>

export default meta
type Story = StoryObj<typeof meta>

export const Available: Story = {}

export const MalwareScanNotConfirmed: Story = { args: { virus: 'gray' } }

export const WithheldForMalware: Story = { args: { virus: 'fail' } }
