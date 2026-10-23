// Exact live-provider project exceptions; keyless projects keep the normal host allowlist.
const LIVE_PROVIDER_PROJECTS = new Set(
  'anthropic,aws,bedrock,lightpanda,openai,openrouter,stripe'
    .split(',')
    .map(name => `backend-${name}`),
)

export function isLiveProviderProject(): boolean {
  const worker = (
    globalThis as unknown as Record<string, { ctx?: { projectName?: string } } | undefined>
  )['__vitest_worker__']
  const projectName = worker?.ctx?.projectName
  return projectName !== undefined && LIVE_PROVIDER_PROJECTS.has(projectName)
}
