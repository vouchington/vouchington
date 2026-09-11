'use client'

import { createContext, use } from 'react'

export interface OpenEmailVerificationRecoveryOptions {
  onVerified?: () => void
}

export interface EmailVerificationRecoveryContextValue {
  openEmailVerificationRecovery: (options?: OpenEmailVerificationRecoveryOptions) => void
}

export const EmailVerificationRecoveryContext =
  createContext<EmailVerificationRecoveryContextValue | null>(null)

export function useEmailVerificationRecovery() {
  return use(EmailVerificationRecoveryContext)
}

export function isEmailVerificationRequired(error: unknown): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'EMAIL_VERIFICATION_REQUIRED'
  )
}
