import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

interface CheckConfig {
  options?: { permanentPackages?: Array<{ name?: unknown }> }
  rule?: string
}

export function permanentReleaseAgePackageNames(): Set<string> {
  const configPath = fileURLToPath(new URL('../.no-mistakes.yml', import.meta.url))
  const config = parseYaml(readFileSync(configPath, 'utf8')) as {
    rules?: CheckConfig[]
  }
  const policy = config.rules?.find(check => check.rule === 'pnpm-release-age-policy')
  const names = policy?.options?.permanentPackages?.map(entry => entry.name)
  if (!names?.every(name => typeof name === 'string')) {
    throw new Error('pnpm-release-age-policy permanentPackages must contain package names')
  }
  return new Set(names)
}
