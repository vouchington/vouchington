export const excludedDirs = [
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.turbo',
  '.wrangler',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
] as const

const countedRoots = [
  '.agents',
  '.codex',
  '.github',
  '.husky',
  'ast-grep-rules',
  'backend',
  'ci',
  'cloudflare-worker',
  'dev',
  'docs',
  'email-templates',
  'integration-tests',
  'lambdas',
  'monitors',
  'playwright',
  'seed',
  'static-code-analysis',
  'test-helpers',
  'ts-shared',
  'web',
] as const

const countedRootFiles = [
  '.jscpd.json',
  'CLAUDE.md',
  'README.md',
  'commitlint.config.mts',
  'knip.jsonc',
  'package.json',
  'playwright.config.mts',
  'playwright.credentialed.config.mts',
  'pnpm-workspace.yaml',
  'redis.yml',
  'renovate.json',
  'selene.toml',
  'sgconfig.yml',
  'sonar-project.properties',
  'tsconfig.json',
  'vitest.config.mts',
] as const

export function isCountedPath(filePath: string): boolean {
  return (
    countedRootFiles.includes(filePath as (typeof countedRootFiles)[number]) ||
    countedRoots.some(root => filePath === root || filePath.startsWith(`${root}/`))
  )
}

export function countTargetsFor(trackedFiles: Set<string>): string[] {
  const files = [...trackedFiles]
  return [...countedRoots, ...countedRootFiles].filter(
    target => trackedFiles.has(target) || files.some(file => file.startsWith(`${target}/`)),
  )
}
