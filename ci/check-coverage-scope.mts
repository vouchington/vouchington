#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { loadCoverageConfig, type CoverageScope } from 'coverage-check'
import { coverageConfigForScope } from '../test-helpers/vitest-config/coverage-config.mts'
import { findCoverageScopeMismatches } from './coverage-scope.mts'

const files = execFileSync('git', ['ls-files', '-z'], {
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
  loadCoverageConfig('.coverage-rules.yml'),
  instrumentedScope,
)
if (mismatches.length > 0) {
  console.error('Coverage rules require files that Vitest excludes:', ...mismatches)
  process.exitCode = 1
}
