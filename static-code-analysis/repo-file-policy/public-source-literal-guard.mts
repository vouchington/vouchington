import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  AWS_EVENT_ACCOUNT_RE,
  AWS_EVENT_DISCRIMINATOR_RE,
  EXCLUDED_PATH_RE,
  GENERIC_S3_BUCKET_RE,
  INJECTED_S3_BUCKET_RE,
  PATTERNS,
} from './public-source-literal-patterns.mts'

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

function report(errors: string[], file: string, line: number, category: string): void {
  errors.push(
    `::error file=${file},line=${line}::public source literal guard: ${category} must be injected, generic, or private`,
  )
}

function checkS3Locations(file: string, content: string, errors: string[]): void {
  const locations = [
    /s3:\/\/([^/\s`"']+)/gi,
    /arn:aws(?:-[a-z0-9-]+)?:s3:::([^/\s`"']+)/gi,
    /https?:\/\/([^/\s`"']+?)\.s3(?:[.-][a-z0-9-]+)*\.amazonaws\.com(?:\.cn)?(?=[:/\s`"']|$)/gi,
    /https?:\/\/s3(?:[.-][a-z0-9-]+)*\.amazonaws\.com(?:\.cn)?\/([^/\s`"']+)/gi,
  ]
  for (const expression of locations) {
    for (const match of content.matchAll(expression)) {
      const bucket = match[1]
      if (
        bucket === undefined ||
        INJECTED_S3_BUCKET_RE.test(bucket) ||
        GENERIC_S3_BUCKET_RE.test(bucket)
      )
        continue
      report(errors, file, lineAt(content, match.index ?? 0), 'S3 location')
    }
  }
}

export function checkPublicSourceLiterals(
  repoRoot: string,
  trackedFiles: readonly string[],
  errors: string[],
): void {
  for (const file of trackedFiles) {
    if (EXCLUDED_PATH_RE.test(file)) continue
    const path = join(repoRoot, file)
    if (statSync(path).isDirectory()) continue
    const buffer = readFileSync(path)
    if (buffer.includes(0)) continue
    const content = buffer.toString('utf8')
    for (const pattern of PATTERNS) {
      if (pattern.appliesTo !== undefined && !pattern.appliesTo(file)) continue
      for (const match of content.matchAll(
        new RegExp(pattern.expression.source, `${pattern.expression.flags}g`),
      )) {
        report(errors, file, lineAt(content, match.index ?? 0), pattern.category)
      }
    }
    if (AWS_EVENT_DISCRIMINATOR_RE.test(content)) {
      for (const match of content.matchAll(AWS_EVENT_ACCOUNT_RE))
        report(errors, file, lineAt(content, match.index ?? 0), 'AWS account identifier')
    }
    checkS3Locations(file, content, errors)
  }
}
