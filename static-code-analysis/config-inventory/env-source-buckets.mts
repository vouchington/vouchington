import type { SourceBucket } from './types.mts'

const ENVIRONMENT_VARIABLES_REFERENCE_DIRECTORY = 'docs/overview/infrastructure/'
const ENVIRONMENT_VARIABLES_REFERENCE_FILE_RE =
  /^docs\/overview\/infrastructure\/reference-environment-variables-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/

export function bucketsForFile(file: string): SourceBucket[] {
  const buckets: SourceBucket[] = []
  if (file.startsWith('docs/') || file.endsWith('.md')) buckets.push('docs')
  if (isLambdaDeploymentSource(file) || file.endsWith('Dockerfile')) buckets.push('deployment')
  if (isGithubYaml(file)) buckets.push('workflows')
  if (file === 'pnpm-workspace.yaml' || file === 'package.json') buckets.push('packageGates')
  if (file === '.env.example' || (file.startsWith('dev/') && !file.endsWith('.md'))) {
    buckets.push('localSetup')
  }
  return buckets
}

export function isGithubYaml(file: string): boolean {
  return file.startsWith('.github/') && /\.ya?ml$/u.test(file)
}

export function isEnvInventoryDoc(file: string): boolean {
  return (
    file === 'docs/overview/infrastructure/environment-variables.md' ||
    isCanonicalEnvironmentVariablesReference(file) ||
    file === 'docs/development/local-env-vars.md'
  )
}

export function isCanonicalEnvironmentVariablesReference(file: string): boolean {
  return (
    file.startsWith(ENVIRONMENT_VARIABLES_REFERENCE_DIRECTORY) &&
    ENVIRONMENT_VARIABLES_REFERENCE_FILE_RE.test(file)
  )
}

function isLambdaDeploymentSource(file: string): boolean {
  return (
    file.startsWith('lambdas/') &&
    !file.includes('/__tests__/') &&
    !file.includes('.test.') &&
    !file.endsWith('.md')
  )
}
