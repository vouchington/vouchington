import { describe, it, expect } from 'vitest'
import {
  agentConversationHref,
  agentHref,
  chatHref,
  chatSupportThreadHref,
  compareHref,
  createAgentPathname,
  createCommunityPathname,
  createDomainPathname,
  createPostPathname,
  createUserPathname,
  createUrlPathname,
  crmContactHref,
  domainHref,
  landingPageHref,
  landingPageNamedHref,
  membershipGrantsHref,
  messagesHref,
  modmailThreadHref,
  myLandingPageHref,
  myLandingPagesHref,
  myMembershipHref,
  plansHref,
  podcastCategoryHref,
  podcastsHref,
  reviewHref,
  supportContactHref,
  supportContactsHref,
  supportThreadHref,
  topicClaimHref,
  topicRecommendationHref,
  urlHref,
} from '../entity-href'

describe('agentHref', () => {
  it('uses slug when available', () => {
    expect(agentHref({ id: 'uuid-1', slug: 'my-agent' })).toBe('/agent/my-agent')
  })

  it('falls back to id when slug is null', () => {
    expect(agentHref({ id: 'uuid-1', slug: null })).toBe('/agent/uuid-1')
  })

  it('falls back to id when slug is blank', () => {
    expect(agentHref({ id: 'uuid-1', slug: '' })).toBe('/agent/uuid-1')
  })

  it('falls back to id when slug is undefined', () => {
    expect(agentHref({ id: 'uuid-1' })).toBe('/agent/uuid-1')
  })
})

describe('createAgentPathname', () => {
  it('appends agent subpaths', () => {
    expect(createAgentPathname({ id: 'uuid-1', slug: 'my-agent' }, '/settings')).toBe(
      '/agent/my-agent/settings',
    )
  })
})

describe('agentConversationHref', () => {
  it('builds agent conversation paths', () => {
    expect(agentConversationHref({ id: 'agent-1', slug: 'writer' }, { id: 'conv-1' })).toBe(
      '/agent/writer/conversation/conv-1',
    )
  })
})

describe('chatHref', () => {
  it('builds the chat path from the conversation id', () => {
    expect(chatHref({ id: 'conv-1' })).toBe('/chat/conv-1')
  })
})

describe('chatSupportThreadHref', () => {
  it('builds the user-facing support thread path', () => {
    expect(chatSupportThreadHref({ id: 'thread-1' })).toBe('/chat/support/thread-1')
  })
})

describe('messagesHref', () => {
  it('builds the messages path from the conversation id', () => {
    expect(messagesHref('conv-1')).toBe('/messages/conv-1')
  })
})

describe('modmailThreadHref', () => {
  it('builds modmail thread paths', () => {
    expect(modmailThreadHref('community-a', { id: 'thread-1' })).toBe(
      '/messages/modmail/community-a/thread-1',
    )
  })
})

describe('crmContactHref', () => {
  it('builds the CRM contact path from the contact id', () => {
    expect(crmContactHref({ id: 'contact-1' })).toBe('/crm/contact-1')
  })
})

describe('entity primitives', () => {
  it('builds user subpaths', () => {
    expect(createUserPathname({ username: 'alice', id: 'u1' }, '/admin')).toBe('/user/alice/admin')
  })

  it('builds community subpaths', () => {
    expect(createCommunityPathname('rewards', '/settings/moderation')).toBe(
      '/communities/rewards/settings/moderation',
    )
  })

  it('builds URL entity paths', () => {
    expect(createUrlPathname({ id: 'url-1' }, '/crawls/crawl-1')).toBe('/url/url-1/crawls/crawl-1')
    expect(urlHref('url-1')).toBe('/url/url-1')
  })

  it('builds post paths from a route slug', () => {
    expect(createPostPathname('review', { id: 'review-1', slug: 'great-card' })).toBe(
      '/review/great-card',
    )
    expect(createPostPathname('discussion', 'discussion-1', '/comment/comment-1')).toBe(
      '/discussion/discussion-1/comment/comment-1',
    )
    expect(reviewHref({ id: 'review-1', slug: null })).toBe('/review/review-1')
  })

  it('builds domain entity paths', () => {
    expect(createDomainPathname({ hostname: 'example.com' }, '/settings')).toBe(
      '/domain/example.com/settings',
    )
    expect(domainHref('example.com')).toBe('/domain/example.com')
  })
})

describe('admin and support hrefs', () => {
  it('builds support entity paths', () => {
    expect(supportThreadHref({ id: 'thread-1' })).toBe('/support/threads/thread-1')
    expect(supportContactHref({ id: 'contact-1' })).toBe('/support/contacts/contact-1')
    expect(supportContactsHref('?q=alice')).toBe('/support/contacts?q=alice')
  })

  it('builds membership surface paths', () => {
    expect(plansHref()).toBe('/plans')
    expect(myMembershipHref()).toBe('/my/membership')
    expect(membershipGrantsHref()).toBe('/memberships/grants')
  })
})

describe('topic recommendation and claim hrefs', () => {
  it('builds topic recommendation detail and edit paths', () => {
    expect(topicRecommendationHref({ id: 'rec-1' })).toBe('/topic-recommendations/rec-1')
    expect(topicRecommendationHref('rec-1', '/edit')).toBe('/topic-recommendations/rec-1/edit')
  })

  it('builds topic claim paths', () => {
    expect(topicClaimHref('topic-1')).toBe('/topic-claims/topic-1')
  })
})

describe('landing page hrefs', () => {
  it('builds public landing page paths', () => {
    expect(landingPageHref({ username: 'alice' })).toBe('/@alice')
    expect(landingPageNamedHref('alice', 'bonus')).toBe('/@alice/bonus')
    expect(landingPageNamedHref('alice', null)).toBe('/@alice')
  })

  it('builds owner landing page paths', () => {
    expect(myLandingPagesHref()).toBe('/my/landing-pages')
    expect(myLandingPageHref({ slug: 'bonus' })).toBe('/my/landing-page/bonus')
    expect(myLandingPageHref('bonus', '/analytics')).toBe('/my/landing-page/bonus/analytics')
  })
})

describe('compareHref', () => {
  it('builds compare paths', () => {
    expect(compareHref('alpha-vs-beta')).toBe('/compare/alpha-vs-beta')
  })
})

describe('podcastsHref', () => {
  it('builds the podcast hub path', () => {
    expect(podcastsHref()).toBe('/podcasts')
  })
})

describe('podcastCategoryHref', () => {
  it('builds podcast category paths from a string slug', () => {
    expect(podcastCategoryHref('technology')).toBe('/podcasts/technology')
  })

  it('builds podcast category paths from a slug object', () => {
    expect(podcastCategoryHref({ slug: 'business' })).toBe('/podcasts/business')
  })
})

describe('domainHref hostname object forms', () => {
  it('builds domain path from a hostname object', () => {
    expect(domainHref({ hostname: 'example.com' })).toBe('/domain/example.com')
  })

  it('builds domain path from an id object without hostname', () => {
    expect(domainHref({ id: 'domain-1' })).toBe('/domain/domain-1')
  })
})
