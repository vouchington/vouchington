import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { OfficialReferralLinksTable } from '@/components/admin/official-referral-links/official-referral-links-table'

const meta = {
  title: 'Design System/Components/Admin Official Referral Links',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sampleLinks: ComponentProps<typeof OfficialReferralLinksTable>['links'] = [
  {
    id: 'link-001',
    url: 'https://www.brand.com/refer/abc123',
    label: 'Homepage banner',
    activated_at: '2026-01-15T00:00:00.000Z',
  },
  {
    id: 'link-002',
    url: 'https://www.brand.com/refer/xyz789',
    label: null,
    activated_at: null,
  },
]

export const LinksTable: Story = {
  render: () => (
    <OfficialReferralLinksTable
      links={sampleLinks}
      deletingId={null}
      isPending={false}
      onDelete={() => {}}
    />
  ),
}

export const EmptyLinksTable: Story = {
  render: () => (
    <OfficialReferralLinksTable
      links={[]}
      deletingId={null}
      isPending={false}
      onDelete={() => {}}
    />
  ),
}
