import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { createFixtureDeadline } from '../test-helpers/fixture-deadline.mts'

const oxlint = resolve('node_modules/.bin/oxlint')
const config = resolve('.oxlintrc.json')
const consumerDirectory = resolve('backend/services/dynamic-config-admin')
const apiDirectory = resolve('backend/api/v1/dynamic-config')
const mcpDirectory = resolve('backend/mcp/admin')

describe('dynamic-config-admin Oxlint import exception', () => {
  it('allows published primitives only in the consumer and still rejects raw DynamicConfig', () => {
    const deadline = createFixtureDeadline()
    const consumerFixture = mkdtempSync(join(consumerDirectory, '.import-policy-'))
    const apiFixture = mkdtempSync(join(apiDirectory, '.import-policy-'))
    const mcpFixture = mkdtempSync(join(mcpDirectory, '.import-policy-'))
    const outsideFixture = mkdtempSync(resolve('backend/services/.dynamic-config-import-policy-'))
    try {
      const accepted = runOxlint(
        consumerFixture,
        "import { createDynamicConfigRegistry, validateDynamicConfigUpdate } from 'valkyries/dynamic-config'\nexport { createDynamicConfigRegistry, validateDynamicConfigUpdate }\n",
        deadline,
      )
      expect(accepted.status).toBe(0)

      const rejectedRawConfig = runOxlint(
        consumerFixture,
        "import { DynamicConfig } from 'valkyries/dynamic-config'\nexport { DynamicConfig }\n",
        deadline,
      )
      expect(rejectedRawConfig.status).toBe(1)
      expect(rejectedRawConfig.stdout).toContain('eslint(no-restricted-imports)')

      const rejectedOutsideConsumer = runOxlint(
        outsideFixture,
        "import { createDynamicConfigRegistry } from 'valkyries/dynamic-config'\nexport { createDynamicConfigRegistry }\n",
        deadline,
      )
      expect(rejectedOutsideConsumer.status).toBe(1)
      expect(rejectedOutsideConsumer.stdout).toContain('eslint(no-restricted-imports)')

      const validationError =
        "import { DynamicConfigValidationError } from 'valkyries/dynamic-config'\nexport { DynamicConfigValidationError }\n"
      expect(runOxlint(apiFixture, validationError, deadline).status).toBe(0)
      expect(runOxlint(mcpFixture, validationError, deadline).status).toBe(0)

      const rejectedValidationError = runOxlint(outsideFixture, validationError, deadline)
      expect(rejectedValidationError.status).toBe(1)
      expect(rejectedValidationError.stdout).toContain('eslint(no-restricted-imports)')
    } finally {
      rmSync(consumerFixture, { recursive: true, force: true })
      rmSync(apiFixture, { recursive: true, force: true })
      rmSync(mcpFixture, { recursive: true, force: true })
      rmSync(outsideFixture, { recursive: true, force: true })
    }
  })
})

function runOxlint(directory: string, source: string, deadline: () => number) {
  const fixture = join(directory, 'fixture.mts')
  writeFileSync(fixture, source)
  return spawnSync(oxlint, ['--config', config, '--format', 'json', fixture], {
    encoding: 'utf8',
    timeout: deadline(),
    killSignal: 'SIGKILL',
  })
}
