import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { relative, sep } from 'node:path'
import { createVitest } from 'vitest/node'
import {
  assertCanonicalRootVitestConfig,
  checkCanonicalRootVitestConfigControls,
  checkFiniteTimeoutProfiles,
  effectiveTimeoutCap,
} from 'vouchington-tooling/vitest-effective-timeout'

const root = process.cwd()
const configFileControls = checkCanonicalRootVitestConfigControls()
let context: Awaited<ReturnType<typeof createVitest>> | undefined
let failed = false
let primary: unknown
const cleanup: unknown[] = []
const projects: string[] = []
const requiredTests = new Set([
  '.husky/husky-hooks.test.mts',
  '.husky/post-checkout.test.mts',
  'backend/test-helpers/post-search-query-syntax.test.mts',
  'backend/test-helpers/dynamic-config.test.mts',
])
const collectedTests = new Set<string>()
try {
  const rootConfigs = execFileSync('git', ['ls-files', '-z', '--', ':(top,glob)vitest.config.*'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 4000,
  })
    .split('\0')
    .filter(Boolean)
  assertCanonicalRootVitestConfig(rootConfigs)
  context = await createVitest({ root, watch: false, run: true, reporters: [] })
  for (const project of context.projects) {
    const guards = project.viteConfig.plugins.filter(
      plugin => plugin.name === effectiveTimeoutCap({ maxTimeoutMs: 5_000 }).name,
    )
    assert.equal(guards.length, 1, project.name)
    for (const field of ['testTimeout', 'hookTimeout'] as const) {
      const value = project.config[field]
      assert.equal(value, 5_000, `${project.name}: resolved ${field}=${value}`)
    }
    assert.equal(project.browser, undefined, project.name)
    projects.push(project.name)
  }
  // A multi-project CI run can pass while silently collecting an important test in no project.
  for (const project of context.projects) {
    const { testFiles } = await project.globTestFiles()
    for (const file of testFiles) {
      const repositoryPath = relative(root, file).split(sep).join('/')
      if (requiredTests.has(repositoryPath)) collectedTests.add(repositoryPath)
    }
  }
  for (const file of requiredTests) {
    assert.ok(collectedTests.has(file), `${file} must be collected by a CI project`)
  }
  assert.ok(projects.length > 0)
} catch (err) {
  failed = true
  primary = err
} finally {
  try {
    await context?.close()
  } catch (err) {
    cleanup.push(err)
  }
}
if (failed || cleanup.length) {
  const errors = [...(failed ? [primary] : []), ...cleanup]
  throw new AggregateError(errors, 'Root timeout admission failed', { cause: errors[0] })
}

// Config-only probes must never import application globalSetup modules or start tests.
for (const project of projects) {
  let selected: Awaited<ReturnType<typeof createVitest>> | undefined
  let rejected = false
  let rejection: unknown
  const closeErrors: unknown[] = []
  try {
    selected = await createVitest({
      root,
      project: [project],
      testTimeout: 5_001,
      reporters: [],
      watch: false,
      run: true,
    })
  } catch (err) {
    rejected = true
    rejection = err
  } finally {
    try {
      await selected?.close()
    } catch (err) {
      closeErrors.push(err)
    }
  }
  if (closeErrors.length) {
    const errors = [...(rejected ? [rejection] : []), ...closeErrors]
    throw new AggregateError(errors, 'Selected project close failed', { cause: errors[0] })
  }
  assert.equal(rejected, true, project)
  assert.ok(String(rejection).includes(`Project ${project}: effective testTimeout`), project)
  assert.ok(String(rejection).includes('received 5001'), project)
}
const profiles = await checkFiniteTimeoutProfiles(root, { maxTimeoutMs: 5_000 })
process.stdout.write(
  `${JSON.stringify({ selectedProjects: projects, profiles, configFileControls })}\n`,
)
