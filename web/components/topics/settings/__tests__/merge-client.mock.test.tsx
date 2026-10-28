import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { makeTopic } from '@/test-helpers/api-responses/topics'
import type { TopicMergeResponseBody } from '@/types/api-responses'

const nav = createNavMock()
const api = vi.hoisted(() => ({
  merge: vi.fn<VitestLooseMock>(),
  status: vi.fn<VitestLooseMock>(),
  topic: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/client/topics'), async importOriginal => ({
  ...(await importOriginal()),
  mergeTopicAliases: api.merge,
  fetchTopicMergeOperation: api.status,
  fetchTopic: api.topic,
}))
vi.mock(
  import('@/lib/i18n/use-translations'),
  () =>
    ({
      useTranslations: () => (key: string) => key,
    }) as unknown as typeof import('@/lib/i18n/use-translations'),
)
vi.mock(import('@/components/posts/topic-autocomplete'), () => ({
  TopicAutocomplete: ({ onChange }: { onChange: (id: string, name: string) => void }) => (
    <button
      type='button'
      onClick={() => onChange('destination-topic', 'Destination')}
    >
      Choose destination
    </button>
  ),
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

import { MergeClient } from '../merge-client'

const source = makeTopic({ id: 'source-topic', name: 'Source', slug: 'source' })
const destination = makeTopic({ id: 'destination-topic', name: 'Destination', slug: 'destination' })
function response(status: TopicMergeResponseBody['topic_merge']['status']): TopicMergeResponseBody {
  return {
    topic_merge: {
      id: 'operation',
      source_topic_id: source.id,
      destination_topic_id: destination.id,
      status,
      stage: 'references',
      created_at: '2026-01-01T00:00:00.000Z',
      completed_at: status === 'completed' ? '2026-01-01T00:01:00.000Z' : null,
      error_code: status === 'failed' ? 'topic_merge_reference_conflict' : null,
      status_url: '/api/v1/topics/source-topic/merges/operation',
    },
  }
}

async function submit() {
  render(<MergeClient topic={source} />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose destination' }))
  fireEvent.change(
    screen.getByLabelText('extracted.settings.mergeClient.typeTopicnameToConfirm_427f250b'),
    { target: { value: 'Source' } },
  )
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'extracted.settings.mergeClient.merge_8851aaa7' }),
    )
  })
}

describe('MergeClient asynchronous completion', () => {
  afterEach(() => {
    vi.clearAllMocks()
    nav.reset()
  })
  it('keeps admission and running status pending, then opens the completed destination', async () => {
    api.merge.mockResolvedValueOnce(response('queued'))
    api.status
      .mockResolvedValueOnce(response('running'))
      .mockResolvedValueOnce(response('completed'))
    api.topic.mockResolvedValueOnce(destination)
    await submit()
    expect(api.status).not.toHaveBeenCalled()
    expect(nav.push).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.topics.merge.checkStatus' }))
    })
    expect(api.status).toHaveBeenLastCalledWith(source.id, 'operation')
    expect(nav.push).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.topics.merge.checkStatus' }))
    })
    expect(nav.push).toHaveBeenCalledWith('/topic/destination/settings/aliases')
    expect(api.merge).toHaveBeenCalledTimes(1)
  })

  it('shows a rejected operation without navigating or submitting it again', async () => {
    api.merge.mockResolvedValueOnce(response('queued'))
    api.status.mockResolvedValueOnce(response('failed'))
    await submit()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.topics.merge.checkStatus' }))
    })
    expect(screen.getByRole('status')).toHaveTextContent('settings.topics.merge.failed')
    expect(screen.queryByRole('button', { name: 'settings.topics.merge.checkStatus' })).toBeNull()
    expect(nav.push).not.toHaveBeenCalled()
    expect(api.merge).toHaveBeenCalledTimes(1)
  })
})
