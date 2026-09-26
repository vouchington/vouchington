import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, type Mock } from 'vitest'

type ToastMock = { error: Mock; success: Mock }

export const mfaManagerStatus = {
  passkeys_count: 2,
  totp_count: 2,
  mfa_required: false,
  has_mfa: true,
  has_password: false,
  recovery_codes_remaining: 0,
}

export function clickSubmit(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
  const submit = screen
    .getAllByRole('button')
    .find(button => button.getAttribute('type') === 'submit')
  fireEvent.click(submit!)
}

export function renameAndSave(label: RegExp, value: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Rename$/ }))
  const input = screen.getByLabelText(label) as HTMLInputElement
  fireEvent.change(input, { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
}

export async function confirmRemove() {
  const removeButtons = screen.getAllByRole('button', { name: /^Remove$/ })
  fireEvent.click(removeButtons[0]!)
  const confirmButton = await screen.findByRole('button', { name: /confirm remove|confirm/i })
  fireEvent.click(confirmButton)
}

export async function enterOtp(code: string) {
  await screen.findByText(/Enter the 6-digit code/i)
  const otpInput =
    (document.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement | null) ??
    (document.querySelector('input') as HTMLInputElement)
  fireEvent.input(otpInput, { target: { value: code } })
}

export async function expectToast(toast: ToastMock, kind: 'error' | 'success', message: string) {
  await waitFor(() => {
    expect(toast[kind]).toHaveBeenCalledWith(message)
  })
}

export async function expectToastAbsent(
  toast: ToastMock,
  kind: 'error' | 'success',
  message: string,
) {
  await waitFor(() => {
    expect(toast[kind]).not.toHaveBeenCalledWith(message)
  })
}

export async function mfaReauthRequiredError() {
  const { ApiError } = await import('@/lib/api/error')
  return new (ApiError as unknown as new (message: string, status: number, code: string) => Error)(
    'reauth required',
    409,
    'MFA_REAUTH_REQUIRED',
  )
}
