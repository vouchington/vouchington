import { describe, it, expect, vi, beforeEach } from 'vitest'

import React from 'react'

import { render, screen, fireEvent } from '@testing-library/react'

import { PostForm } from '../../post-form'

const mockRouterPush = vi.fn<VitestLooseMock>()

const mockRouterBack = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: mockRouterPush,
        back: mockRouterBack,
      }),
    }) as unknown as typeof import('next/navigation'),
)

// PostSlugField (admin-only) reads useAuth; provide a non-admin user so it renders nothing.
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: { id: 'u1', roles: [] },
        isAuthenticated: true,
        logout: vi.fn<VitestLooseMock>(),
        setUser: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/lib/api/client/posts'), () => ({
  archivePost: vi.fn<VitestLooseMock>(),
  createPost: vi.fn<VitestLooseMock>(),
  updatePost: vi.fn<VitestLooseMock>(),
  unarchivePost: vi.fn<VitestLooseMock>(),
  addPostRating: vi.fn<VitestLooseMock>(),
  updatePostRating: vi.fn<VitestLooseMock>(),
  deletePostRating: vi.fn<VitestLooseMock>(),
  setPostImages: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/markdown'), () => ({
  previewMarkdown: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/images'), () => ({
  uploadImageFile: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/financial-profile'), () => ({
  updateMyFinancialProfile: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/entity-relations'), () => ({
  createEntityRelation: vi.fn<VitestLooseMock>(),
}))

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: mockToastError, success: mockToastSuccess },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('../../topic-autocomplete'), () => ({
  TopicAutocomplete: ({
    onChange,
    inputRef,
  }: {
    onChange: (id: string, name: string) => void
    inputRef?: React.Ref<HTMLInputElement>
  }) => (
    <div>
      <input
        type='text'
        ref={inputRef}
        aria-label='Search topics'
        data-testid='topic-search-input'
        readOnly
      />
      <button
        type='button'
        data-testid='topic-autocomplete'
        onClick={() => onChange('topic-1', 'Test Topic')}
      >
        Topic Autocomplete
      </button>
    </div>
  ),
}))

import { createPost, updatePost } from '@/lib/api/client/posts'

import { previewMarkdown } from '@/lib/api/client/markdown'

import { updateMyFinancialProfile } from '@/lib/api/client/financial-profile'

import { createEntityRelation } from '@/lib/api/client/entity-relations'

const mockCreatePost = vi.mocked(createPost)

const mockUpdatePost = vi.mocked(updatePost)

const mockPreviewMarkdown = vi.mocked(previewMarkdown)

const mockUpdateMyFinancialProfile = vi.mocked(updateMyFinancialProfile)

const mockCreateEntityRelation = vi.mocked(createEntityRelation)

// Valid review content: >= 150 chars, >= 30 words, >= 3 sentences.
const VALID_REVIEW_CONTENT =
  'This credit card offers fantastic rewards and I have been using it for over a year now. ' +
  'The annual fee is absolutely worth every penny when you factor in all the benefits available. ' +
  'The customer service team is very helpful and responsive, making it my top recommendation.'

describe('PostForm', () => {
  beforeEach(() => {
    mockRouterPush.mockClear()
    mockRouterBack.mockClear()
    mockCreatePost.mockClear()
    mockUpdatePost.mockClear()
    mockToastError.mockClear()
    mockPreviewMarkdown.mockClear()
    mockUpdateMyFinancialProfile.mockClear()
    mockCreateEntityRelation.mockClear()
  })

  it('review form topic rows use items-center alignment for symmetric padding', () => {
    const { container } = render(<PostForm postType='review' />)
    // The topic card row should have items-center, not items-start
    const topicRow = container.querySelector('.rounded-md.border.p-4')
    expect(topicRow).not.toBeNull()
    expect(topicRow?.className).toContain('items-center')
    expect(topicRow?.className).not.toContain('items-start')
  })

  it('disables submit button when review content is too short (chars)', () => {
    render(<PostForm postType='review' />)
    const textarea = screen.getByPlaceholderText('Write your post...')
    fireEvent.change(textarea, { target: { value: 'Too short.' } })
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled()
  })

  it('disables submit button when review has enough chars but too few words', () => {
    // 3 "words" of 50+ chars each — passes char check, fails word check
    const fewWords = `${'a'.repeat(50)} ${'b'.repeat(50)} ${'c'.repeat(51)}`
    render(<PostForm postType='review' />)
    const textarea = screen.getByPlaceholderText('Write your post...')
    fireEvent.change(textarea, { target: { value: fewWords } })
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled()
  })

  it('disables submit button when review has enough chars and words but too few sentences', () => {
    // 2 sentences with enough words and chars — passes char+word, fails sentence
    const twoSentences =
      'This credit card has excellent rewards and cashback programs that make everyday spending very worthwhile ' +
      'and I have been a cardholder for two years now enjoying every benefit available without any complaints. ' +
      'The annual fee is completely worth paying given all the perks and customer service you receive as a member'
    render(<PostForm postType='review' />)
    const textarea = screen.getByPlaceholderText('Write your post...')
    fireEvent.change(textarea, { target: { value: twoSentences } })
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled()
  })

  it('enables submit button when review content meets all minimums', () => {
    render(<PostForm postType='review' />)
    const textarea = screen.getByPlaceholderText('Write your post...')
    fireEvent.change(textarea, { target: { value: VALID_REVIEW_CONTENT } })
    expect(screen.getByRole('button', { name: 'Post' })).not.toBeDisabled()
  })

  it('shows live review content counter for review type when not content-locked', () => {
    render(<PostForm postType='review' />)
    // Counter shows mins even when textarea is empty
    expect(screen.getByText(/min 150 chars \/ 30 words \/ 3 sentences/)).toBeInTheDocument()
  })

  it('does not show review content counter for non-review post types', () => {
    render(<PostForm postType='discussion' />)
    expect(screen.queryByText(/min 150 chars/)).toBeNull()
  })

  it('initialReviewTopic seeds the first review row with the given topic name', () => {
    render(
      <PostForm
        postType='review'
        initialReviewTopic={{ id: 'seeded-topic', name: 'Seeded Card' }}
      />,
    )
    expect(screen.getByRole('radiogroup', { name: /Rating for Seeded Card/i })).toBeDefined()
    expect(screen.getByTestId('topic-autocomplete')).toBeDefined()
  })

  it('initialDiscussionCategories seeds category rows', () => {
    render(
      <PostForm
        postType='discussion'
        initialDiscussionCategories={[
          { id: 'cat-1', name: 'Category One' },
          { id: 'cat-2', name: 'Category Two' },
        ]}
      />,
    )
    expect(screen.getAllByTestId('topic-autocomplete')).toHaveLength(2)
  })
})
