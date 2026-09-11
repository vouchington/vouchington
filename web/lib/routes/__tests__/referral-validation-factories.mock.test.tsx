import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet, mockGetTopic, mockGetReferralProgramValidations, mockNotFound, mockRequireAdmin } =
  vi.hoisted(() => ({
    mockGet: vi.fn<VitestLooseMock>(),
    mockGetTopic: vi.fn<VitestLooseMock>(),
    mockGetReferralProgramValidations: vi.fn<VitestLooseMock>(),
    mockNotFound: vi.fn<VitestLooseMock>(() => {
      throw new Error('NEXT_NOT_FOUND')
    }),
    mockRequireAdmin: vi.fn<VitestLooseMock>(),
  }))

vi.mock(
  import('@/lib/api/server'),
  () =>
    ({
      serverApi: { get: mockGet },
      getTopic: mockGetTopic,
      getReferralProgramValidations: mockGetReferralProgramValidations,
    }) as unknown as typeof import('@/lib/api/server'),
)
vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)
vi.mock(import('@/lib/auth/require-admin'), () => ({
  requireAdmin: mockRequireAdmin,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/button'),
)
vi.mock(import('@/components/admin/admin-page-header'), () => ({
  AdminPageHeader: ({
    title,
    description,
    children,
  }: {
    title: string
    description?: string
    children?: ReactNode
  }) => (
    <div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {children}
    </div>
  ),
}))
vi.mock(
  import('@/components/admin/referral-link-validations/validations-list-table'),
  () =>
    ({
      ValidationsListTable: ({ basePath }: { basePath: string }) => (
        <div data-testid={`list-table:${basePath}`} />
      ),
    }) as unknown as typeof import('@/components/admin/referral-link-validations/validations-list-table'),
)
vi.mock(
  import('@/components/admin/referral-link-validations/validation-form'),
  () =>
    ({
      ValidationForm: ({
        existing,
        basePath,
        referralProgramId,
      }: {
        existing?: { slug: string }
        basePath: string
        referralProgramId?: string | null
      }) => (
        <form data-testid={`validation-form:${basePath}`}>
          {existing && <span data-testid='existing-slug'>{existing.slug}</span>}
          {referralProgramId && <span data-testid='referral-program-id'>{referralProgramId}</span>}
        </form>
      ),
    }) as unknown as typeof import('@/components/admin/referral-link-validations/validation-form'),
)
vi.mock(import('@/components/admin/referral-link-validations/validation-rules-table'), () => ({
  ValidationRulesTable: ({ validationId }: { validationId: string; initialRules: unknown[] }) => (
    <div data-testid={`rules-table-${validationId}`} />
  ),
}))

import {
  createReferralProgramValidationsListPage,
  createReferralProgramValidationNewPage,
  createReferralProgramValidationDetailPage,
} from '../referral-validation-factories'

const program = { id: 'rp-uuid', slug: 'amex-rp', name: 'Amex RP', topic_type: 'referral_program' }

describe('referral-validation-factories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReset() // clear queued one-time responses so prior tests don't bleed into next
    mockRequireAdmin.mockResolvedValue({ id: 'admin', roles: ['administrator'] })
    mockGetTopic.mockResolvedValue({ topic: program })
    mockGetReferralProgramValidations.mockResolvedValue({ results: [] })
  })

  describe('list page', () => {
    it('renders the validations table scoped to the program base path', async () => {
      const { default: Page } = createReferralProgramValidationsListPage()
      render(await Page({ params: Promise.resolve({ id: 'amex-rp' }) }))
      expect(
        screen.getByTestId('list-table:/referral-program/amex-rp/validations'),
      ).toBeInTheDocument()
    })

    it('calls getReferralProgramValidations with the program UUID (not slug)', async () => {
      const { default: Page } = createReferralProgramValidationsListPage()
      await Page({ params: Promise.resolve({ id: 'amex-rp' }) })
      expect(mockGetReferralProgramValidations).toHaveBeenCalledWith('rp-uuid')
    })

    it('calls notFound when the topic is not a referral program', async () => {
      mockGetTopic.mockResolvedValue({ topic: { ...program, topic_type: 'card' } })
      const { default: Page } = createReferralProgramValidationsListPage()
      await expect(Page({ params: Promise.resolve({ id: 'amex-rp' }) })).rejects.toThrow(
        'NEXT_NOT_FOUND',
      )
    })

    it('calls notFound when the topic does not exist', async () => {
      mockGetTopic.mockResolvedValue(null)
      const { default: Page } = createReferralProgramValidationsListPage()
      await expect(Page({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
        'NEXT_NOT_FOUND',
      )
    })

    it('propagates the requireAdmin redirect for non-admins', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
      const { default: Page } = createReferralProgramValidationsListPage()
      await expect(Page({ params: Promise.resolve({ id: 'amex-rp' }) })).rejects.toThrow(
        'NEXT_REDIRECT',
      )
      expect(mockGetTopic).not.toHaveBeenCalled()
    })
  })

  describe('new page', () => {
    it('renders the create form with the program base path', async () => {
      const { default: Page } = createReferralProgramValidationNewPage()
      render(await Page({ params: Promise.resolve({ id: 'amex-rp' }) }))
      expect(
        screen.getByTestId('validation-form:/referral-program/amex-rp/validations'),
      ).toBeInTheDocument()
    })

    it('passes the referralProgramId to the form for link-on-create', async () => {
      const { default: Page } = createReferralProgramValidationNewPage()
      render(await Page({ params: Promise.resolve({ id: 'amex-rp' }) }))
      expect(screen.getByTestId('referral-program-id')).toHaveTextContent('rp-uuid')
    })
  })

  describe('detail page', () => {
    const validation = {
      id: 'val-1',
      slug: 'chase',
      user_help_text: 'help',
      updated_at: '2025-01-01',
    }

    it('renders the validation edit form and rules table', async () => {
      mockGetReferralProgramValidations.mockResolvedValue({ results: [validation] })
      mockGet.mockResolvedValueOnce({ validation }).mockResolvedValueOnce({ results: [] })
      const { default: Page } = createReferralProgramValidationDetailPage()
      render(await Page({ params: Promise.resolve({ id: 'amex-rp', validationId: 'val-1' }) }))
      expect(screen.getByTestId('existing-slug')).toHaveTextContent('chase')
      expect(screen.getByTestId('rules-table-val-1')).toBeInTheDocument()
    })

    it('calls notFound when the validation is missing globally', async () => {
      mockGet.mockResolvedValueOnce(null)
      const { default: Page } = createReferralProgramValidationDetailPage()
      await expect(
        Page({ params: Promise.resolve({ id: 'amex-rp', validationId: 'missing' }) }),
      ).rejects.toThrow('NEXT_NOT_FOUND')
    })

    it('calls notFound when the validation is not linked to this program', async () => {
      // The validation exists globally but is not in this program's linked list
      mockGet.mockResolvedValueOnce({ validation }).mockResolvedValueOnce({ results: [] })
      // mockGetReferralProgramValidations already returns { results: [] } from beforeEach
      const { default: Page } = createReferralProgramValidationDetailPage()
      await expect(
        Page({ params: Promise.resolve({ id: 'amex-rp', validationId: 'val-1' }) }),
      ).rejects.toThrow('NEXT_NOT_FOUND')
    })

    it('renders when accessed by slug and validation is linked (compares resolved UUID)', async () => {
      // validationId in URL is the slug 'chase', but the API resolves it to id 'val-1'.
      // The guard must compare the resolved validation.id (not the raw slug) against the
      // program's linked validation IDs; otherwise slug-based URLs always notFound().
      mockGetReferralProgramValidations.mockResolvedValue({ results: [validation] })
      mockGet.mockResolvedValueOnce({ validation }).mockResolvedValueOnce({ results: [] })
      const { default: Page } = createReferralProgramValidationDetailPage()
      render(await Page({ params: Promise.resolve({ id: 'amex-rp', validationId: 'chase' }) }))
      expect(screen.getByTestId('existing-slug')).toHaveTextContent('chase')
    })
  })

  it('exposes generateMetadata on each factory', async () => {
    for (const factory of [
      createReferralProgramValidationsListPage,
      createReferralProgramValidationNewPage,
      createReferralProgramValidationDetailPage,
    ]) {
      const { generateMetadata } = factory()
      expect(await generateMetadata()).toEqual({})
    }
  })
})
