// Exact live-provider project exceptions; keyless projects keep the normal host allowlist.
export const LIVE_PROVIDER_PROJECTS = new Set(
  'anthropic,aws,bedrock,lightpanda,openai,openrouter,stripe'
    .split(',')
    .map(name => `backend-${name}`),
)
