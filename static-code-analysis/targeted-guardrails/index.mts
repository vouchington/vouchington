import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import {
  BASIC_AUTH_RUNBOOK_FILE,
  BASIC_AUTH_SOURCE_FILE,
  checkBasicAuthRunbookExemptPathsSync,
} from './basic-auth-doc-sync.mts'
import {
  RATE_LIMIT_DOC_FILE,
  RATE_LIMIT_SOURCE_FILE,
  checkRateLimitDocBindingsSync,
} from './rate-limit-doc-sync.mts'

export function checkTargetedGuardrails(ctx: SharedContext): { errors: string[] } {
  if (!ctx.isInsideGitRepo) {
    return { errors: [`::error::${ctx.repoRoot} is not inside a git repository`] }
  }

  const errors: string[] = []
  const basicAuthSourceTracked = ctx.trackedFileSet.has(BASIC_AUTH_SOURCE_FILE)
  const basicAuthRunbookTracked = ctx.trackedFileSet.has(BASIC_AUTH_RUNBOOK_FILE)
  if (basicAuthSourceTracked && basicAuthRunbookTracked) {
    const sourcePath = join(ctx.repoRoot, BASIC_AUTH_SOURCE_FILE)
    const runbookPath = join(ctx.repoRoot, BASIC_AUTH_RUNBOOK_FILE)
    if (existsSync(sourcePath) && existsSync(runbookPath)) {
      errors.push(
        ...checkBasicAuthRunbookExemptPathsSync({
          sourceCode: readFileSync(sourcePath, 'utf8'),
          runbookMarkdown: readFileSync(runbookPath, 'utf8'),
        }),
      )
    }
  } else if (basicAuthSourceTracked !== basicAuthRunbookTracked) {
    const missing = basicAuthSourceTracked ? BASIC_AUTH_RUNBOOK_FILE : BASIC_AUTH_SOURCE_FILE
    const present = basicAuthSourceTracked ? BASIC_AUTH_SOURCE_FILE : BASIC_AUTH_RUNBOOK_FILE
    errors.push(
      `::error file=${present}::${present}: basic-auth doc-sync guard expects ${missing} to also be tracked; if you renamed one of the two, update the guard path constants together`,
    )
  }

  const rateLimitSourceTracked = ctx.trackedFileSet.has(RATE_LIMIT_SOURCE_FILE)
  const rateLimitDocTracked = ctx.trackedFileSet.has(RATE_LIMIT_DOC_FILE)
  if (rateLimitSourceTracked && rateLimitDocTracked) {
    const sourcePath = join(ctx.repoRoot, RATE_LIMIT_SOURCE_FILE)
    const docPath = join(ctx.repoRoot, RATE_LIMIT_DOC_FILE)
    const sourceExists = existsSync(sourcePath)
    const docExists = existsSync(docPath)
    if (!sourceExists || !docExists) {
      const missing = sourceExists ? RATE_LIMIT_DOC_FILE : RATE_LIMIT_SOURCE_FILE
      const present = sourceExists ? RATE_LIMIT_SOURCE_FILE : RATE_LIMIT_DOC_FILE
      errors.push(
        `::error file=${present}::${present}: rate-limit doc-sync guard expects ${missing} to exist; if you renamed one of the two, update the guard path constants together`,
      )
    } else {
      errors.push(
        ...checkRateLimitDocBindingsSync({
          sourceCode: readFileSync(sourcePath, 'utf8'),
          docMarkdown: readFileSync(docPath, 'utf8'),
        }),
      )
    }
  } else if (rateLimitSourceTracked !== rateLimitDocTracked) {
    const missing = rateLimitSourceTracked ? RATE_LIMIT_DOC_FILE : RATE_LIMIT_SOURCE_FILE
    const present = rateLimitSourceTracked ? RATE_LIMIT_SOURCE_FILE : RATE_LIMIT_DOC_FILE
    errors.push(
      `::error file=${present}::${present}: rate-limit doc-sync guard expects ${missing} to also be tracked; if you renamed one of the two, update the guard path constants together`,
    )
  }

  return { errors }
}

export const targetedGuardrailChecksForTest = {
  checkBasicAuthRunbookExemptPathsSync,
  checkRateLimitDocBindingsSync,
} as const
