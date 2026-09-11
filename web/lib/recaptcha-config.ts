import { getBrowserRuntimePublicConfig, type RuntimePublicConfig } from './runtime-public-config'

// Public Google reCAPTCHA Enterprise site key. Unlike Turnstile there is no documented test key,
// so this is simply unset in dev/test and the token hook no-ops when it is empty.
export function getRecaptchaSiteKey(
  config: RuntimePublicConfig = getBrowserRuntimePublicConfig(),
): string {
  return config.recaptchaSiteKey?.trim() || ''
}

export function isRecaptchaConfigured(config?: RuntimePublicConfig): boolean {
  return getRecaptchaSiteKey(config) !== ''
}
