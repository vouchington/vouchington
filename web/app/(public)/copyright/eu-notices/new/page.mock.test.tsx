import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { makeCopyrightJurisdictionAvailability } from '@/test-helpers/api-responses/copyright'
import { getCopyrightJurisdictionAvailabilityServer } from '@/lib/api/server/copyright-notices'

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn<() => never>(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  }),
}))
vi.mock(
  import('next/navigation'),
  () =>
    ({ ...navMockModule, notFound: notFoundMock }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server/copyright-notices'), () => ({
  getCopyrightJurisdictionAvailabilityServer:
    vi.fn<typeof getCopyrightJurisdictionAvailabilityServer>(),
}))
vi.mock(import('@/components/copyright/copyright-eu-notice-form'), () => ({
  CopyrightEuNoticeForm: () => <div>EU filing form</div>,
}))

import NewCopyrightEuNoticePage from './page'
const availability = vi.mocked(getCopyrightJurisdictionAvailabilityServer)
const navigation = createNavMock()

describe('NewCopyrightEuNoticePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigation.reset()
  })

  it('shows the guest-accessible form when EU intake is available', async () => {
    availability.mockResolvedValue(makeCopyrightJurisdictionAvailability(true))
    render(await NewCopyrightEuNoticePage())
    expect(screen.getByRole('heading', { name: 'EU copyright notice' })).toBeInTheDocument()
    expect(screen.getByText('EU filing form')).toBeInTheDocument()
  })

  it('fails closed when approval is absent or the availability read fails', async () => {
    availability.mockResolvedValue(makeCopyrightJurisdictionAvailability(false, true))
    await expect(NewCopyrightEuNoticePage()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    availability.mockRejectedValue(new Error('backend unavailable'))
    await expect(NewCopyrightEuNoticePage()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
  })
})
