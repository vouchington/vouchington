import { describe, expect, it, vi } from 'vitest'
import { addFreeformLinkItem, addTopicGroupLandingPageItem } from './controller-add-items'

describe('addFreeformLinkItem', () => {
  it('adds a link item to the draft list and returns true', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({
      label: 'My Website',
      url: 'https://example.com',
      setDraftItems,
    })

    expect(result).toBe(true)
    expect(setDraftItems).toHaveBeenCalledOnce()
    const updater = setDraftItems.mock.calls[0]![0] as (prev: unknown[]) => unknown[]
    const updated = updater([]) as Array<{ type: string; label: string; url: string }>
    expect(updated).toHaveLength(1)
    expect(updated[0]!.type).toBe('link')
    expect(updated[0]!.label).toBe('My Website')
    expect(updated[0]!.url).toBe('https://example.com')
  })

  it('trims whitespace from label and url', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    addFreeformLinkItem({
      label: '  My Website  ',
      url: '  https://example.com  ',
      setDraftItems,
    })

    const updater = setDraftItems.mock.calls[0]![0] as (prev: unknown[]) => unknown[]
    const item = (updater([]) as Array<{ type: string; label: string; url: string }>)[0]!
    expect(item.label).toBe('My Website')
    expect(item.url).toBe('https://example.com')
  })

  it('returns false and does not call setDraftItems when label is empty', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({ label: '', url: 'https://example.com', setDraftItems })

    expect(result).toBe(false)
    expect(setDraftItems).not.toHaveBeenCalled()
  })

  it('returns false and does not call setDraftItems when label is whitespace only', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({ label: '   ', url: 'https://example.com', setDraftItems })

    expect(result).toBe(false)
    expect(setDraftItems).not.toHaveBeenCalled()
  })

  it('returns false and does not call setDraftItems when url is empty', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({ label: 'My Link', url: '', setDraftItems })

    expect(result).toBe(false)
    expect(setDraftItems).not.toHaveBeenCalled()
  })

  it('returns false for URLs with fragments', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({
      label: 'Section link',
      url: 'https://example.com/#section',
      setDraftItems,
    })

    expect(result).toBe(false)
    expect(setDraftItems).not.toHaveBeenCalled()
  })

  it('returns false for javascript: URLs', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const scriptUrl = 'javascript:alert(1)'
    const result = addFreeformLinkItem({
      label: 'Evil',
      url: scriptUrl,
      setDraftItems,
    })

    expect(result).toBe(false)
    expect(setDraftItems).not.toHaveBeenCalled()
  })

  it('accepts http:// URLs', () => {
    const setDraftItems = vi.fn<VitestLooseMock>()
    const result = addFreeformLinkItem({
      label: 'HTTP link',
      url: 'http://example.com',
      setDraftItems,
    })

    expect(result).toBe(true)
  })
})

describe('addTopicGroupLandingPageItem', () => {
  it('adds the selected review and referral entries for the chosen topic', () => {
    const review = {
      id: 'review-1',
      title: 'Useful review',
      declared_language: 'en',
      lingua_rs_detected_language: 'en',
      slug: 'useful-review',
      markdown: '',
      created_at: '',
      review_topic_ratings: [
        {
          topic_id: 'topic-1',
          topic_name: 'Topic one',
          topic_slug: 'topic-one',
          rating: 5,
          order_index: 0,
        },
      ],
    }
    const referralLink = {
      id: 'referral-1',
      referral_program_id: 'topic-1',
      referral_program_name: 'Topic one',
      referral_program_slug: 'topic-one',
      label: 'Referral',
      url: 'https://example.com/referral',
    }
    const setDraftItems =
      vi.fn<Parameters<typeof addTopicGroupLandingPageItem>[0]['setDraftItems']>()
    const onAdded = vi.fn<() => void>()

    addTopicGroupLandingPageItem({
      candidates: { profile_links: [], reviews: [review], referral_links: [referralLink] },
      itemOptions: {
        availableProfileLinks: [],
        availableReviews: [],
        availableReferralLinks: [],
        availableGroupReviews: [review],
        availableGroupReferralLinks: [referralLink],
        topicOptions: [
          { id: 'topic-1', name: 'Topic one', slug: 'topic-one', topic_type: 'topic' },
        ],
      },
      onAdded,
      selectedGroupReferralIds: ['referral-1'],
      selectedGroupReviewIds: ['review-1'],
      selectedTopicId: 'topic-1',
      setDraftItems,
    })

    expect(onAdded).toHaveBeenCalledOnce()
    const update = setDraftItems.mock.calls[0]![0]
    expect(update).toBeTypeOf('function')
    if (typeof update !== 'function') throw new Error('Expected a draft item update function')
    const [group] = update([])
    if (!group || group.type !== 'topic_group') throw new Error('Expected a topic group draft item')
    expect(group.topic.id).toBe('topic-1')
    expect(group.entries).toEqual([
      { id: expect.any(String), type: 'review', review },
      { id: expect.any(String), type: 'referral_link', referral_link: referralLink },
    ])
  })
})
