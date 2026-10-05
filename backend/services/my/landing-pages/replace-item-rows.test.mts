import { describe, expect, it } from 'vitest'

import { buildLandingPageInsertRows } from './replace-item-rows.mts'

describe('buildLandingPageInsertRows', () => {
  it('projects every item and group-member target into aligned batch rows', () => {
    const result = buildLandingPageInsertRows(
      [
        { type: 'profile_link', profile_link_id: 'profile' },
        { type: 'review', review_post_id: 'review' },
        { type: 'referral_link', referral_link_id: 'referral' },
        {
          type: 'topic_group',
          topic_id: 'topic',
          entries: [
            { type: 'review', review_post_id: 'group-review' },
            { type: 'referral_link', referral_link_id: 'group-referral' },
          ],
        },
        { type: 'link', label: ' Label ', url: ' https://example.com ' },
      ],
      new Map([['https://example.com', 'url-id']]),
    )

    expect(result.itemRows.map(row => row.type)).toEqual([
      'profile_link',
      'review',
      'referral_link',
      'topic_group',
      'link',
    ])
    expect(result.itemRows[4]).toMatchObject({ linkLabel: 'Label', urlId: 'url-id' })
    expect(result.groupMemberRows).toEqual([
      {
        parentSortOrder: 3,
        referralLinkId: null,
        reviewId: 'group-review',
        sortOrder: 0,
        type: 'review',
      },
      {
        parentSortOrder: 3,
        referralLinkId: 'group-referral',
        reviewId: null,
        sortOrder: 1,
        type: 'referral_link',
      },
    ])
  })
})
