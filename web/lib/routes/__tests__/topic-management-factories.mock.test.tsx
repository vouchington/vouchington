import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetTopic,
  mockNotFound,
  mockRedirect,
  mockGetCurrentUser,
  mockServerApiGet,
  mockReturnNullForMissingEntity,
  mockCreateNoIndexMetadata,
  emptyPageInfo,
} = vi.hoisted(() => ({
  mockGetTopic: vi.fn<VitestLooseMock>(),
  mockCreateNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('not-found')
  }),
  mockRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('redirect')
  }),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockServerApiGet: vi.fn<VitestLooseMock>(),
  mockReturnNullForMissingEntity: vi.fn<VitestLooseMock>((p: Promise<unknown>) => p),
  emptyPageInfo: { has_next_page: false, end_cursor: null, start_cursor: null },
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: mockCreateNoIndexMetadata,
}))
vi.mock(import('next/navigation'), () => ({
  notFound: mockNotFound as unknown as typeof import('next/navigation').notFound,
  redirect: mockRedirect as unknown as typeof import('next/navigation').redirect,
}))
vi.mock(import('next/headers'), () => ({
  headers: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))
vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))
vi.mock(
  import('@/lib/api/server'),
  () =>
    ({
      getTopic: mockGetTopic,
      getTopicAdditionalHostnames: vi
        .fn<VitestLooseMock>()
        .mockResolvedValue({ results: [], page_info: emptyPageInfo }),
      getTopicRssFeeds: vi.fn<VitestLooseMock>().mockResolvedValue({ results: [] }),
      getServerRssFeedCrawls: vi.fn<VitestLooseMock>().mockResolvedValue({ results: [] }),
      getTopicAliases: vi
        .fn<VitestLooseMock>()
        .mockResolvedValue({ results: [], page_info: emptyPageInfo }),
      serverApi: { get: mockServerApiGet },
    }) as unknown as typeof import('@/lib/api/server'),
)
vi.mock(import('@/lib/api/return-null-for-missing-entity'), () => ({
  returnNullForMissingEntity: mockReturnNullForMissingEntity,
}))
const {
  mockDomainsClientModule,
  mockSourceClientModule,
  mockMergeClientModule,
  mockAliasesClientModule,
} = vi.hoisted(() => ({
  mockDomainsClientModule: () =>
    ({
      DomainsClient: () => null,
    }) as unknown as typeof import('@/components/topics/settings/domains-client'),
  mockSourceClientModule: () =>
    ({
      SourceClient: () => null,
    }) as unknown as typeof import('@/components/topics/settings/source-client'),
  mockMergeClientModule: () =>
    ({
      MergeClient: () => null,
    }) as unknown as typeof import('@/components/topics/settings/merge-client'),
  mockAliasesClientModule: () =>
    ({
      AliasesClient: () => null,
    }) as unknown as typeof import('@/components/topics/aliases/aliases-client'),
}))
vi.mock(import('@/components/topics/settings/domains-client'), mockDomainsClientModule)
vi.mock(import('@/components/topics/settings/source-client'), mockSourceClientModule)
vi.mock(import('@/components/topics/settings/merge-client'), mockMergeClientModule)
vi.mock(import('@/components/topics/aliases/aliases-client'), mockAliasesClientModule)
vi.mock(
  import('@/components/topics/settings/referral-validations-settings'),
  () =>
    ({
      ReferralValidationsSettings: ({
        referralProgramId,
        linkedValidations,
      }: {
        referralProgramId: string
        linkedValidations: { id: string; slug: string }[]
      }) => (
        <div data-testid='referral-validations-settings'>
          <span>{referralProgramId}</span>
          <span>{linkedValidations.length}</span>
        </div>
      ),
    }) as unknown as typeof import('@/components/topics/settings/referral-validations-settings'),
)

import { createNoIndexMetadata } from '@/lib/seo/metadata'
import {
  createTopicSettingsAliasesPage,
  createTopicSettingsDomainsPage,
  createTopicSettingsMergePage,
  createTopicSettingsSourcePage,
  createTopicSettingsValidationsPage,
} from '@/lib/routes/topic-management-factories'

const { default: DomainsPage, generateMetadata: domainsMetadata } = createTopicSettingsDomainsPage()
const { default: SourcePage, generateMetadata: sourceMetadata } = createTopicSettingsSourcePage()
const { default: AliasesPage, generateMetadata: aliasesMetadata } = createTopicSettingsAliasesPage()
const { default: MergePage, generateMetadata: mergeMetadata } = createTopicSettingsMergePage()
const { default: ValidationsPage, generateMetadata: validationsMetadata } =
  createTopicSettingsValidationsPage()

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

const referralProgramTopic = {
  ...baseTopic,
  id: 'rp-topic-1',
  name: 'Chase Referral Program',
  slug: 'chase-referral',
  topic_type: 'referral_program' as const,
}

const adminUser = { id: 'admin-1', roles: ['administrator'] }

type SubPageProps = { params: Promise<{ id: string }> }

async function expectRedirectForNonAdmin(
  page: (props: SubPageProps) => Promise<unknown>,
  id: string,
) {
  mockGetCurrentUser.mockResolvedValue({ id: 'u1', roles: [] })
  await expect(page({ params: Promise.resolve({ id }) })).rejects.toThrow('redirect')
  expect(mockRedirect).toHaveBeenCalledWith('/')
}

describe('topic management factories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue(adminUser)
    mockGetTopic.mockResolvedValue({ topic: baseTopic })
  })

  describe('createTopicSettingsDomainsPage', () => {
    it('redirects to / for non-admin', () => expectRedirectForNonAdmin(DomainsPage, 'topic-1'))

    it('renders DomainsClient for admin with valid topic', async () => {
      const result = await DomainsPage({ params: Promise.resolve({ id: 'legacy-topic-alias' }) })
      expect(result.key).toBe('legacy-topic-alias')
    })

    it('generateMetadata uses topic type label in title', async () => {
      mockGetTopic.mockResolvedValueOnce({
        topic: { ...baseTopic, topic_type: 'card' as const },
      })
      await domainsMetadata({ params: Promise.resolve({ id: 'card-1' }) })
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Card Settings - Domains')
    })

    it('generateMetadata falls back to "Topic" when getTopic fails', async () => {
      mockGetTopic.mockRejectedValueOnce(new Error('network'))
      await domainsMetadata({ params: Promise.resolve({ id: 'topic-1' }) })
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Topic Settings - Domains')
    })
  })

  describe('createTopicSettingsSourcePage', () => {
    it('redirects to / for non-admin', () => expectRedirectForNonAdmin(SourcePage, 'topic-1'))

    it('renders SourceClient for admin with valid topic', async () => {
      mockGetTopic.mockResolvedValue({ topic: { ...baseTopic, topic_type: 'rss_feed' as const } })
      const result = await SourcePage({ params: Promise.resolve({ id: 'legacy-source-alias' }) })
      expect(result.key).toBe('legacy-source-alias')
    })

    it('generateMetadata uses topic type label and RSS Feed tab name', async () => {
      await sourceMetadata({ params: Promise.resolve({ id: 'topic-1' }) })
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Topic Settings - RSS Feed')
    })

    it('generateMetadata uses Source label for rss_feed topic type', async () => {
      mockGetTopic.mockResolvedValueOnce({
        topic: { ...baseTopic, topic_type: 'rss_feed' as const },
      })
      await sourceMetadata({ params: Promise.resolve({ id: 'source-1' }) })
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Source Settings - RSS Feed')
    })
  })

  describe('createTopicSettingsAliasesPage', () => {
    it('renders AliasesClient for admin with valid topic', async () => {
      const result = await AliasesPage({ params: Promise.resolve({ id: 'legacy-topic-alias' }) })
      expect(result.key).toBe('legacy-topic-alias')
    })

    it('generateMetadata uses topic type label in title', async () => {
      await aliasesMetadata({ params: Promise.resolve({ id: 'topic-1' }) })
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Topic Settings - Aliases')
    })
  })

  describe('createTopicSettingsMergePage', () => {
    it('renders MergeClient for admin with valid topic', async () => {
      const result = await MergePage({ params: Promise.resolve({ id: 'legacy-topic-alias' }) })
      expect(result.key).toBe('legacy-topic-alias')
    })

    it('generateMetadata uses topic type label in title', async () => {
      await mergeMetadata({ params: Promise.resolve({ id: 'topic-1' }) })
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Topic Settings - Merge')
    })
  })

  describe('createTopicSettingsValidationsPage', () => {
    const fakeAttributesData = {
      referral_program_attributes: {
        referral_program_link_validation_ids: ['val-1'],
      },
    }
    const fakeValidation = {
      id: 'val-1',
      slug: 'chase-sapphire',
      user_help_text: '',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    beforeEach(() => {
      mockGetTopic.mockResolvedValue({ topic: referralProgramTopic })
      mockReturnNullForMissingEntity.mockImplementation((p: Promise<unknown>) => p)
      mockServerApiGet
        .mockResolvedValueOnce(fakeAttributesData)
        .mockResolvedValueOnce({ validation: fakeValidation })
    })

    it('redirects to / for non-admin', () =>
      expectRedirectForNonAdmin(ValidationsPage, 'rp-topic-1'))

    it('calls notFound when topic is not found', async () => {
      mockGetTopic.mockResolvedValue(null)
      await expect(ValidationsPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
        'not-found',
      )
      expect(mockNotFound).toHaveBeenCalled()
    })

    it('calls notFound when topic type is not referral_program', async () => {
      mockGetTopic.mockResolvedValue({ topic: baseTopic })
      await expect(ValidationsPage({ params: Promise.resolve({ id: 'topic-1' }) })).rejects.toThrow(
        'not-found',
      )
      expect(mockNotFound).toHaveBeenCalled()
    })

    it('renders ReferralValidationsSettings with linked validations', async () => {
      const result = await ValidationsPage({ params: Promise.resolve({ id: 'rp-alias' }) })
      expect(result.key).toBe('rp-alias')
      expect(result.props.linkedValidations).toEqual([fakeValidation])
    })

    it('renders with empty linkedValidations when no IDs', async () => {
      mockServerApiGet.mockReset()
      mockServerApiGet.mockResolvedValueOnce({
        referral_program_attributes: {
          referral_program_link_validation_ids: [],
        },
      })
      const result = await ValidationsPage({ params: Promise.resolve({ id: 'rp-topic-1' }) })
      expect(result.key).toBe('rp-topic-1')
      expect(result.props.linkedValidations).toEqual([])
    })

    it('generateMetadata uses Referral Program label', async () => {
      await validationsMetadata()
      expect(createNoIndexMetadata).toHaveBeenCalledWith('Referral Program Settings - Validations')
    })
  })
})
