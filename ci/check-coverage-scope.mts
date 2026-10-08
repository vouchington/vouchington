#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadCoverageConfig, type CoverageScope } from 'coverage-check'
import { coverageConfigForScope } from '../test-helpers/vitest-config/coverage-config.mts'
import { findCoverageScopeMismatches } from './coverage-scope.mts'

export function checkCoverageScope(cwd: string): void {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
  const config = coverageConfigForScope(undefined)
  const instrumentedScope: CoverageScope = {
    version: 1,
    analyzer: 'javascript',
    include: config.include as string[],
    ignored: config.exclude as string[],
  }
  const mismatches = findCoverageScopeMismatches(
    files,
    loadCoverageConfig(resolve(cwd, '.coverage-rules.yml')),
    instrumentedScope,
  )
  if (mismatches.length > 0) {
    throw new Error(`Coverage rules require files that Vitest excludes: ${mismatches.join(', ')}`)
  }
}

if (import.meta.main) checkCoverageScope(process.cwd())
