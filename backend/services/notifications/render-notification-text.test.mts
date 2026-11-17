import { describe, expect, it } from 'vitest'
import { notificationTranslator } from './notification-translator.mts'
import { renderNotificationText } from './render-notification-text.mts'
import type { Notification, NotificationHydration } from './types.mts'

const none = {
  post_id: null,
  top_post_id: null,
  rss_feed_item_id: null,
  actor_user_id: null,
  sent_by_id: null,
  community_id: null,
  community_application_id: null,
  review_dispute_id: null,
  moderation_appeal_id: null,
  user_warning_id: null,
  copyright_notice_id: null,
  copyright_notice_delivery_work_item_id: null,
}

const hydration: NotificationHydration = {
  communities: { c1: { id: 'c1', slug: 'club', name: 'Book Club' } },
  actors: { u1: { id: 'u1', username: 'ada' } },
  posts: {
    p1: {
      id: 'p1',
      post_type: 'discussion',
      snippet: 'Hello world',
      actor_user_id: 'u1',
      community_id: 'c1',
    },
  },
  rss_feed_items: {},
  copyright_notices: {},
  public_texts: { w1: 'Be kind.' },
}

function render(
  notification: Partial<Notification> & Pick<Notification, 'kind'>,
  locale = 'en',
  facts = hydration,
) {
  return renderNotificationText(
    notificationTranslator(locale),
    { ...none, params: {}, ...notification },
    facts,
  )
}

describe('renderNotificationText', () => {
  it('names the live author and quotes the live snippet of a new post', () => {
    expect(render({ kind: 'post_new', post_id: 'p1' })).toEqual({
      title: expect.stringContaining('@ada'),
      body: 'Hello world',
    })
  })

  it('falls back to a generic title and no body when the post is gone', () => {
    const gone = render({ kind: 'post_new', post_id: 'missing' })
    expect(gone.body).toBe('')
    expect(gone.title).not.toContain('@')
    expect(gone.title).not.toMatch(/^notifications\./)
  })

  it('renders the owning row public text for a warning', () => {
    expect(render({ kind: 'user_warning', user_warning_id: 'w1' }).body).toContain('Be kind.')
  })

  it('renders a localized title for another catalog locale', () => {
    const english = render({ kind: 'community_ban', community_id: 'c1' })
    const spanish = render({ kind: 'community_ban', community_id: 'c1' }, 'es')
    expect(spanish.title).not.toBe(english.title)
    expect(spanish.title).not.toMatch(/^notifications\./)
  })

  it('reads English for an unsupported locale', () => {
    expect(render({ kind: 'community_ban', community_id: 'c1' }, 'xx')).toEqual(
      render({ kind: 'community_ban', community_id: 'c1' }),
    )
  })
})
