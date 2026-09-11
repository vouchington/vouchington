import type { EnvClassification, EnvVarInventoryRow } from './types.mts'
import { reviewReasonForEnvVar } from './review-reasons.mts'

type EnvVarClassificationSources = Pick<
  EnvVarInventoryRow,
  | 'deployment'
  | 'dockerBuildArgs'
  | 'localSetup'
  | 'packageGates'
  | 'readers'
  | 'runtimeSurfaces'
  | 'sourceOfTruth'
  | 'workflows'
>

export function classifyEnvVar(
  name: string,
  sources: EnvVarClassificationSources,
): EnvClassification[] {
  const classes = new Set<EnvClassification>()
  if (sources.localSetup.length > 0) classes.add('local-startup-required')
  if (sources.deployment.length > 0 || sources.sourceOfTruth === 'vouchington-infra') {
    classes.add('deploy-only')
  }
  if (sources.workflows.length > 0 || isCiTestControl(name)) classes.add('ci-test-control')
  if (sources.packageGates.length > 0) classes.add('package-manager-gate')
  if (isBuildTime(name, sources)) classes.add('build-time')
  if (isCredentialOrSecret(name)) classes.add('credential-secret')
  if (isFeatureOptIn(name)) classes.add('feature-opt-in')
  if (isDynamicConfigCandidate(name, classes, sources)) classes.add('dynamic-config-candidate')
  if (classes.size === 0) classes.add('review-required')
  return [...classes].toSorted()
}

function isBuildTime(name: string, sources: EnvVarClassificationSources): boolean {
  return (
    name.startsWith('NEXT_PUBLIC_') ||
    name === 'GIT_COMMIT' ||
    name === 'NEXT_PHASE' ||
    sources.dockerBuildArgs.length > 0
  )
}

function isCredentialOrSecret(name: string): boolean {
  if (name.startsWith('NEXT_PUBLIC_')) return false
  return (
    /(?:SECRET|SECRET_KEY|TOKEN|PASSWORD|PRIVATE|PRIVATE_KEY|API_KEY|ACCESS_KEY|ACCESS_KEY_ID|SHARED_KEY|AUTH|DSN|KEYS_B64)$/.test(
      name,
    ) || /(?:^|_)KEYS$/.test(name)
  )
}

function isFeatureOptIn(name: string): boolean {
  return (
    name.startsWith('ALLOW_') ||
    name.startsWith('SKIP_') ||
    name.startsWith('REQUIRE_') ||
    name.startsWith('FEATURE_') ||
    name.endsWith('_ENABLED')
  )
}

function isCiTestControl(name: string): boolean {
  return /^(CI|GITHUB_|GH_|RUNNER_|VITEST|PLAYWRIGHT|CODEX_|CLAUDE_|PR_|COVERAGE_|BACKEND_TEST_|NEXT_TEST_BUILD|NODE_V8_COVERAGE)/.test(
    name,
  )
}

function isDynamicConfigCandidate(
  name: string,
  classes: ReadonlySet<EnvClassification>,
  sources: EnvVarClassificationSources,
): boolean {
  if (
    classes.has('credential-secret') ||
    classes.has('ci-test-control') ||
    classes.has('build-time')
  ) {
    return false
  }
  if (
    /(?:URL|ORIGIN|PORT|HOST|PATH|DIR|ENVIRONMENT|COMMIT|PUBLIC|DATABASE|VALKEY|S3_BUCKET)/.test(
      name,
    ) ||
    /(?:ARN)$/.test(name) ||
    isAwsManagedRuntimeEnvVar(name) ||
    reviewReasonForEnvVar(name) !== null ||
    name === 'NODE_ENV'
  ) {
    return false
  }
  return sources.readers.length > 0
}

function isAwsManagedRuntimeEnvVar(name: string): boolean {
  return (
    name.startsWith('AWS_LAMBDA_') || /^AWS_(?:DEFAULT_REGION|EXECUTION_ENV|REGION)$/.test(name)
  )
}
