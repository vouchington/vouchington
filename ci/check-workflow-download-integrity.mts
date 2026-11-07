#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'

import { trackedFiles } from './tracked-files.mts'

// Hosts whose downloads don't need manual sha256sum verification because
// they are authenticated GitHub API endpoints or loopback addresses.
const TRUSTED_HOST_PREFIXES = [
  'localhost',
  '127.0.0.1',
  'api.github.com',
  'objects.githubusercontent.com',
]

function isTrustedHost(host: string): boolean {
  const bare = host.split(':')[0] ?? host
  return TRUSTED_HOST_PREFIXES.includes(bare)
}

const CHECKSUM_DOWNLOAD_RE =
  /checksum|\.sha256sum\b|\.sha256\b|\.sha512\b|checksums|shasums|\.hash\b/i
function isChecksumDownload(value: string): boolean {
  return CHECKSUM_DOWNLOAD_RE.test(value)
}

const DOWNLOAD_RE_SOURCE = String.raw`\b(?:curl|wget|ci_download_to)\b[^\n]*https?:\/\/([^/\s'"]+)`
const DOWNLOAD_RE_G = new RegExp(DOWNLOAD_RE_SOURCE, 'g')
const DOWNLOAD_RE = new RegExp(DOWNLOAD_RE_SOURCE)
const SHA256_VERIFY_RE = /\bsha256sum\s+(?:-c|--check)\b|\bshasum\s+-a\s+256\s+-c\b/
const SKIP_ANNOTATION_RE = /# integrity-check:\s*skip\s+reason=\S+/
const SHELL_VAR_ASSIGN_RE = /^([A-Z_][A-Z0-9_]*)="([^"\n]+)"/gm

type Step = { run?: unknown; env?: Record<string, unknown> }
type Workflow = { jobs?: Record<string, { steps?: Step[] }>; runs?: { steps?: Step[] } }
type StepGroup = { label: string; steps: Step[] }

function getStepGroups(yaml: unknown): StepGroup[] {
  const result: StepGroup[] = []
  const workflow = yaml as Workflow
  for (const [jobName, job] of Object.entries(workflow?.jobs ?? {})) {
    if (job.steps?.length) result.push({ label: `job:${jobName}`, steps: job.steps })
  }
  if (workflow?.runs?.steps?.length) result.push({ label: 'runs', steps: workflow.runs.steps })
  return result
}

/** Return the exact policy violations for supplied workflow/action/script contents. */
export function workflowDownloadIntegrityViolations(
  sources: Readonly<Record<string, string>>,
): string[] {
  const violations: string[] = []
  const stepSources: Array<{ filePath: string; groups: StepGroup[] }> = []

  for (const [filePath, source] of Object.entries(sources).toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (filePath.endsWith('.sh')) {
      stepSources.push({ filePath, groups: [{ label: 'script', steps: [{ run: source }] }] })
    } else {
      stepSources.push({ filePath, groups: getStepGroups(parseYaml(source)) })
    }
  }

  for (const { filePath, groups } of stepSources) {
    for (const { label, steps } of groups) {
      for (const [stepIdx, step] of steps.entries()) {
        if (typeof step.run !== 'string') continue
        let run = step.run
        for (const [key, value] of Object.entries(step.env ?? {})) {
          run = run.replaceAll(`\${${key}}`, String(value)).replaceAll(`$${key}`, String(value))
        }
        for (const match of step.run.matchAll(SHELL_VAR_ASSIGN_RE)) {
          const varName = match[1]
          const varValue = match[2]
          if (varName && varValue) {
            run = run.replaceAll(`\${${varName}}`, varValue).replaceAll(`$${varName}`, varValue)
          }
        }
        // A continued curl keeps its URL on the next physical line. Join those
        // lines before matching so workflow shell scripts cannot hide a download.
        run = run.replace(/\\\n/g, ' ')

        const lines = run.split('\n')
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx]!
          const lineDownloads = [...line.matchAll(DOWNLOAD_RE_G)]
          if (lineDownloads.length === 0 || isChecksumDownload(line)) continue

          for (const match of lineDownloads) {
            const host = match[1]
            if (isTrustedHost(host ?? '')) continue
            const prevLine = lineIdx > 0 ? (lines[lineIdx - 1] ?? '') : ''
            if (SKIP_ANNOTATION_RE.test(line) || SKIP_ANNOTATION_RE.test(prevLine)) continue

            let nextNonChecksumDownloadIdx = lines.length
            for (let k = lineIdx + 1; k < lines.length; k++) {
              const candidate = lines[k]!
              if (DOWNLOAD_RE.test(candidate) && !isChecksumDownload(candidate)) {
                nextNonChecksumDownloadIdx = k
                break
              }
            }
            if (
              lines
                .slice(lineIdx + 1, nextNonChecksumDownloadIdx)
                .some(candidate => SHA256_VERIFY_RE.test(candidate))
            )
              continue

            violations.push(
              `${filePath} ${label} step[${stepIdx}]: downloads from ${host ?? 'unknown'} without sha256sum verification (add sha256sum -c after the download, or # integrity-check: skip reason=... on or before the download line)`,
            )
          }
        }
      }
    }
  }
  return violations
}

/** Workflow YAML, workflow shell scripts, and composite-action sources the download check owns. */
export function workflowDownloadPolicyPaths(paths: readonly string[]): string[] {
  return paths.filter(path =>
    path.startsWith('.github/workflows/')
      ? path.endsWith('.yml') || path.endsWith('.yaml') || path.endsWith('.sh')
      : /^\.github\/actions\/[^/]+\/(?:action\.ya?ml|[^/]+\.sh)$/u.test(path),
  )
}

function trackedPolicyPaths(root: string): string[] {
  return workflowDownloadPolicyPaths(trackedFiles(root, ['.github/workflows', '.github/actions']))
}

export function checkWorkflowDownloadIntegrity(root: string): string[] {
  const sources = Object.fromEntries(
    trackedPolicyPaths(root).map(path => [path, readFileSync(`${root}/${path}`, 'utf8')]),
  ) as Record<string, string>
  return workflowDownloadIntegrityViolations(sources)
}

/* v8 ignore start -- direct-execution entry; live CI check, not a Vitest suite. */
if (import.meta.main) {
  try {
    const defaultRoot = fileURLToPath(new URL('..', import.meta.url))
    const args = process.argv.slice(2)
    if (args.length !== 0 && (args.length !== 2 || args[0] !== '--root')) {
      throw new Error('Usage: node ci/check-workflow-download-integrity.mts [--root <path>]')
    }
    const root = args.length === 2 ? resolve(args[1]!) : defaultRoot
    const violations = checkWorkflowDownloadIntegrity(root)
    if (violations.length > 0) throw new Error(violations.join('\n'))
    console.log('Workflow download integrity checks passed.')
    process.exit(0)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
/* v8 ignore stop */
