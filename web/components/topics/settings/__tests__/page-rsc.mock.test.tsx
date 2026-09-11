import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetTopic,
  mockNotFound,
  mockRedirect,
  mockGetCurrentUser,
  mockGetSpending,
  mockGetTypeAttrs,
} = vi.hoisted(() => ({
  mockGetTopic: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('not-found')
  }),
  mockRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('redirect')
  }),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetSpending: vi.fn<VitestLooseMock>(),
  mockGetTypeAttrs: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(import('@/lib/api/server'), () => ({
  getTopic: mockGetTopic,
  getTopicSpendingCategoryAttributes: mockGetSpending,
  getTopicTypeAttributesServer: mockGetTypeAttrs,
}))
vi.mock(
  import('@/components/topics/settings/about-client'),
  () =>
    ({
      AboutClient: () => null,
    }) as unknown as typeof import('@/components/topics/settings/about-client'),
)
vi.mock(
  import('@/components/topics/settings/behavior-client'),
  () =>
    ({
      BehaviorClient: () => null,
    }) as unknown as typeof import('@/components/topics/settings/behavior-client'),
)

import {
  createTopicSettingsAboutPage,
  createTopicSettingsBehaviorPage,
  createTopicSettingsPage,
} from '@/lib/routes/topic-settings-factories'

const { default: SettingsPage } = createTopicSettingsPage('topic')
const { default: AboutPage } = createTopicSettingsAboutPage('topic')
const { default: BehaviorPage } = createTopicSettingsBehaviorPage('topic')

const baseTopic = {
  __entity_type: 'topic' as const,
  id: 'topic-1',
  name: 'Topic One',
  slug: 'topic-one',
  topic_type: 'topic' as const,
  markdown: '',
  aliases: [],
  created_at: '2026-01-01T00:00:00.000Z',
  hostname_id: null,
  hostname: null,
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  created_by: { id: 'u1', display_name: null, display_name_url_id: null },
  updated_by: { id: 'u1', display_name: null, display_name_url_id: null },
}

const adminUser = { id: 'admin-1', roles: ['administrator'] }

function setupMocks() {
  mockGetCurrentUser.mockResolvedValue(adminUser)
  mockGetTopic.mockResolvedValue({ topic: baseTopic })
  mockGetSpending.mockResolvedValue({ spending_category_attributes: null })
  mockGetTypeAttrs.mockResolvedValue(null)
}

describe('createTopicSettingsPage factory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('redirects to / for non-admin users', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', roles: [] })
    await expect(SettingsPage({ params: Promise.resolve({ id: 'topic-1' }) })).rejects.toThrow(
      'redirect',
    )
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('calls notFound when getTopic returns null', async () => {
    mockGetTopic.mockResolvedValue(null)
    await expect(SettingsPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
      'not-found',
    )
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('redirects to settings/about for admin users with a valid topic', async () => {
    await expect(SettingsPage({ params: Promise.resolve({ id: 'topic-1' }) })).rejects.toThrow(
      'redirect',
    )
    expect(mockRedirect).toHaveBeenCalledWith('/topic/topic-one/settings/about')
  })
})

describe('createTopicSettingsAboutPage factory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('redirects to / for non-admin', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', roles: [] })
    await expect(AboutPage({ params: Promise.resolve({ id: 'topic-1' }) })).rejects.toThrow(
      'redirect',
    )
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('renders AboutClient for admin with valid topic', async () => {
    const result = await AboutPage({ params: Promise.resolve({ id: 'topic-1' }) })
    expect(result.props).toMatchObject({
      id: 'topic-1',
      topicType: 'topic',
      initialData: expect.objectContaining({ topic: baseTopic }),
    })
  })
})

describe('createTopicSettingsBehaviorPage factory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('redirects to / for non-admin', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', roles: [] })
    await expect(BehaviorPage({ params: Promise.resolve({ id: 'topic-1' }) })).rejects.toThrow(
      'redirect',
    )
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('renders BehaviorClient for admin with valid topic', async () => {
    const result = await BehaviorPage({ params: Promise.resolve({ id: 'topic-1' }) })
    expect(result.props).toMatchObject({
      id: 'topic-1',
      topicType: 'topic',
      initialData: expect.objectContaining({ topic: baseTopic }),
    })
  })

  it('keys editor clients by the requested identifier, including aliases', async () => {
    const aboutAliasResult = await AboutPage({
      params: Promise.resolve({ id: 'legacy-topic-alias' }),
    })
    const behaviorAliasResult = await BehaviorPage({
      params: Promise.resolve({ id: 'next-topic-alias' }),
    })

    expect(aboutAliasResult.key).toBe('legacy-topic-alias')
    expect(behaviorAliasResult.key).toBe('next-topic-alias')
  })

  it('resolves type-attribute names for a topic type that has attributes', async () => {
    mockGetTopic.mockImplementation(async (id: string) => {
      if (id === 'topic-1') return { topic: { ...baseTopic, topic_type: 'rewards_program' } }
      if (id === 'company-1') return { topic: { ...baseTopic, id: 'company-1', name: 'Acme Corp' } }
      return null
    })
    mockGetTypeAttrs.mockResolvedValue({ company_id: 'company-1' })

    const result = await BehaviorPage({ params: Promise.resolve({ id: 'topic-1' }) })
    expect(result).toBeTruthy()
    expect(mockGetTopic).toHaveBeenCalledWith('company-1')
  })
})
