import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  EmailVerificationPane,
  TotpVerificationPane,
} from '@/components/my/mfa-reauth-dialog/verification-panes'

describe('MFA re-authentication verification panes', () => {
  it('labels the authenticator code input with the visible instruction', () => {
    render(
      <TotpVerificationPane
        loading={false}
        totpCode=''
        handleTotpVerify={vi.fn<(code: string) => void>()}
        setTotpCode={vi.fn<(code: string) => void>()}
      />,
    )

    expect(
      screen.getByRole('textbox', {
        name: 'Enter the 6-digit code from your authenticator app',
      }),
    ).toBeDefined()
  })

  it('labels the emailed code input with the visible instruction', () => {
    render(
      <EmailVerificationPane
        emailCode=''
        emailSent
        loading={false}
        sentToEmail='tests+mfa-reauth@voucha.ai'
        handleEmailVerify={vi.fn<(code: string) => void>()}
        handleResendEmail={vi.fn<() => void>()}
        handleSendEmail={vi.fn<() => void>()}
        setEmailCode={vi.fn<(code: string) => void>()}
      />,
    )

    expect(
      screen.getByRole('textbox', {
        name: 'Enter the 6-digit code from your email',
      }),
    ).toBeDefined()
  })

  it('uses unique label ids when repeated verification panes render', () => {
    render(
      <>
        <TotpVerificationPane
          loading={false}
          totpCode=''
          handleTotpVerify={vi.fn<(code: string) => void>()}
          setTotpCode={vi.fn<(code: string) => void>()}
        />
        <TotpVerificationPane
          loading={false}
          totpCode=''
          handleTotpVerify={vi.fn<(code: string) => void>()}
          setTotpCode={vi.fn<(code: string) => void>()}
        />
        <EmailVerificationPane
          emailCode=''
          emailSent
          loading={false}
          sentToEmail='tests+mfa-reauth@voucha.ai'
          handleEmailVerify={vi.fn<(code: string) => void>()}
          handleResendEmail={vi.fn<() => void>()}
          handleSendEmail={vi.fn<() => void>()}
          setEmailCode={vi.fn<(code: string) => void>()}
        />
        <EmailVerificationPane
          emailCode=''
          emailSent
          loading={false}
          sentToEmail='tests+mfa-reauth@voucha.ai'
          handleEmailVerify={vi.fn<(code: string) => void>()}
          handleResendEmail={vi.fn<() => void>()}
          handleSendEmail={vi.fn<() => void>()}
          setEmailCode={vi.fn<(code: string) => void>()}
        />
      </>,
    )

    const labelIds = [
      ...screen.getAllByRole('textbox', {
        name: 'Enter the 6-digit code from your authenticator app',
      }),
      ...screen.getAllByRole('textbox', {
        name: 'Enter the 6-digit code from your email',
      }),
    ].map(input => input.getAttribute('aria-labelledby'))

    expect(labelIds.every(Boolean)).toBe(true)
    expect(new Set(labelIds).size).toBe(labelIds.length)
  })
})
