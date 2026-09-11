import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseTopicEditPage } = vi.hoisted(() => ({
  mockUseTopicEditPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ replace: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('../use-topic-edit-page'), () => ({ useTopicEditPage: mockUseTopicEditPage }))
vi.mock(import('../topic-type-section'), () => ({
  TopicTypeSection: () => <div data-testid='type-section' />,
}))
vi.mock(import('../spending-category-section'), () => ({
  SpendingCategorySection: () => <div data-testid='spending-section' />,
}))
vi.mock(import('../type-attributes-section'), () => ({
  TypeAttributesSection: ({
    topicId,
    typeAttributeNames,
  }: {
    topicId: string
    typeAttributeNames: Record<string, string>
  }) => (
    <div
      data-testid='type-attrs-section'
      data-topic-id={topicId}
      data-names={JSON.stringify(typeAttributeNames)}
    />
  ),
}))

import { BehaviorClient } from '../behavior-client'

const handlers = {
  handleTypeSubmit: vi.fn<VitestLooseMock>(),
  setTopicTypeValue: vi.fn<VitestLooseMock>(),
  handleTypeAttrSubmit: vi.fn<VitestLooseMock>(),
  handleSpendingSubmit: vi.fn<VitestLooseMock>(),
  setIsForeignTransaction: vi.fn<VitestLooseMock>(),
  setSpendingFrequency: vi.fn<VitestLooseMock>(),
}

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    topic: { id: 'topic-1', topic_type: 'rewards_program' },
    topicTypeValue: 'rewards_program',
    typeSaving: false,
    typeAttributes: { company_id: 'company-1' },
    typeAttributeNames: { company_id: 'Acme Corp' },
    typeAttrSaving: false,
    isForeignTransaction: false,
    spendingFrequency: '',
    spendingSaving: false,
    loadError: null,
    ...overrides,
  }
}

describe('BehaviorClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the loaded topic identity and seeded names to TypeAttributesSection', () => {
    mockUseTopicEditPage.mockReturnValue({ handlers, state: makeState() })
    render(
      <BehaviorClient
        id='topic-1'
        topicType='rewards_program'
        initialData={{}}
      />,
    )
    const section = screen.getByTestId('type-attrs-section')
    expect(section.dataset.topicId).toBe('topic-1')
    expect(section.dataset.names).toBe(JSON.stringify({ company_id: 'Acme Corp' }))
  })

  it('supports an alias route identifier for the loaded topic', () => {
    mockUseTopicEditPage.mockReturnValue({ handlers, state: makeState() })
    render(
      <BehaviorClient
        id='legacy-topic-alias'
        topicType='rewards_program'
        initialData={{}}
      />,
    )
    expect(screen.getByTestId('type-attrs-section').dataset.topicId).toBe('topic-1')
  })

  it('renders the load error when present and no topic is loaded', () => {
    mockUseTopicEditPage.mockReturnValue({
      handlers,
      state: makeState({ topic: null, loadError: 'Boom' }),
    })
    render(
      <BehaviorClient
        id='topic-1'
        topicType='rewards_program'
        initialData={{}}
      />,
    )
    expect(screen.getByText('Boom')).toBeDefined()
  })

  it('renders a not-found message when the topic is missing without an error', () => {
    mockUseTopicEditPage.mockReturnValue({ handlers, state: makeState({ topic: null }) })
    render(
      <BehaviorClient
        id='topic-1'
        topicType='rewards_program'
        initialData={{}}
      />,
    )
    expect(screen.getByText('Topic not found')).toBeDefined()
  })
})
