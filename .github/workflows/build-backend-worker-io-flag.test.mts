import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  env?: Record<string, string>
  if?: string
  name?: string
  run?: string
}

type CompositeAction = { runs?: { steps?: Step[] } }

function readBuildBackendImagesAction(): CompositeAction {
  return load(
    readFileSync('.github/actions/build-backend-images/action.yml', 'utf8'),
  ) as CompositeAction
}

function step(action: CompositeAction, name: string): Step {
  const result = action.runs?.steps?.find(candidate => candidate.name === name)
  expect(result).toBeDefined()
  return result ?? {}
}

describe('worker-io backend automation flag', () => {
  it('selects backend CI when the one-line flag changes', () => {
    const flagPath = '.github/worker-io-automation.env'
    const mainBackend = readFileSync('.github/workflows/main-backend.yml', 'utf8')
    const primaryFilters = load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as Record<
      string,
      string[]
    >
    const runtimeFilters = load(
      readFileSync('.github/ci-runtime-path-filters.yml', 'utf8'),
    ) as Record<string, string[]>

    expect(mainBackend).toContain(`- '${flagPath}'`)
    expect(primaryFilters['build-backend']).toContain(flagPath)
    expect(primaryFilters['build-backend-infra']).toContain(flagPath)
    expect(runtimeFilters['build-backend']?.some(pattern => pattern.includes(flagPath))).toBe(true)
  })

  it('derives active images from the checked-in boolean flag', () => {
    const action = readBuildBackendImagesAction()
    const imageSet = step(action, 'Set backend image set')
    const flagText = readFileSync('.github/worker-io-automation.env', 'utf8')
    const flagMatch = /^WORKER_IO_AUTOMATION_ENABLED=(true|false)\n$/.exec(flagText)

    expect(flagMatch).not.toBeNull()
    expect(imageSet.run).toContain('.github/worker-io-automation.env')
    expect(imageSet.run).toContain(
      "sed -n 's/^WORKER_IO_AUTOMATION_ENABLED=//p' .github/worker-io-automation.env",
    )
    expect(imageSet.run).toContain('WORKER_IO_AUTOMATION_ENABLED must be true or false')
    expect(imageSet.run).toContain('worker_io_automation_enabled=')
    expect(imageSet.run).toContain("active_worker_images='worker-cpu'")
    expect(imageSet.run).toContain('if [ "$worker_io_automation_enabled" = \'true\' ]; then')
    expect(imageSet.run).toContain('active_worker_images="$active_worker_images worker-io"')

    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'worker-io-automation-'))
    const outputPath = join(temporaryDirectory, 'github-output')
    try {
      const result = spawnSync('bash', ['-c', imageSet.run ?? ''], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: outputPath },
      })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      const outputs = Object.fromEntries(
        readFileSync(outputPath, 'utf8')
          .trim()
          .split('\n')
          .map(line => line.split('=')),
      )
      const workerIoEnabled = flagMatch?.[1] === 'true'
      expect(outputs).toMatchObject({
        active_worker_images: workerIoEnabled ? 'worker-cpu worker-io' : 'worker-cpu',
        worker_io_automation_enabled: workerIoEnabled ? 'true' : 'false',
      })
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true })
    }
  })

  it('gates worker-io operations while preserving the true-state recovery path', () => {
    const action = readBuildBackendImagesAction()
    const metadata = step(action, 'Docker metadata (worker-io)')
    const coreBake = step(action, 'Build core backend images')
    const allBake = step(action, 'Build all backend images')
    const smoke = step(action, 'Run worker-io smoke test')

    expect(metadata.if).toBe("${{ steps.images.outputs.worker_io_automation_enabled == 'true' }}")
    expect(coreBake.if).toBe("${{ steps.images.outputs.worker_io_automation_enabled != 'true' }}")
    expect(allBake.if).toBe("${{ steps.images.outputs.worker_io_automation_enabled == 'true' }}")
    expect(allBake.if).not.toBe(coreBake.if)
    expect(smoke.if).toContain("steps.images.outputs.worker_io_automation_enabled == 'true'")
    expect(smoke.if).toContain("steps.bake-all.outcome == 'success'")
  })

  it('derives security artifact collections from active outputs', () => {
    const action = readBuildBackendImagesAction()
    const collections = [
      step(action, 'Report Docker image sizes'),
      step(action, 'Scan OS packages in images with Trivy'),
      step(action, 'Generate Trivy SBOMs'),
    ]

    for (const candidate of collections) {
      expect(candidate.env?.ACTIVE_WORKER_IMAGES).toBe(
        '${{ steps.images.outputs.active_worker_images }}',
      )
    }
  })
})
