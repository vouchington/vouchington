import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { TopicIdAttribute } from '../type-attributes-fields'
import { topicReferenceFieldTypes } from '../topic-edit-model'
import type { TopicTypes } from '@/types/topics'

const capturedTopicTypes: Array<TopicTypes[] | undefined> = []

// Capture the topicTypes prop that TopicIdAttribute derives from topicReferenceFieldTypes.
vi.mock(import('@/components/posts/topic-autocomplete'), () => ({
  TopicAutocomplete: ({ topicTypes }: { topicTypes?: TopicTypes[] }) => {
    capturedTopicTypes.push(topicTypes)
    return <div data-testid='topic-autocomplete' />
  },
}))

describe('TopicIdAttribute topicTypes filter', () => {
  beforeEach(() => {
    capturedTopicTypes.length = 0
  })

  it('passes the rewards_program filter for rewards_program_id', () => {
    render(
      <TopicIdAttribute
        fieldId='rewards_program_id'
        label='Rewards Program'
        value={null}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(capturedTopicTypes[0]).toEqual(['rewards_program'])
  })

  it('passes the rewards_program_status filter for lifetime_version_id', () => {
    render(
      <TopicIdAttribute
        fieldId='lifetime_version_id'
        label='Lifetime Version'
        value={null}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(capturedTopicTypes[0]).toEqual(['rewards_program_status'])
  })

  it('passes undefined (unfiltered) for company_id', () => {
    render(
      <TopicIdAttribute
        fieldId='company_id'
        label='Company'
        value={null}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(capturedTopicTypes[0]).toBeUndefined()
  })

  it('derives the filter from the canonical topicReferenceFieldTypes map', () => {
    expect(topicReferenceFieldTypes.rewards_program_id).toEqual(['rewards_program'])
    expect(topicReferenceFieldTypes.referral_program_id).toEqual(['referral_program'])
    expect(topicReferenceFieldTypes.lifetime_version_id).toEqual(['rewards_program_status'])
    expect(topicReferenceFieldTypes.company_id).toBeNull()
    expect(topicReferenceFieldTypes.bank_id).toBeNull()
    expect(topicReferenceFieldTypes.brand_id).toBeNull()
  })
})
