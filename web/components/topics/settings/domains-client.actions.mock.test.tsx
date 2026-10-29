import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { DomainsClient } from './domains-client'
import { updateTopic } from '@/lib/api/client/topics'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: React.ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('@/lib/api/client/topics'), () => ({
  updateTopic: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topic-additional-hostnames'), () => ({
  addAdditionalHostname: vi.fn<VitestLooseMock>(),
  removeAdditionalHostname: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  deleteRssFeed: vi.fn<VitestLooseMock>(),
  getRssFeedCrawls: vi.fn<VitestLooseMock>().mockResolvedValue({ results: [] }),
  refreshRssFeed: vi.fn<VitestLooseMock>(),
  updateRssFeed: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockUpdateTopic = vi.mocked(updateTopic)

const baseInitialData = {
  additionalHostnames: [],
  crawls: [],
  loading: false,
  primaryHostname: null,
  rssFeed: null,
  topicName: 'Topic',
}

describe('DomainsClient — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateTopic.mockResolvedValue({
      topic: { hostname_id: 'hn-1', hostname: { id: 'hn-1', hostname: 'example.com' } },
    } as unknown as Awaited<ReturnType<typeof updateTopic>>)
  })

  it('Enter on the primary hostname input submits via updateTopic', async () => {
    render(
      <DomainsClient
        id='topic-1'
        initialData={baseInitialData}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Domains' })).toBeInTheDocument()

    const input = screen.getByLabelText('Primary domain') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'example.com' } })

    await act(async () => {
      await expectInputEnterSubmits({ input, onSubmit: mockUpdateTopic })
    })

    expect(mockUpdateTopic).toHaveBeenCalledWith(
      'topic-1',
      expect.objectContaining({ hostname: 'example.com' }),
    )
  })
})
