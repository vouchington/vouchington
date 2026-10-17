import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createVitest } from 'vitest/node'
import { effectiveTimeoutCap } from '../test-helpers/vitest-effective-timeout-cap.mts'
import {
  assertCanonicalRootVitestConfig,
  checkCanonicalRootVitestConfigControls,
  checkFiniteTimeoutProfiles,
} from '../test-helpers/vitest-effective-timeout-controls.mts'

const root = process.cwd()
const configFileControls = checkCanonicalRootVitestConfigControls()
let context: Awaited<ReturnType<typeof createVitest>> | undefined
let failed = false
let primary: unknown
const cleanup: unknown[] = []
const projects: string[] = []
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
      plugin => plugin.name === effectiveTimeoutCap().name,
    )
    assert.equal(guards.length, 1, project.name)
    for (const field of ['testTimeout', 'hookTimeout'] as const) {
      const value = project.config[field]
      assert.ok(
        Number.isFinite(value) && value > 0 && value <= 30_000,
        `${project.name}: resolved ${field}=${value}`,
      )
    }
    assert.equal(project.browser, undefined, project.name)
    projects.push(project.name)
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
      testTimeout: 30_001,
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
  assert.ok(String(rejection).includes('received 30001'), project)
}
const profiles = await checkFiniteTimeoutProfiles(root)
process.stdout.write(
  `${JSON.stringify({ selectedProjects: projects, profiles, configFileControls })}\n`,
)
