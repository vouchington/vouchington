import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'

import { parse } from 'yaml'

import {
  assertUnfilteredComponentSbom,
  assertVulnerabilityGate,
  isDownloadDatabaseOnly,
  isComponentSbomGeneration,
  isTrivyPackageScanCommand,
  trivyPackageScanCommandSegments,
  trivyPackageScanSubcommand,
} from './trivy-policy-command-helpers.mts'

export {
  assertUnfilteredComponentSbom,
  assertVulnerabilityGate,
  isComponentSbomGeneration,
  isTrivyPackageScanCommand,
  trivyPackageScanCommandSegments,
  trivyPackageScanSubcommand,
}

export type Ignore = Partial<Record<'expired_at' | 'id' | 'purls' | 'statement', unknown>>
export type IgnoreRegistry = { vulnerabilities?: Ignore[] }

type WorkflowStep = { run?: unknown; uses?: unknown }

export const GIT_LS_FILES_MAX_BUFFER_BYTES = 4 * 1024 * 1024

const OS_PURL =
  /^pkg:(deb|apk|rpm)\/(?:[A-Za-z0-9._~+-]|%[0-9A-Fa-f]{2})+\/(?:[A-Za-z0-9._~+-]|%[0-9A-Fa-f]{2})+@(?:[A-Za-z0-9._~+:-]|%[0-9A-Fa-f]{2})+(?:\?(?:[A-Za-z0-9._~+-]|%[0-9A-Fa-f]{2})+=(?:[A-Za-z0-9._~+:-]|%[0-9A-Fa-f]{2})+(?:&(?:[A-Za-z0-9._~+-]|%[0-9A-Fa-f]{2})+=(?:[A-Za-z0-9._~+:-]|%[0-9A-Fa-f]{2})+)*)?$/

function trackedRepositoryFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: GIT_LS_FILES_MAX_BUFFER_BYTES,
  })
    .split('\0')
    .filter(Boolean)
}

export function isShellPolicySource(path: string): boolean {
  if (/\.(bash|sh|zsh)$/.test(path)) return true
  try {
    if ((statSync(path).mode & 0o111) === 0) return false
    const firstLine = readFileSync(path, 'utf8').split('\n', 1)[0] ?? ''
    return /^#!\s*(?:\/usr\/bin\/env(?:\s+-S)?\s+|\/(?:usr\/)?bin\/)(?:ba|z)?sh(?:\s|$)/.test(
      firstLine,
    )
  } catch {
    return false
  }
}

function workflowSteps(path: string): WorkflowStep[] {
  const document = parse(readFileSync(path, 'utf8')) as {
    jobs?: Record<string, { steps?: WorkflowStep[] }>
    runs?: { steps?: WorkflowStep[] }
  }
  return [
    ...Object.values(document.jobs ?? {}).flatMap(job => job.steps ?? []),
    ...(document.runs?.steps ?? []),
  ]
}

export function parseIgnoreRegistry(source: string): IgnoreRegistry {
  // js-yaml's JSON_SCHEMA previously restricted implicit scalar resolution here (no octal/hex
  // numbers, no bare `~`/`.inf`/`.nan`). The `yaml` package has no equivalent preset — its
  // `schema: 'json'` requires fully JSON-quoted syntax and rejects the plain unquoted scalars
  // this registry is actually authored with (see the "unquotedDateRegistry" case in
  // trivy-policy.test.mts). That restriction is redundant here regardless: every field below is
  // re-validated by validateIgnoreRegistry() with an explicit `typeof` check plus a regex, so any
  // value an implicit-resolution schema would have coerced to a non-string (number, null, etc.)
  // still fails validation — just with a different thrown message.
  return parse(source) as IgnoreRegistry
}

export function assertNoUnsupportedTrivyAction(uses: unknown, path = 'fixture'): void {
  if (typeof uses === 'string' && /trivy/i.test(uses)) {
    throw new Error(`${path}: unsupported Trivy action ${uses}; use an auditable CLI run block`)
  }
}

function assertSupportedWorkflowSteps(paths: readonly string[]): string[] {
  const commands: string[] = []
  for (const path of paths) {
    for (const step of workflowSteps(path)) {
      assertNoUnsupportedTrivyAction(step.uses, path)
      if (typeof step.run !== 'string') continue
      commands.push(...trivyPackageScanCommandSegments(step.run))
    }
  }
  return commands
}

export function assertNoUnsupportedTrivyShellSource(source: string, path = 'fixture'): void {
  if (trivyPackageScanCommandSegments(source).some(command => !isDownloadDatabaseOnly(command))) {
    throw new Error(
      `${path}: unsupported Trivy shell-script scan; use an auditable workflow run block`,
    )
  }
}

export function trivyPackageScanCommands(repositoryFiles = trackedRepositoryFiles()): string[] {
  const workflowPaths = repositoryFiles.filter(
    path => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path) && existsSync(path),
  )
  const actionPaths = repositoryFiles.filter(
    path => /^\.github\/actions\/.+\.ya?ml$/.test(path) && existsSync(path),
  )
  for (const path of repositoryFiles.filter(isShellPolicySource)) {
    assertNoUnsupportedTrivyShellSource(readFileSync(path, 'utf8'), path)
  }
  return assertSupportedWorkflowSteps([...workflowPaths, ...actionPaths])
}

export function validateIgnoreRegistry(registry: IgnoreRegistry, now = new Date()): void {
  const vulnerabilities = registry.vulnerabilities
  if (!Array.isArray(vulnerabilities)) throw new Error('vulnerabilities must be an array')
  for (const [index, ignore] of vulnerabilities.entries()) {
    const prefix = `vulnerabilities[${index}]`
    if (typeof ignore.id !== 'string' || ignore.id.trim() === '')
      throw new Error(`${prefix}.id must be a vulnerability identifier`)
    if (
      !Array.isArray(ignore.purls) ||
      ignore.purls.length === 0 ||
      ignore.purls.some(purl => typeof purl !== 'string' || !OS_PURL.test(purl))
    )
      throw new Error(`${prefix}.purls must contain exact versioned package purls`)
    if (
      typeof ignore.statement !== 'string' ||
      !/^Not exploitable:\s*(?=\S).+?\.\s*Cleanup:\s*https:\/\/github\.com\/vouchington\/vouchington\/issues\/[1-9]\d*$/i.test(
        ignore.statement,
      )
    )
      throw new Error(
        `${prefix}.statement must give exploitability rationale and cleanup issue URL`,
      )
    if (typeof ignore.expired_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ignore.expired_at))
      throw new Error(`${prefix}.expired_at must be a UTC calendar date`)
    const expiry = new Date(`${ignore.expired_at}T00:00:00Z`)
    if (Number.isNaN(expiry.valueOf()) || expiry.toISOString().slice(0, 10) !== ignore.expired_at)
      throw new Error(`${prefix}.expired_at must be a UTC calendar date`)
    const today = now.toISOString().slice(0, 10)
    if (ignore.expired_at <= today) throw new Error(`${prefix}.expired_at must be after today`)
    const latest = new Date(`${today}T00:00:00Z`)
    latest.setUTCDate(latest.getUTCDate() + 30)
    if (ignore.expired_at > latest.toISOString().slice(0, 10))
      throw new Error(`${prefix}.expired_at must be no more than 30 days away`)
  }
}
