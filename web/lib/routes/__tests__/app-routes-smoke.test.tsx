import '@/test-helpers/i18n/mock-json-messages'
import '@/test-helpers/lib/routes/thin-route-coverage.mock-support'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

// Static imports for tags page function-body coverage (lines inside the async page
// function that are only executed when the component is actually called/rendered).

import * as linksPage from '../../../app/(posts)/links/page'
import * as bankAccountTagsPage from '../../../app/(topics)/bank-account/[id]/tags/[objectType]/page'
import * as cardTagsPage from '../../../app/(topics)/card/[id]/tags/[objectType]/page'
import * as instanceTagsPage from '../../../app/(topics)/instance/[id]/tags/[objectType]/page'
import * as referralProgramTagsPage from '../../../app/(topics)/referral-program/[id]/tags/[objectType]/page'
import * as rewardsProgramTagsPage from '../../../app/(topics)/rewards-program/[id]/tags/[objectType]/page'
import * as rewardsProgramStatusTagsPage from '../../../app/(topics)/rewards-program-status/[id]/tags/[objectType]/page'
import * as sourceTagsPage from '../../../app/(topics)/source/[id]/tags/[objectType]/page'
import * as topicTagsPage from '../../../app/(topics)/topic/[id]/tags/[objectType]/page'

type TagsPageFn = (props: {
  params: Promise<{ id: string; objectType: string }>
}) => Promise<React.JSX.Element>

const allTagsPages: [string, { default: TagsPageFn }][] = [
  ['bank-account', bankAccountTagsPage as never],
  ['card', cardTagsPage as never],
  ['instance', instanceTagsPage as never],
  ['referral-program', referralProgramTagsPage as never],
  ['rewards-program', rewardsProgramTagsPage as never],
  ['rewards-program-status', rewardsProgramStatusTagsPage as never],
  ['source', sourceTagsPage as never],
  ['topic', topicTagsPage as never],
]

describe.each(allTagsPages)('%s topic tags page', (_slug, module) => {
  const TagsPage = module.default

  it('renders ManageTopicTags for valid objectType', async () => {
    const result = await TagsPage({
      params: Promise.resolve({ id: 'topic-1', objectType: 'topic' }),
    })
    render(result)
    expect(screen.getByTestId('manage-topic-tags')).toBeDefined()
  })

  it('calls notFound for invalid objectType', async () => {
    await expect(
      TagsPage({ params: Promise.resolve({ id: 'topic-1', objectType: 'invalid' }) }),
    ).rejects.toThrow('notFound')
  })
})

describe('links list page', () => {
  it('renders LinksPage', async () => {
    type LinksPageFn = (props: {
      searchParams: Promise<Record<string, string | string[] | undefined>>
    }) => Promise<React.JSX.Element>
    const LinksPage = linksPage.default as LinksPageFn
    const result = await LinksPage({ searchParams: Promise.resolve({}) })
    render(result)
    expect(screen.getByTestId('post-list-page')).toBeDefined()
  })
})
