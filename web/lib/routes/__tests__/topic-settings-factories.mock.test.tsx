import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetTopic, mockNotFound, mockRedirect, mockGetCurrentUser, mockCreateNoIndexMetadata } =
  vi.hoisted(() => ({
    mockGetTopic: vi.fn<VitestLooseMock>(),
    mockNotFound: vi.fn<VitestLooseMock>(() => {
      throw new Error('not-found')
    }),
    mockRedirect: vi.fn<VitestLooseMock>(() => {
      throw new Error('redirect')
    }),
    mockGetCurrentUser: vi.fn<VitestLooseMock>(),
    mockCreateNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
  }))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: mockCreateNoIndexMetadata,
}))
vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('next/headers'), () => ({
  headers: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))
vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))
vi.mock(import('@/lib/api/server'), () => ({
  getTopic: mockGetTopic,
  getTopicSpendingCategoryAttributes: vi.fn<VitestLooseMock>().mockResolvedValue(null),
  getTopicTypeAttributesServer: vi.fn<VitestLooseMock>().mockResolvedValue(null),
}))
vi.mock(import('@/lib/links/entity-href'), () => ({
  topicManagementHref: vi.fn<VitestLooseMock>(() => '/settings/about'),
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
vi.mock(import('@/components/topics/settings/topic-edit-model'), () => ({
  resolveTypeAttributeNames: vi.fn<VitestLooseMock>().mockResolvedValue({}),
  typesWithAttributes: new Set(),
}))

import { createNoIndexMetadata } from '@/lib/seo/metadata'
import {
  createTopicSettingsAboutPage,
  createTopicSettingsBehaviorPage,
  createTopicSettingsPage,
} from '@/lib/routes/topic-settings-factories'

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

describe('topic settings factories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue(adminUser)
    mockGetTopic.mockResolvedValue({ topic: baseTopic })
  })

  describe('createTopicSettingsPage', () => {
    it('generateMetadata uses slug-based label', async () => {
      const { generateMetadata } = createTopicSettingsPage('source')
      await generateMetadata()
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Source Settings')
    })

    it('generateMetadata uses Topic label for topic slug', async () => {
      const { generateMetadata } = createTopicSettingsPage('topic')
      await generateMetadata()
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Topic Settings')
    })
  })

  describe('createTopicSettingsAboutPage', () => {
    it('generateMetadata uses slug-based label', async () => {
      const { generateMetadata } = createTopicSettingsAboutPage('source')
      await generateMetadata()
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Source Settings - About')
    })

    it('generateMetadata uses Card label', async () => {
      const { generateMetadata } = createTopicSettingsAboutPage('card')
      await generateMetadata()
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Card Settings - About')
    })
  })

  describe('createTopicSettingsBehaviorPage', () => {
    it('generateMetadata uses slug-based label', async () => {
      const { generateMetadata } = createTopicSettingsBehaviorPage('referral-program')
      await generateMetadata()
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Referral Program Settings - Behavior')
    })

    it('generateMetadata uses Topic label for topic slug', async () => {
      const { generateMetadata } = createTopicSettingsBehaviorPage('topic')
      await generateMetadata()
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Topic Settings - Behavior')
    })
  })
})
