import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, it } from 'vitest'

import { assertNoWorkflowViolations } from './workflow-test-helpers.mts'

// Hosts whose downloads don't need manual sha256sum verification because
// they are authenticated GitHub API endpoints or loopback addresses.
// Check with isTrustedHost() which strips optional port suffixes.
const TRUSTED_HOST_PREFIXES = [
  'localhost',
  '127.0.0.1',
  'api.github.com',
  'objects.githubusercontent.com',
]

function isTrustedHost(host: string): boolean {
  // Strip optional :port suffix before comparing
  const bare = host.split(':')[0] ?? host
  return TRUSTED_HOST_PREFIXES.includes(bare)
}

// Returns true for curl/wget lines that download a checksum file (e.g. checksums.txt,
// foo.sha256, foo.sha256sum). These downloads are part of the verification mechanism
// and don't themselves need sha256sum verification.
const CHECKSUM_DOWNLOAD_RE =
  /checksum|\.sha256sum\b|\.sha256\b|\.sha512\b|checksums|shasums|\.hash\b/i
function isChecksumDownload(value: string): boolean {
  return CHECKSUM_DOWNLOAD_RE.test(value)
}

// Pattern: detect direct `curl`/`wget` downloads or repo download-helper calls
// downloading from an http(s) URL.
// Captures the hostname from the URL.
const DOWNLOAD_RE_SOURCE = String.raw`\b(?:curl|wget|ci_download_to)\b[^\n]*https?:\/\/([^/\s'"]+)`
const DOWNLOAD_RE_G = new RegExp(DOWNLOAD_RE_SOURCE, 'g')
const DOWNLOAD_RE = new RegExp(DOWNLOAD_RE_SOURCE)

// sha256sum -c or shasum -a 256 -c present in the same step run block.
const SHA256_VERIFY_RE = /\bsha256sum\s+-c\b|\bshasum\s+-a\s+256\s+-c\b/

// Steps may annotate themselves with this comment to declare that no
// publisher-provided checksum is available. Requires a `reason=` argument so
// the exception is self-documenting and survives code review.
// Example: # integrity-check: skip reason=selene-releases-no-checksums
const SKIP_ANNOTATION_RE = /# integrity-check:\s*skip\s+reason=\S+/

// Matches simple uppercase shell variable assignments in run blocks, e.g.
// BASE_URL="https://example.com/download". Used to expand inline-assigned
// variables so that URL-from-variable download patterns are detected.
const SHELL_VAR_ASSIGN_RE = /^([A-Z_][A-Z0-9_]*)="([^"\n]+)"/gm

type Step = {
  run?: string
  env?: Record<string, string>
}

type Job = {
  steps?: Step[]
}

type Workflow = {
  jobs?: Record<string, Job>
  runs?: { steps?: Step[] }
}

const workflowFiles = readdirSync('.github/workflows').flatMap(f =>
  f.endsWith('.yml') || f.endsWith('.yaml') ? [`.github/workflows/${f}`] : [],
)

const actionFiles = readdirSync('.github/actions').flatMap(dir => {
  try {
    return readdirSync(`.github/actions/${dir}`).flatMap(f =>
      f === 'action.yml' || f === 'action.yaml' ? [`.github/actions/${dir}/${f}`] : [],
    )
  } catch {
    return []
  }
})

const allFiles = [...workflowFiles, ...actionFiles]

function getStepGroups(yaml: unknown): Array<{ label: string; steps: Step[] }> {
  const result: Array<{ label: string; steps: Step[] }> = []
  const wf = yaml as Workflow
  // Workflow jobs
  for (const [jobName, job] of Object.entries(wf?.jobs ?? {})) {
    if (job.steps?.length) result.push({ label: `job:${jobName}`, steps: job.steps })
  }
  // Composite actions store steps under runs.steps instead of jobs
  if (wf?.runs?.steps?.length) {
    result.push({ label: 'runs', steps: wf.runs.steps })
  }
  return result
}

describe('workflow download integrity', () => {
  it('every direct or helper download either has sha256sum verification, comes from a trusted host, or carries an integrity-check skip annotation', () => {
    const violations: string[] = []

    for (const filePath of allFiles) {
      const content = readFileSync(filePath, 'utf8')
      const yaml = load(content)

      for (const { label, steps } of getStepGroups(yaml)) {
        for (const [stepIdx, step] of steps.entries()) {
          if (!step.run) continue

          // Expand env vars from the step's env: block (best-effort)
          let run = step.run
          for (const [key, val] of Object.entries(step.env ?? {})) {
            run = run.replaceAll(`\${${key}}`, String(val))
            run = run.replaceAll(`$${key}`, String(val))
          }
          // Also expand simple uppercase shell variable assignments defined
          // inline within the run block (e.g. BASE_URL="https://...").
          // This catches URL-from-variable download patterns like:
          //   BASE_URL="https://example.com/releases/v${VERSION}"
          //   curl ... "${BASE_URL}/${ARCHIVE}"
          for (const match of step.run.matchAll(SHELL_VAR_ASSIGN_RE)) {
            const varName = match[1]
            const varValue = match[2]
            if (varName && varValue) {
              run = run.replaceAll(`\${${varName}}`, varValue)
              run = run.replaceAll(`$${varName}`, varValue)
            }
          }

          // Check each download line individually: each non-trusted download must
          // have a sha256sum -c on a subsequent line (before the next unrelated
          // download), or a skip annotation on the same or immediately preceding line.
          // Checksum-file downloads (e.g. checksums.txt, foo.sha256) are skipped
          // since they are the verification mechanism, not artifacts being verified.
          const lines = run.split('\n')
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx]!
            const lineDownloads = [...line.matchAll(DOWNLOAD_RE_G)]
            if (lineDownloads.length === 0) continue

            // Skip lines that download checksum files — they are the verification
            // mechanism and don't require their own sha256sum check.
            if (isChecksumDownload(line)) continue

            for (const match of lineDownloads) {
              const host = match[1]
              if (isTrustedHost(host ?? '')) continue

              // Skip annotation on this line or the immediately preceding line
              const prevLine = lineIdx > 0 ? (lines[lineIdx - 1] ?? '') : ''
              if (SKIP_ANNOTATION_RE.test(line) || SKIP_ANNOTATION_RE.test(prevLine)) continue

              // Find the index of the next download that is NOT a checksum file.
              // Checksum-file downloads are part of the verification pattern and do
              // not break the coverage window for the current download.
              let nextNonChecksumDownloadIdx = lines.length
              for (let k = lineIdx + 1; k < lines.length; k++) {
                const kLine = lines[k]!
                if (DOWNLOAD_RE.test(kLine) && !isChecksumDownload(kLine)) {
                  nextNonChecksumDownloadIdx = k
                  break
                }
              }

              // sha256sum -c must appear between this download and the next
              // unrelated download (adjacency requirement).
              if (
                lines
                  .slice(lineIdx + 1, nextNonChecksumDownloadIdx)
                  .some(l => SHA256_VERIFY_RE.test(l))
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

    assertNoWorkflowViolations(violations)
  })
})
