import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  EmailVerificationPane,
  TotpVerificationPane,
} from '@/components/my/mfa-reauth-dialog/verification-panes'
import { MethodSelector } from '@/components/my/mfa-reauth-dialog/method-selector'
import type { ReauthMethod } from '@/components/my/mfa-reauth-dialog/methods'

describe('MFA re-authentication verification panes', () => {
  it('rejects an unsupported method from a malformed method list', () => {
    expect(() =>
      render(
        <MethodSelector
          loading={false}
          method={undefined}
          methods={['unsupported' as ReauthMethod]}
          setEmailCode={() => {}}
          setEmailSent={() => {}}
          setMethod={() => {}}
          setSentToEmail={() => {}}
        />,
      ),
    ).toThrow('Unsupported reauthentication method: unsupported')
  })

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
    ).toBeInTheDocument()
  })

  it('accepts a full base32 email code and requires deliberate verification', () => {
    const verify = vi.fn<(code: string) => void>()
    render(
      <EmailVerificationPane
        emailCode='ABCDEFG234'
        emailSent
        loading={false}
        resendSecondsLeft={0}
        sentToEmail='tests+mfa-reauth@voucha.ai'
        handleEmailVerify={verify}
        handleSendEmail={vi.fn<() => void>()}
        setEmailCode={vi.fn<(code: string) => void>()}
      />,
    )

    expect(
      screen.getByRole('textbox', {
        name: 'Verification code',
      }),
    ).toHaveAttribute('maxlength', '10')
    expect(verify).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    expect(verify).toHaveBeenCalledWith('ABCDEFG234')
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
          resendSecondsLeft={0}
          sentToEmail='tests+mfa-reauth@voucha.ai'
          handleEmailVerify={vi.fn<(code: string) => void>()}
          handleSendEmail={vi.fn<() => void>()}
          setEmailCode={vi.fn<(code: string) => void>()}
        />
        <EmailVerificationPane
          emailCode=''
          emailSent
          loading={false}
          resendSecondsLeft={0}
          sentToEmail='tests+mfa-reauth@voucha.ai'
          handleEmailVerify={vi.fn<(code: string) => void>()}
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
        name: 'Verification code',
      }),
    ].map(input => input.getAttribute('aria-labelledby'))

    expect(labelIds.every(Boolean)).toBe(true)
    expect(new Set(labelIds).size).toBe(labelIds.length)
  })

  it('shows the code input with a recently-sent note when the address is not known', () => {
    render(
      <EmailVerificationPane
        emailCode=''
        emailSent
        loading={false}
        resendSecondsLeft={30}
        sentToEmail=''
        handleEmailVerify={vi.fn<(code: string) => void>()}
        handleSendEmail={vi.fn<() => void>()}
        setEmailCode={vi.fn<(code: string) => void>()}
      />,
    )

    expect(
      screen.getByText('A code was already sent to your email. Enter it below.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Verification code' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend in 30s' })).toBeDisabled()
  })
})
