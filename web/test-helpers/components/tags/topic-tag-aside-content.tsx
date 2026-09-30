/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { render, screen } from '@testing-library/react'
import { beforeAll, expect, test } from 'vitest'
import { createTranslator, type Translator } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import type { ReactNode } from 'react'
import type { EntityRelation } from '@/lib/api/entity-relations'
import type { Topic, TopicTypes } from '@/types/topics'
import { makeTopic } from '@/test-helpers/api-responses/topics'

type TopicTagAsideContentProps = {
  topic: Topic
  relations: EntityRelation[]
  showManageButton: boolean
  t: Translator
}

type TopicTagAsideCase = {
  topic?: Partial<Topic> & { topic_type?: TopicTypes }
  showManageButton: boolean
}

function makeTopicAsideTopic(overrides: TopicTagAsideCase['topic'] = {}): Topic {
  return makeTopic({
    id: 'topic-1',
    topic_type: 'card',
    name: 'Test Topic',
    slug: 'test-topic',
    referral_program_id: null,
    ...overrides,
  })
}

export function registerTopicTagAsideContentTests(options: {
  Component: (props: TopicTagAsideContentProps) => ReactNode
  heading: string
  cardManageHref: string
  rewardsProgramManageHref: string
  referralProgramManageHref: string
  mockManageTagsDialog: VitestLooseMock
}): void {
  const {
    Component,
    heading,
    cardManageHref,
    rewardsProgramManageHref,
    referralProgramManageHref,
    mockManageTagsDialog,
  } = options
  let translator: Translator | undefined

  beforeAll(() => {
    translator = createTranslator('en', enMessages)
  })

  function renderAside(testCase: TopicTagAsideCase): void {
    if (translator === undefined) {
      throw new Error('topic aside translator was not initialized')
    }
    render(
      <Component
        topic={makeTopicAsideTopic(testCase.topic)}
        relations={[]}
        showManageButton={testCase.showManageButton}
        t={translator}
      />,
    )
  }

  function manageHref(): unknown {
    const props = mockManageTagsDialog.mock.lastCall?.[0] as { manageHref?: unknown } | undefined
    return props?.manageHref
  }

  test(`renders ${heading} heading`, () => {
    renderAside({ showManageButton: false })
    expect(screen.getByText(heading)).toBeDefined()
  })

  test('does not render the manage dialog when showManageButton is false', () => {
    renderAside({ showManageButton: false })
    expect(screen.queryByTestId('manage-tags-dialog')).toBeNull()
  })

  test('wires the manage dialog using topic slug for card topic type', () => {
    renderAside({ topic: { topic_type: 'card' }, showManageButton: true })
    expect(screen.getByTestId('manage-tags-dialog')).toBeDefined()
    expect(manageHref()).toBe(cardManageHref)
  })

  test('uses topic slug and maps enum to hyphenated type slug for rewards_program', () => {
    renderAside({
      topic: { id: 'rp-1', topic_type: 'rewards_program' },
      showManageButton: true,
    })
    expect(manageHref()).toBe(rewardsProgramManageHref)
  })

  test('uses topic slug and maps enum to hyphenated type slug for referral_program', () => {
    renderAside({
      topic: { id: 'ref-1', topic_type: 'referral_program' },
      showManageButton: true,
    })
    expect(manageHref()).toBe(referralProgramManageHref)
  })
}
