import { fileURLToPath } from 'node:url'
import { resolveConfig } from 'no-mistakes'

interface CheckConfig {
  options?: { permanentPackages?: Array<{ name?: unknown }> }
  rule?: string
}

export async function permanentReleaseAgePackageNames(): Promise<Set<string>> {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const config = (await resolveConfig({ root, view: 'declared' })) as {
    rules?: CheckConfig[]
  }
  const policy = config.rules?.find(check => check.rule === 'pnpm-release-age-policy')
  const names = policy?.options?.permanentPackages?.map(entry => entry.name)
  if (!names?.every(name => typeof name === 'string')) {
    throw new Error('pnpm-release-age-policy permanentPackages must contain package names')
  }
  return new Set(names)
}
