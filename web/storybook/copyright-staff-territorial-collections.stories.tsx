import { ClientRequest } from '@vouchington/api-client'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CopyrightStaffTerritorialCollections } from '@/components/copyright/copyright-staff-territorial-collections'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'

const noMorePages = { has_next_page: false, start_cursor: null, end_cursor: null }

const item = makeCopyrightStaffQueueItem({
  id: '019f0000-0000-7000-8000-000000000191',
  jurisdiction: 'uk',
  reasons: ['territorial_notice_review'],
})

const meta = {
  title: 'Copyright/Staff Territorial Case Details',
  component: CopyrightStaffTerritorialCollections,
  args: { item, pending: false, onReview: () => undefined, onClose: () => undefined },
} satisfies Meta<typeof CopyrightStaffTerritorialCollections>

export default meta
type Story = StoryObj<typeof meta>

/** Answers the case's collection reads for one story and restores the client afterwards. */
function answerCollections(failPosters: boolean) {
  const previousGet = ClientRequest.prototype.get
  ClientRequest.prototype.get = function storyCollectionsGet<T>(
    endpoint: string,
    options?: Parameters<ClientRequest['get']>[1],
  ): Promise<T> {
    if (endpoint.endsWith('/territorial-posters')) {
      return failPosters
        ? Promise.reject(new Error('Request failed'))
        : Promise.resolve({
            copyright_territorial_posters: [
              {
                target_id: '019f0000-0000-7000-8000-000000000193',
                user_id: '019f0000-0000-7000-8000-000000000192',
                informed_at: '2026-09-30T10:00:00Z',
                state: 'sent',
              },
            ],
            page_info: noMorePages,
          } as T)
    }
    if (endpoint.endsWith('/territorial-claimants')) {
      return Promise.resolve({
        copyright_territorial_claimants: [],
        page_info: noMorePages,
      } as T)
    }
    if (endpoint.endsWith('/territorial-complaints')) {
      return Promise.resolve({
        copyright_territorial_complaints: [],
        page_info: noMorePages,
      } as T)
    }
    return previousGet.call(this, endpoint, options) as Promise<T>
  }
  return () => {
    ClientRequest.prototype.get = previousGet
  }
}

export const LoadedDetails: Story = {
  beforeEach: () => answerCollections(false),
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body)
    await expect(await dialog.findByText(/Poster 1: sent/)).toBeVisible()
    await expect(dialog.getByText('Deliveries, complaints and settlements')).toBeVisible()
  },
}

export const FailedDetails: Story = {
  beforeEach: () => answerCollections(true),
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body)
    await expect(await dialog.findByRole('alert')).toHaveTextContent(
      'The case details could not be loaded.',
    )
  },
}
