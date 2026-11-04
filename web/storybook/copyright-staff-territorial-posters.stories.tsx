import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CopyrightStaffTerritorialPosters } from '@/components/copyright/copyright-staff-territorial-posters'

const poster = '019f0000-0000-7000-8000-000000000192'

const meta = {
  title: 'Copyright/Staff Territorial Posters',
  component: CopyrightStaffTerritorialPosters,
  args: {
    posters: [
      {
        target_id: '019f0000-0000-7000-8000-000000000193',
        user_id: poster,
        informed_at: '2026-09-30T10:00:00Z',
        state: 'sent',
      },
      {
        target_id: '019f0000-0000-7000-8000-000000000194',
        user_id: poster,
        informed_at: null,
        state: null,
      },
    ],
    fetchError: null,
    hasNextPage: false,
    loadingMore: false,
    clearError: () => undefined,
    loadMore: () => undefined,
  },
} satisfies Meta<typeof CopyrightStaffTerritorialPosters>

export default meta
type Story = StoryObj<typeof meta>

/** The same poster on two targets appears once for each. */
export const RepeatedPoster: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Poster 1: sent/)).toBeVisible()
    await expect(canvas.getByText(/Poster 2: not sent/)).toBeVisible()
  },
}

export const NoDelivery: Story = {
  args: { posters: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No poster delivery is recorded.')).toBeVisible()
  },
}
