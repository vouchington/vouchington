import path from 'node:path'

export const categoryNames = ['source', 'tests', 'tooling'] as const
export const serviceNames = [
  'backend',
  'web',
  'cloudflare-worker',
  'lambdas',
  'email-templates',
  'ts-shared',
  'infra',
  'tooling',
  'docs',
] as const

export type CategoryName = (typeof categoryNames)[number]
export type ServiceName = (typeof serviceNames)[number]

export function normalizePath(filePath: string): string {
  return filePath.replaceAll(path.sep, '/').replace(/^\.\//, '')
}

function isTestPath(filePath: string): boolean {
  const basename = path.posix.basename(filePath)
  return (
    /(^|[./-])(test|spec)\.[cm]?[jt]sx?$/.test(basename) ||
    /\.mock\.test\.[cm]?[jt]sx?$/.test(basename) ||
    filePath.includes('/__tests__/') ||
    filePath.includes('/__snapshots__/') ||
    filePath.includes('/tests/') ||
    filePath.includes('/test/') ||
    filePath.startsWith('playwright/') ||
    filePath.startsWith('integration-tests/')
  )
}

function isToolingPath(filePath: string): boolean {
  const basename = path.posix.basename(filePath)
  const isJsonConfig =
    basename.startsWith('.') || basename === 'components.json' || basename === 'renovate.json'
  if (
    filePath.startsWith('.github/') ||
    filePath.startsWith('.husky/') ||
    filePath.startsWith('.agents/') ||
    filePath.startsWith('.codex/') ||
    filePath.startsWith('.grok/') ||
    filePath.startsWith('.opencode/') ||
    filePath.startsWith('ast-grep-rules/') ||
    filePath.startsWith('ci/') ||
    filePath.startsWith('dev/') ||
    filePath.startsWith('monitors/') ||
    filePath.startsWith('seed/') ||
    filePath.startsWith('static-code-analysis/') ||
    filePath.includes('test-helpers/') ||
    filePath.startsWith('backend/scripts/') ||
    filePath.startsWith('web/scripts/') ||
    filePath.startsWith('docs/')
  ) {
    return true
  }

  return (
    filePath === 'commitlint.config.mts' ||
    basename === 'CLAUDE.md' ||
    basename === 'package.json' ||
    basename === 'README.md' ||
    basename === 'tsconfig.json' ||
    isJsonConfig ||
    filePath === 'pnpm-workspace.yaml' ||
    filePath === 'selene.toml' ||
    filePath === 'vitest.config.mts' ||
    filePath.endsWith('.config.mts') ||
    filePath.endsWith('.config.ts') ||
    filePath.endsWith('.config.js') ||
    filePath.endsWith('.jsonc') ||
    filePath.endsWith('.toml') ||
    filePath.endsWith('.yml') ||
    filePath.endsWith('.yaml')
  )
}

export function classifyFile(filePath: string): {
  category: CategoryName
  service: ServiceName
} {
  const normalized = normalizePath(filePath)
  const category: CategoryName = isTestPath(normalized)
    ? 'tests'
    : isToolingPath(normalized)
      ? 'tooling'
      : 'source'

  if (normalized.startsWith('backend/')) return { category, service: 'backend' }
  if (
    normalized.startsWith('web/') ||
    normalized.startsWith('integration-tests/') ||
    normalized.startsWith('playwright/')
  ) {
    return { category, service: 'web' }
  }
  if (normalized.startsWith('cloudflare-worker/')) {
    return { category, service: 'cloudflare-worker' }
  }
  if (normalized.startsWith('lambdas/')) return { category, service: 'lambdas' }
  if (normalized.startsWith('email-templates/')) {
    return { category, service: 'email-templates' }
  }
  if (normalized.startsWith('ts-shared/')) return { category, service: 'ts-shared' }
  if (normalized.startsWith('docs/') || normalized === 'README.md' || normalized === 'CLAUDE.md') {
    return { category, service: 'docs' }
  }
  if (normalized.startsWith('monitors/')) {
    return { category, service: 'infra' }
  }
  return { category, service: 'tooling' }
}
