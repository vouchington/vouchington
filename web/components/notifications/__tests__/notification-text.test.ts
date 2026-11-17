import { beforeAll, describe, expect, it } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import type { NotificationHydration, NotificationKind } from '@/types/api-responses'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import type { NotificationListNotification } from '../notification-list-notification'
import { renderNotificationText } from '../notification-text'
import type { NotificationT } from '../notification-text-types'

let t: NotificationT

const hydration = {
  actors: { 'user-1': { username: 'ada' } },
  communities: { 'community-1': { name: 'Makers' } },
  posts: {
    'post-review': {
      post_type: 'review',
      snippet: 'Great drill',
      actor_user_id: 'user-1',
      community_id: 'community-1',
    },
    'post-odd': { post_type: 'poll', snippet: 'Odd one' },
  },
  rss_feed_items: { 'item-1': { feed_name: 'Daily News', snippet: 'Headline' } },
  copyright_notices: {
    'notice-us': { jurisdiction: 'us_dmca' },
    'notice-eu': { jurisdiction: 'eu_dsa' },
    'notice-other': { jurisdiction: 'uk_cdpa' },
  },
  public_texts: { 'owner-1': 'Moderator says hi' },
} as unknown as Partial<NotificationHydration>

function render(
  kind: NotificationKind,
  fields: Partial<NotificationListNotification> = {},
  facts: Partial<NotificationHydration> = hydration,
) {
  const notification = {
    id: 'n-1',
    entity_type: 'notification',
    kind,
    params: {},
    read_at: null,
    created_at: '2026-11-16T00:00:00Z',
    target_path: null,
    ...fields,
  } as NotificationListNotification
  return renderNotificationText({ t, notification, hydration: facts })
}

describe('renderNotificationText', () => {
  beforeAll(async () => {
    t = createTranslator('en', await loadJsonMessages('en')) as NotificationT
  })

  it('names hydrated actors and falls back to anonymous copy when they are gone', () => {
    expect(render('follow', { actor_user_id: 'user-1' }).title).toBe('@ada started following you')
    expect(render('follow').title).toBe('Someone started following you')
    expect(render('follow_referral_signup', { actor_user_id: 'user-1' }).title).toContain('@ada')
    expect(render('follow_referral_signup').title).toBe('Your referral signed up and followed you!')
    expect(
      render('referral_signup', { actor_user_id: 'user-1', params: { referral_count: 1 } }),
    ).toEqual({
      title: '@ada signed up through your referral!',
      body: 'You now have 1 referral',
    })
    expect(render('referral_signup', { params: { referral_count: 3 } })).toEqual({
      title: 'Someone signed up through your referral!',
      body: 'You now have 3 referrals',
    })
  })

  it('renders title-only and fixed-copy kinds', () => {
    expect(render('referral_click')).toEqual({
      title: 'Someone clicked your referral link',
      body: '',
    })
    expect(render('direct_message').title).toBe('New direct message')
    expect(render('modmail').title).toBe('New modmail message')
    expect(render('household_invitation').body).not.toBe('')
    expect(render('report_reviewed').body).toBe('Thanks for helping keep Voucha safe.')
    expect(render('critical_moderation_alert').body).toBe('')
    expect(render('review_actioned_removed').body).toContain('removed your review')
    expect(render('review_actioned_note').body).toContain('contextual note')
    expect(render('community_ban').title).toBe('You have been banned from a community')
    expect(render('post_removed').title).toBe('Your post has been removed')
  })

  it('shows moderator text by owner id, with the warning default when it is missing', () => {
    expect(render('review_dispute_resolved', { review_dispute_id: 'owner-1' }).body).toBe(
      'Moderator says hi',
    )
    expect(render('moderation_appeal_resolved').body).toBe('')
    expect(render('moderation_appeal_resolved', { moderation_appeal_id: 'owner-1' }).body).toBe(
      'Moderator says hi',
    )
    expect(render('user_warning', { user_warning_id: 'owner-1' }).body).toBe('Moderator says hi')
    expect(render('user_warning').body).toBe('A moderator has issued a warning to your account.')
  })

  it('names the community, or the catalog fallback when it is hidden', () => {
    const inCommunity = { community_id: 'community-1' }
    expect(render('community_application_approved', inCommunity)).toEqual({
      title: 'Your application to Makers was approved',
      body: 'You are now a member of Makers.',
    })
    expect(render('community_application_rejected').body).toBe(
      'Your application to a community was not approved.',
    )
    expect(
      render('community_application_rejected', { community_application_id: 'owner-1' }).body,
    ).toBe('Reason: Moderator says hi')
    expect(render('community_ownership_received', inCommunity).title).toBe('You now own Makers')
    expect(render('community_ownership_transferred_away', inCommunity).body).toBe(
      'You transferred ownership of Makers.',
    )
    expect(
      render('community_role_changed', { params: { from_role: 'moderator', to_role: 'owner' } })
        .body,
    ).toBe('Your community role changed from moderator to owner.')
    expect(render('community_role_changed', { params: { to_role: 'banana' } }).body).toBe(
      'Your community role changed from member to member.',
    )
  })

  it('summarizes the activity digest with and without a visible top discussion', () => {
    const params = {
      community_count: 1,
      joins: 5,
      departures: 2,
      total_members: 40,
      active_posters: 10,
    }
    const plain = render('community_activity_digest', { params })
    expect(plain.title).toBe('Your weekly community activity')
    expect(plain.body).toContain('1 community: 5 joined, 2 departed (net 3); 40 total members')
    expect(plain.body).toContain('10 active members (25%)')
    const empty = render('community_activity_digest', { top_post_id: 'post-odd' })
    expect(empty.body).toContain('0 communities')
    expect(empty.body).toContain('(0%)')
    const top = render('community_activity_digest', {
      top_post_id: 'post-review',
      params: { ...params, top_discussion_replies: 7 },
    })
    expect(top.body).toContain('top discussion: Makers: Great drill (7 replies).')
  })

  it('titles posts by type and sender, with snippets as bodies', () => {
    expect(render('post_new', { post_id: 'post-review' })).toEqual({
      title: 'New review from @ada',
      body: 'Great drill',
    })
    expect(render('post_new', { post_id: 'post-odd' })).toEqual({
      title: 'New post',
      body: 'Odd one',
    })
    expect(render('post_new')).toEqual({ title: 'New post', body: '' })
    expect(render('post_reply', { post_id: 'post-review' }).title).toBe('New reply from @ada')
    expect(render('post_reply')).toEqual({ title: 'New reply', body: '' })
    expect(render('post_manual_send', { post_id: 'post-review', sent_by_id: 'user-1' }).title).toBe(
      '@ada sent you a review',
    )
    expect(render('post_manual_send', { post_id: 'post-odd' }).title).toBe(
      'Someone sent you a post',
    )
  })

  it('titles feed items by feed and sender', () => {
    expect(render('rss_item_new', { rss_feed_item_id: 'item-1' })).toEqual({
      title: 'New item from Daily News',
      body: 'Headline',
    })
    expect(render('rss_item_new')).toEqual({ title: 'New item from RSS Feed', body: '' })
    expect(
      render('rss_item_manual_send', { rss_feed_item_id: 'item-1', sent_by_id: 'user-1' }),
    ).toEqual({ title: '@ada sent you an article', body: 'Headline' })
    expect(render('rss_item_manual_send').title).toBe('Someone sent you an article')
  })

  it.each([
    ['copyright_claimant_receipt', 'Your copyright notice was received.'],
    ['copyright_status_update', 'There is an update to your copyright case.'],
    ['copyright_poster_restriction_notice', 'Review the case and available response options.'],
    ['copyright_poster_review_notice', 'A person reviewed the restriction.'],
    ['copyright_poster_restoration_notice', 'This restriction ended.'],
    ['copyright_owner_information_notice', 'An image on a community you own was withheld'],
    ['copyright_redress_decision_notice', 'A person decided your complaint.'],
  ] as const)('renders %s from its summary or catalog fallback', (kind, fallback) => {
    expect(render(kind).body).toContain(fallback)
    expect(
      render(kind, {
        copyright_notice_delivery_work_item_id: 'owner-1',
        params: { ai_assisted: true },
      }).body,
    ).toBe('Moderator says hi\n\nAutomated tools assisted with processing this case.')
  })

  it('picks the claimant decision fallback by jurisdiction', () => {
    const decision = (copyright_notice_id?: string) =>
      render('copyright_claimant_decision_notice', { copyright_notice_id }).body
    expect(decision('notice-us')).toContain('/copyright/notices/new')
    expect(decision('notice-us')).toContain('/copyright/designated-agent')
    expect(decision('notice-eu')).toContain('out-of-court dispute settlement')
    expect(decision('notice-other')).toBe(
      'Your copyright notice was decided. The decision statement gives the reasons. You may seek judicial redress through a court.',
    )
    expect(decision()).toBe(decision('notice-other'))
  })
})
