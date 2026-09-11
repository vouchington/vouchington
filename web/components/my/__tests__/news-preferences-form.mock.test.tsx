import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NewsPreferencesForm } from '../news-preferences-form'
import type { Topic } from '@/types/topics'

const mockEntityBookmarkButton = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('@/components/shared/entity-bookmark-button'),
  () =>
    ({
      EntityBookmarkButton: (props: Record<string, unknown>) => mockEntityBookmarkButton(props),
    }) as unknown as typeof import('@/components/shared/entity-bookmark-button'),
)

const makePublisherType = (overrides: Partial<Topic> = {}): Topic =>
  ({
    __entity_type: 'topic',
    id: 'topic-1',
    name: 'Mainstream Media',
    slug: 'mainstream-media',
    markdown: '',
    aliases: [],
    topic_type: 'mainstream-media',
    created_at: '2024-01-01T00:00:00.000Z',
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    created_by: { id: 'user-1' },
    updated_by: { id: 'user-1' },
    ...overrides,
  }) as unknown as Topic

describe('NewsPreferencesForm', () => {
  beforeEach(() => {
    mockEntityBookmarkButton.mockReset()
    mockEntityBookmarkButton.mockReturnValue(<button type='button'>Mute</button>)
  })

  it('renders nothing when publisherTypes is empty', () => {
    const { container } = render(<NewsPreferencesForm publisherTypes={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a list item for each publisher type', () => {
    const types = [
      makePublisherType({ id: 't-1', name: 'Mainstream Media', slug: 'mainstream-media' }),
      makePublisherType({ id: 't-2', name: 'Corporate Media', slug: 'corporate-media' }),
    ]
    render(<NewsPreferencesForm publisherTypes={types} />)
    expect(screen.getByText('Mainstream Media')).toBeDefined()
    expect(screen.getByText('Corporate Media')).toBeDefined()
  })

  it('renders EntityBookmarkButton with mute preset for each type', () => {
    const types = [makePublisherType({ id: 't-1', name: 'Blog', slug: 'blog' })]
    render(<NewsPreferencesForm publisherTypes={types} />)
    expect(mockEntityBookmarkButton).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'topic',
        entityId: 't-1',
        preset: 'mute',
      }),
    )
  })

  it('does not pass inactiveLabel or activeLabel overrides (uses preset defaults)', () => {
    const types = [makePublisherType({ id: 't-1', name: 'Blog', slug: 'blog' })]
    render(<NewsPreferencesForm publisherTypes={types} />)
    expect(mockEntityBookmarkButton).toHaveBeenCalledWith(
      expect.not.objectContaining({
        inactiveLabel: expect.anything(),
        activeLabel: expect.anything(),
      }),
    )
  })

  it('passes data-pw with publisher type slug', () => {
    const types = [makePublisherType({ id: 't-1', name: 'Blog', slug: 'blog' })]
    render(<NewsPreferencesForm publisherTypes={types} />)
    expect(mockEntityBookmarkButton).toHaveBeenCalledWith(
      expect.objectContaining({
        'data-pw': 'news-pref-mute-blog',
      }),
    )
  })

  it('renders the Muted Publisher Types label', () => {
    const types = [makePublisherType()]
    render(<NewsPreferencesForm publisherTypes={types} />)
    expect(screen.getByText('Muted Publisher Types')).toBeDefined()
  })
})
