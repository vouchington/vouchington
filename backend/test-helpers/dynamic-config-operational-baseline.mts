/** Test baselines that switch off operational gates, so tests never wait on a production delay. */
export function applyOperationalTestBaseline(key: string, baseline: Record<string, unknown>): void {
  if (key === 'dynamic-config:bloom-filter-config') {
    baseline['bookmarkBloomFilterEnabled'] = false
    baseline['apiKeyBloomFilterEnabled'] = false
  }
  if (key === 'dynamic-config:web-risk-config') baseline['enabled'] = false
  // Zero disables the one-code-per-interval spacing; its own tests override it with a real interval.
  if (key === 'dynamic-config:email-auth-limits-config') {
    baseline['code_request_min_interval_seconds'] = 0
  }
}
