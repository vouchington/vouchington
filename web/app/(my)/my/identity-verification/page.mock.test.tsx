import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { getMyIdentityVerificationMock, getResolvedUiLocaleMock } = vi.hoisted(() => ({
  getMyIdentityVerificationMock: vi.fn<VitestLooseMock>(),
  getResolvedUiLocaleMock: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server/my'), () => ({
  getMyIdentityVerification: getMyIdentityVerificationMock,
}))
vi.mock(import('@/lib/i18n/get-resolved-ui-locale'), () => ({
  getResolvedUiLocale: getResolvedUiLocaleMock,
}))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock(import('./identity-verification-content'), () => ({
  IdentityVerificationContent: ({
    verificationFee,
    verificationStatus,
  }: {
    verificationFee?: string
    verificationStatus: string
  }) => (
    <div data-testid='identity-verification-page-data'>
      {`${verificationStatus}|${verificationFee ?? ''}`}
    </div>
  ),
}))

import IdentityVerificationPage from './page'

describe('IdentityVerificationPage', () => {
  it('renders the shared settings header and passes verification state to the content', async () => {
    getMyIdentityVerificationMock.mockResolvedValue({
      verification_status: 'unverified',
      verification_provider: null,
      verification_completed_at: null,
      verified_badge_visible: true,
      public_verified_name_display: 'hidden',
    })
    getResolvedUiLocaleMock.mockResolvedValue('en')

    render(await IdentityVerificationPage())

    expect(document.querySelector('[data-pw="settings-page-header"]')).toBeInTheDocument()
    expect(document.querySelector('[data-pw="settings-page-header-title"]')).toHaveTextContent(
      'extracted.identityVerification.page.identityVerification_11c4c9be',
    )
    expect(
      document.querySelector('[data-pw="settings-page-header-description"]'),
    ).toHaveTextContent(
      'extracted.identityVerification.page.verifyYourIdentityWithAGovernment_0b76ee2c',
    )
    expect(screen.getByTestId('identity-verification-page-data')).toHaveTextContent(/^unverified\|/)
  })
})
