import picomatch from 'picomatch'
import { backendCredentialedTestProjects } from '../../test-helpers/vitest-config/backend-credentialed-projects.mts'
import { backendCredentialedOpenRouterMarkerGroups } from './backend-credentialed-openrouter-markers.mts'

const vitestFailureLinePattern = /\bFAIL\s+\S+\s+\S+\.(?:c|m)?tsx?\b/

/**
 * The credentialed Vitest projects that probe a real external provider, each paired with the
 * `include` glob(s) it collects. Derived from the same project objects `vitest.config.mts` runs
 * (`test-helpers/vitest-config/backend-credentialed-projects.mts`), which is a literal-only module
 * so this Node-run classifier stays free of the DB/Valkey alias resolution in `vitest.config.mts`.
 */
export const backendCredentialedProjects: ReadonlyArray<{
  project: string
  include: readonly string[]
}> = backendCredentialedTestProjects.map(configuration => {
  const test =
    typeof configuration === 'object' && 'test' in configuration ? configuration.test : undefined
  if (typeof test?.name !== 'string' || !test.include?.length) {
    throw new TypeError('Credentialed Vitest projects need a string name and a non-empty include')
  }
  return { project: test.name, include: test.include }
})

function toEmbeddablePattern(glob: string): string {
  return picomatch.makeRe(glob, { contains: true }).source
}

/**
 * Matches `FAIL <credentialed project> <path owned by that project's own include glob>`. A test
 * file is covered the moment it exists under a project's `include` glob — no per-test path or
 * title is hand-copied here, so a new probe can't silently ship uncovered (see #10806/#10825).
 */
const backendCredentialedProbeFailurePattern = new RegExp(
  backendCredentialedProjects
    .map(
      ({ project, include }) =>
        `\\bFAIL\\s+${project}\\s+(?:${include.map(toEmbeddablePattern).join('|')})(?=\\s|$)`,
    )
    .join('|'),
)

/**
 * Every one of these must appear in `tests-backend-credentialed.yml`'s "Run backend credentialed
 * tests" step (asserted by `backend-credentialed-config-agreement.test.mts`) — a stale marker
 * here (a renamed wrapper script or a project the workflow no longer runs) would make
 * `hasBackendCredentialedProviderSmokeTestEnvelope` reject every real log forever, taking the
 * whole rule down silently rather than just one probe.
 */
export const backendCredentialedVitestCommandMarkers = [
  'pnpm exec ./ci/with-node-test-options vitest run',
  ...backendCredentialedProjects.map(({ project }) => `--project ${project}`),
]
const vitestNonTestTerminalErrorPattern =
  /(^|\n).*(Vitest caught \d+ unhandled errors? during the test run\.|Unhandled (?:Error|Rejection)|Error: .*(?:coverage|global teardown|reporter)|(?:coverage|global teardown|reporter).*failed)/i
const ansiEscapePattern = new RegExp(
  `${String.fromCodePoint(27)}\\[[0-?]*[ -/]*[@-~]|\\^\\[\\[[0-?]*[ -/]*[@-~]`,
  'g',
)

function stripAnsi(log: string): string {
  return log.replace(ansiEscapePattern, '')
}

function getVitestFailureBlocks(log: string): string[] {
  const blocks: string[] = []
  let currentBlock: string[] = []

  for (const line of log.split('\n')) {
    if (vitestFailureLinePattern.test(line)) {
      if (currentBlock.length > 0) blocks.push(currentBlock.join('\n'))
      currentBlock = [line]
    } else if (currentBlock.length > 0) {
      currentBlock.push(line)
    }
  }

  if (currentBlock.length > 0) blocks.push(currentBlock.join('\n'))

  return blocks
}

function hasBackendCredentialedVitestCommand(log: string): boolean {
  return backendCredentialedVitestCommandMarkers.every(marker => log.includes(marker))
}

export function hasBackendCredentialedProviderSmokeTestEnvelope(log: string): boolean {
  const normalized = stripAnsi(log)
  return (
    hasBackendCredentialedVitestCommand(normalized) &&
    !vitestNonTestTerminalErrorPattern.test(normalized)
  )
}

function hasSingleVitestFailureWithMarkers(
  log: string,
  failurePattern: RegExp,
  requiredMarkers: string[],
): boolean {
  const failureBlocks = getVitestFailureBlocks(stripAnsi(log))
  const failureBlock = failureBlocks[0] ?? ''

  return (
    failureBlocks.length === 1 &&
    failurePattern.test(failureBlock) &&
    requiredMarkers.every(marker => failureBlock.includes(marker))
  )
}

function hasOnlyVitestFailuresWithMarkers(
  log: string,
  failurePatterns: RegExp[],
  requiredMarkers: string[],
): boolean {
  const failureBlocks = getVitestFailureBlocks(stripAnsi(log))

  return (
    failureBlocks.length > 0 &&
    failureBlocks.every(
      block =>
        failurePatterns.some(pattern => pattern.test(block)) &&
        requiredMarkers.every(marker => block.includes(marker)),
    )
  )
}

/**
 * Provider-transport marker groups for a credentialed probe failure. Each group is a set of
 * substrings that must all appear together inside one Vitest failure block; groups are OR'd below.
 * None pin a `describe`/`it` title or a specific timeout digit count — a project's own
 * `testTimeout` already owns that number, and pinning it independently is exactly what left
 * `backend-aws`'s SES probe unmatchable after `testTimeout` dropped from 120000 to 60000
 * (see `reference-cautionary-examples.md`).
 */
const backendCredentialedTimeoutMarkers = ['Test timed out in ']
const backendCredentialedAwsSdkAbortTimeoutMarkers = [
  'AbortError: Request aborted',
  'TimeoutError: The operation was aborted due to timeout',
]
const backendCredentialedBedrockServerErrorMarkers = [
  'InternalFailure: UnknownError',
  'statusCode: 500',
  'bedrock-runtime.',
  '.amazonaws.com',
  'x-amzn-errortype',
]
const backendCredentialedOpenAIRateLimitMarkers = [
  "Error: 429 We're currently processing too many requests",
  "code: 'rate_limit_exceeded'",
]
const backendCredentialedOpenAIServerErrorMarkers = [
  'Error: 500 The server had an error processing your request',
  'OpenAI.makeStatusError',
]

const backendCredentialedSingleFailureMarkerGroups = [
  backendCredentialedTimeoutMarkers,
  backendCredentialedAwsSdkAbortTimeoutMarkers,
  backendCredentialedBedrockServerErrorMarkers,
  backendCredentialedOpenAIRateLimitMarkers,
  ...backendCredentialedOpenRouterMarkerGroups,
]

/**
 * True when the log's failure is a credentialed provider probe carrying a known provider-transport
 * marker: either the sole failing test (timeout, AWS-SDK request abort/timeout, Bedrock 500,
 * OpenAI 429, or OpenRouter 429/5xx/flex-tier unavailability), or — uniquely for the OpenAI 500
 * case — every simultaneously failing test, since a shared-provider 500 can take out more than one
 * probe in the same run at once (see the dual-block fixture in
 * `backend-credentialed-openai-server-rules.test.mts`).
 *
 * Callers must gate `hasBackendCredentialedProviderSmokeTestEnvelope` first.
 */
export function hasBackendCredentialedProviderTransientFailure(log: string): boolean {
  return (
    backendCredentialedSingleFailureMarkerGroups.some(markers =>
      hasSingleVitestFailureWithMarkers(log, backendCredentialedProbeFailurePattern, markers),
    ) ||
    hasOnlyVitestFailuresWithMarkers(
      log,
      [backendCredentialedProbeFailurePattern],
      backendCredentialedOpenAIServerErrorMarkers,
    )
  )
}
