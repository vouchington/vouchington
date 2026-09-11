import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import NewsPreferencesPage from './page'
import { PUBLISHER_TYPE_SLUGS } from '@/lib/publisher-types'

const { mockGetTopics, mockNewsPreferencesForm } = vi.hoisted(() => ({
  mockGetTopics: vi.fn<VitestLooseMock>(),
  mockNewsPreferencesForm: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server/topics'), () => ({
  getTopics: mockGetTopics,
}))

vi.mock(import('@/components/my/news-preferences-form'), () => ({
  NewsPreferencesForm: (props: { publisherTypes: { id: string; name: string }[] }) => {
    mockNewsPreferencesForm(props)
    return (
      <ul>
        {props.publisherTypes.map(t => (
          <li key={t.id}>{t.name}</li>
        ))}
      </ul>
    )
  },
}))

const mockTopics = {
  'topic-1': { id: 'topic-1', slug: PUBLISHER_TYPE_SLUGS[0], name: 'Type A' },
  'topic-2': { id: 'topic-2', slug: PUBLISHER_TYPE_SLUGS[1], name: 'Type B' },
}

describe('NewsPreferencesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches publisher types and passes them to NewsPreferencesForm', async () => {
    mockGetTopics.mockResolvedValue({ topics: mockTopics })
    render(await NewsPreferencesPage())

    expect(screen.getByText('News Preferences')).toBeInTheDocument()
    expect(document.querySelector(`[data-pw="settings-page-header"]`)).toBeInTheDocument()
    expect(
      screen.getByText('Control which types of publishers appear in your feeds.'),
    ).toBeInTheDocument()
    expect(mockGetTopics).toHaveBeenCalledWith({
      searchParams: {
        slugs: PUBLISHER_TYPE_SLUGS.join(','),
        limit: PUBLISHER_TYPE_SLUGS.length,
      },
    })
    expect(screen.getByText('Type A')).toBeDefined()
    expect(screen.getByText('Type B')).toBeDefined()
  })

  it('passes empty array to form when API returns no topics', async () => {
    mockGetTopics.mockResolvedValue(null)
    render(await NewsPreferencesPage())

    expect(mockNewsPreferencesForm).toHaveBeenCalledWith(
      expect.objectContaining({ publisherTypes: [] }),
    )
  })

  it('preserves PUBLISHER_TYPE_SLUGS ordering', async () => {
    const slug0 = PUBLISHER_TYPE_SLUGS[0]
    const slug1 = PUBLISHER_TYPE_SLUGS[1]
    mockGetTopics.mockResolvedValue({
      topics: {
        'topic-b': { id: 'topic-b', slug: slug1, name: 'Second' },
        'topic-a': { id: 'topic-a', slug: slug0, name: 'First' },
      },
    })
    const { container } = render(await NewsPreferencesPage())

    const items = [...container.querySelectorAll('li')]
    expect(items[0]?.textContent).toBe('First')
    expect(items[1]?.textContent).toBe('Second')
  })
})
