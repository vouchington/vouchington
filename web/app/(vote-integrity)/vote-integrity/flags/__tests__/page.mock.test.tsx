import { describe, vi } from 'vitest'
import { registerVoteIntegrityFlagsPageCases } from '@/test-helpers/app/integrity-flags-page-cases'
import {
  IntegrityFlagsBreadcrumbsDouble,
  IntegrityFlagsClientDouble,
} from '@/test-helpers/app/integrity-flags-page-doubles'

const { mockGetVoteIntegrityFlags } = vi.hoisted(() => ({
  mockGetVoteIntegrityFlags: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getVoteIntegrityFlags: mockGetVoteIntegrityFlags,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: IntegrityFlagsBreadcrumbsDouble,
}))

vi.mock(import('../vote-integrity-flags-client'), () => ({
  VoteIntegrityFlagsClient: IntegrityFlagsClientDouble,
}))

import VoteIntegrityFlagsPage from '../page'

describe('VoteIntegrityFlagsPage', () => {
  registerVoteIntegrityFlagsPageCases({
    Page: VoteIntegrityFlagsPage,
    getFlags: mockGetVoteIntegrityFlags,
  })
})
