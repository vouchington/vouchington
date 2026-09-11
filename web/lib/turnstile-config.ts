import { getBrowserRuntimePublicConfig, type RuntimePublicConfig } from './runtime-public-config'

// Cloudflare's well-known always-pass test site key. Used as the default in dev/test so the
// widget always renders without requiring a real key. Production runtime asserts this value (and
// every other public Cloudflare test site key) is overridden before serving browser config.
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

// All publicly documented Cloudflare Turnstile test site keys. The production runtime guard rejects
// any of these because they are non-production widgets — a deployed frontend using one would either
// auto-pass, auto-fail, or force interactive challenges in ways the production backend (with a real
// secret) does not accept, breaking email login.
export const TURNSTILE_TEST_SITE_KEYS: readonly string[] = [
  '1x00000000000000000000AA', // always passes (visible)
  '2x00000000000000000000AB', // always blocks (visible)
  '1x00000000000000000000BB', // always passes (invisible)
  '2x00000000000000000000BB', // always blocks (invisible)
  '3x00000000000000000000FF', // forces an interactive challenge
]

export function getTurnstileSiteKey(
  config: RuntimePublicConfig = getBrowserRuntimePublicConfig(),
): string {
  return config.turnstileSiteKey?.trim() || TURNSTILE_TEST_SITE_KEY
}
