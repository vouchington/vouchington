import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { LandingPageItemEditor } from './item-picker'
import type { LandingPageItemOptions, LandingPageAddType } from './options'

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
      SelectContent: () => null,
      SelectItem: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

const emptyOptions: LandingPageItemOptions = {
  availableProfileLinks: [],
  availableReviews: [],
  availableReferralLinks: [],
  availableGroupReviews: [],
  availableGroupReferralLinks: [],
  topicOptions: [],
}

const noop = () => undefined

function renderEditor(overrides: {
  addType: LandingPageAddType
  options?: LandingPageItemOptions
  selectedCandidateId?: string
  selectedTopicId?: string
  linkLabel?: string
  linkUrl?: string
  selectedGroupReviewIds?: string[]
}) {
  return render(
    <LandingPageItemEditor
      loading={false}
      addType={overrides.addType}
      selectedCandidateId={overrides.selectedCandidateId ?? ''}
      selectedTopicId={overrides.selectedTopicId ?? ''}
      selectedGroupReviewIds={overrides.selectedGroupReviewIds ?? []}
      selectedGroupReferralIds={[]}
      options={overrides.options ?? emptyOptions}
      linkLabel={overrides.linkLabel ?? ''}
      linkUrl={overrides.linkUrl ?? ''}
      onAddTypeChange={noop}
      setSelectedCandidateId={noop}
      setSelectedTopicId={noop}
      setSelectedGroupReviewIds={noop}
      setSelectedGroupReferralIds={noop}
      setLinkLabel={noop}
      setLinkUrl={noop}
      onAddItem={noop}
      onSaveItems={noop}
      draftItems={[]}
      moveItem={noop}
      removeItem={noop}
      moveGroupEntry={noop}
      removeGroupEntry={noop}
    />,
  )
}

function addButton(container: HTMLElement): HTMLButtonElement {
  return container.querySelector('[data-pw="landing-page-add-item-button"]') as HTMLButtonElement
}

function emptyHint(container: HTMLElement): Element | null {
  return container.querySelector('[data-pw="landing-page-add-item-empty-hint"]')
}

describe('LandingPageItemEditor add-item gating', () => {
  it('disables Add and shows hint for empty profile_link pool', () => {
    const { container } = renderEditor({ addType: 'profile_link' })
    expect(addButton(container).disabled).toBe(true)
    expect(emptyHint(container)?.textContent).toMatch(/No profile links/)
  })

  it('disables Add and shows hint for empty review pool', () => {
    const { container } = renderEditor({ addType: 'review' })
    expect(addButton(container).disabled).toBe(true)
    expect(emptyHint(container)?.textContent).toMatch(/No public reviews/)
  })

  it('disables Add and shows hint for empty referral_link pool', () => {
    const { container } = renderEditor({ addType: 'referral_link' })
    expect(addButton(container).disabled).toBe(true)
    expect(emptyHint(container)?.textContent).toMatch(/No active referral links/)
  })

  it('disables Add and shows hint for empty topic_group pool', () => {
    const { container } = renderEditor({ addType: 'topic_group' })
    expect(addButton(container).disabled).toBe(true)
    expect(emptyHint(container)?.textContent).toMatch(/No topics/)
  })

  it('disables Add for topic_group when a topic is selected but no entries are checked', () => {
    const options: LandingPageItemOptions = {
      ...emptyOptions,
      topicOptions: [{ id: 't1', name: 'Topic 1', slug: 'topic-1', topic_type: 'topic' }],
    }
    const { container } = renderEditor({ addType: 'topic_group', options, selectedTopicId: 't1' })
    expect(addButton(container).disabled).toBe(true)
  })

  it('enables Add for topic_group with a selected topic and a checked entry', () => {
    const options: LandingPageItemOptions = {
      ...emptyOptions,
      topicOptions: [{ id: 't1', name: 'Topic 1', slug: 'topic-1', topic_type: 'topic' }],
    }
    const { container } = renderEditor({
      addType: 'topic_group',
      options,
      selectedTopicId: 't1',
      selectedGroupReviewIds: ['r1'],
    })
    expect(addButton(container).disabled).toBe(false)
  })

  it('enables Add for a valid link and renders the link fields', () => {
    const { container } = renderEditor({
      addType: 'link',
      linkLabel: 'My Link',
      linkUrl: 'https://example.com',
    })
    expect(container.querySelector('[data-pw="landing-page-add-link-label"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="landing-page-add-link-url"]')).not.toBeNull()
    expect(addButton(container).disabled).toBe(false)
  })

  it('disables Add for a profile_link with a selectable candidate but no selection', () => {
    const options: LandingPageItemOptions = {
      ...emptyOptions,
      availableProfileLinks: [
        {
          id: 'pl-1',
          user_id: 'u1',
          link_type: 'url',
          sort_order: 0,
          url: 'https://x.example',
          handle: null,
          name: 'X',
          image_id: null,
          created_at: '',
          updated_at: '',
        },
      ],
    }
    const { container } = renderEditor({ addType: 'profile_link', options })
    expect(addButton(container).disabled).toBe(true)
    expect(emptyHint(container)).toBeNull()
  })
})
