import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLandingPageEditorController } from '../landing-page-editor-controller'
import type {
  LandingPageCandidates,
  LandingPageItem,
  LandingPageWithItems,
} from '@/types/landing-pages'

const routerMock = { push: vi.fn<VitestLooseMock>(), replace: vi.fn<VitestLooseMock>() }

vi.mock(
  import('next/navigation'),
  () => ({ useRouter: () => routerMock }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client'), () => ({
  deleteMyLandingPage: vi.fn<VitestLooseMock>(),
  replaceMyLandingPageItems: vi.fn<VitestLooseMock>(),
  setDefaultMyLandingPage: vi.fn<VitestLooseMock>(),
  updateMyLandingPage: vi.fn<VitestLooseMock>(),
}))

const items: LandingPageItem[] = [
  { id: 'a', type: 'link', label: 'A', url: 'https://a.example' },
  { id: 'b', type: 'link', label: 'B', url: 'https://b.example' },
]

const page: LandingPageWithItems = {
  id: 'page-1',
  user_id: 'user-1',
  title: 'My Page',
  subtitle: null,
  slug: 'my-page',
  is_default: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  items,
}

const candidates: LandingPageCandidates = { profile_links: [], reviews: [], referral_links: [] }

function setup() {
  return renderHook(() => useLandingPageEditorController(page, candidates))
}

describe('useLandingPageEditorController', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clears selection state when the add type changes', () => {
    const { result } = setup()
    act(() => result.current.setSelectedCandidateId('x'))
    act(() => result.current.setSelectedTopicId('t'))
    act(() => result.current.handleSetAddType('profile_link'))
    expect(result.current.addType).toBe('profile_link')
    expect(result.current.selectedCandidateId).toBe('')
    expect(result.current.selectedTopicId).toBe('')
  })

  it('clears group selections when the topic changes', () => {
    const { result } = setup()
    act(() => result.current.setSelectedGroupReviewIds(['r']))
    act(() => result.current.setSelectedTopicId('t'))
    expect(result.current.selectedTopicId).toBe('t')
    expect(result.current.selectedGroupReviewIds).toEqual([])
  })

  it('adds a free-form link and resets the link fields', () => {
    const { result } = setup()
    act(() => result.current.setLinkLabel('New'))
    act(() => result.current.setLinkUrl('https://new.example'))
    act(() => result.current.handleAddItem())
    expect(result.current.draftItems).toHaveLength(3)
    expect(result.current.linkLabel).toBe('')
    expect(result.current.linkUrl).toBe('')
  })

  it('moves and removes draft items', () => {
    const { result } = setup()
    act(() => result.current.moveItem(1, -1))
    expect(result.current.draftItems[0]!.id).toBe('b')
    act(() => result.current.removeItem(0))
    expect(result.current.draftItems).toHaveLength(1)
    expect(result.current.draftItems[0]!.id).toBe('a')
  })

  it('exposes group-entry move/remove handlers without throwing on non-group items', () => {
    const { result } = setup()
    act(() => result.current.moveGroupEntry(0, 0, 1))
    act(() => result.current.removeGroupEntry(0, 0))
    expect(result.current.draftItems).toHaveLength(2)
  })
})
