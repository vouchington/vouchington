'use client'

import { useLoadScript } from './use-load-script'
import { getRecaptchaSiteKey, isRecaptchaConfigured } from '@/lib/recaptcha-config'
import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'

export type RecaptchaAction = 'create_post' | 'create_comment'

interface GrecaptchaEnterprise {
  enterprise: {
    ready: (cb: () => void) => void
    execute: (siteKey: string, options: { action: string }) => Promise<string>
  }
}

declare global {
  interface Window {
    grecaptcha?: GrecaptchaEnterprise
  }
}

interface UseRecaptchaTokenReturn {
  /**
   * Mints a fresh reCAPTCHA Enterprise v3 token for the given action, or resolves
   * to `null` when reCAPTCHA is not configured or token minting fails. The backend
   * treats a missing token as a skip, so callers fail soft.
   */
  execute: (action: RecaptchaAction) => Promise<string | null>
}

function recaptchaScriptSrc(siteKey: string): string {
  return siteKey
    ? `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}`
    : ''
}

function executeEnterprise(siteKey: string, action: RecaptchaAction): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const grecaptcha = window.grecaptcha
    if (!grecaptcha?.enterprise) {
      reject(new Error('reCAPTCHA enterprise not loaded'))
      return
    }
    grecaptcha.enterprise.ready(() => {
      try {
        grecaptcha.enterprise.execute(siteKey, { action }).then(resolve).catch(reject)
      } catch (error) {
        /* c8 ignore next -- error path requires grecaptcha.enterprise.execute to throw */
        reject(error instanceof Error ? error : new Error('reCAPTCHA execute threw'))
      }
    })
  })
}

/**
 * reCAPTCHA Enterprise v3 token hook. Unlike Turnstile (a passive widget), v3 mints a
 * fresh token at submit time via `grecaptcha.enterprise.execute`. The hook loads the
 * enterprise.js script lazily (shared across instances via {@link useLoadScript}) and
 * exposes a single `execute(action)`. When the site key is unset (dev/test) it no-ops
 * without loading any script. Pair with the existing Turnstile wiring — both tokens are
 * sent on content-creation requests.
 */
export function useRecaptchaToken(): UseRecaptchaTokenReturn {
  const runtimePublicConfig = useRuntimePublicConfig()
  const siteKey = getRecaptchaSiteKey(runtimePublicConfig)
  // Loading an empty src is a no-op in useLoadScript; only loads when configured.
  useLoadScript(recaptchaScriptSrc(siteKey))

  async function execute(action: RecaptchaAction): Promise<string | null> {
    if (!isRecaptchaConfigured(runtimePublicConfig)) return null
    try {
      return await executeEnterprise(siteKey, action)
    } catch {
      return null
    }
  }

  return { execute }
}
