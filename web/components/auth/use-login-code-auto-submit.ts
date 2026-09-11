'use client'

import { useEffect, useRef, type RefObject } from 'react'

interface UseLoginCodeAutoSubmitOptions {
  code: string
  email: string
  startsOnCodeStep: boolean
  loading: boolean
  step: 'email' | 'code' | 'mfa'
  submitCode: (value: string) => Promise<void>
  submitting: RefObject<boolean>
}

export const useLoginCodeAutoSubmit = ({
  code,
  email,
  loading,
  startsOnCodeStep,
  step,
  submitCode,
  submitting,
}: UseLoginCodeAutoSubmitOptions) => {
  const initialAutoSubmitPending = useRef(startsOnCodeStep)

  useEffect(() => {
    const tryAutoSubmit = () => {
      if (!initialAutoSubmitPending.current) return
      if (!hasStrongUserIntent()) return

      initialAutoSubmitPending.current = false
      submitCode(code).catch(() => undefined)
    }

    const canAutoSubmit =
      initialAutoSubmitPending.current &&
      step === 'code' &&
      Boolean(email) &&
      code.length === 8 &&
      !loading &&
      !submitting.current

    if (canAutoSubmit) {
      tryAutoSubmit()
      if (initialAutoSubmitPending.current) {
        return addAutoSubmitListeners(tryAutoSubmit)
      }
    }

    return undefined
  }, [code, email, loading, step, submitCode, submitting])
}

function addAutoSubmitListeners(tryAutoSubmit: () => void) {
  window.addEventListener('focus', tryAutoSubmit)
  document.addEventListener('visibilitychange', tryAutoSubmit)

  return () => {
    window.removeEventListener('focus', tryAutoSubmit)
    document.removeEventListener('visibilitychange', tryAutoSubmit)
  }
}

function hasStrongUserIntent() {
  const hasUserActivation =
    typeof navigator !== 'undefined' &&
    'userActivation' in navigator &&
    (navigator as Navigator & { userActivation?: { isActive?: boolean } }).userActivation?.isActive
  const hasFocusedVisibleDocument =
    document.visibilityState === 'visible' &&
    typeof document.hasFocus === 'function' &&
    document.hasFocus()

  return hasUserActivation || hasFocusedVisibleDocument
}
