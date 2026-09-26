import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  'continue-on-error'?: boolean
  env?: Record<string, string>
  name?: string
  run?: string
  uses?: string
  with?: Record<string, string>
  if?: string
  id?: string
}

type Workflow = {
  env?: Record<string, string>
  jobs?: {
    build?: {
      services?: Record<
        string,
        {
          image?: string
          options?: string
          ports?: Array<number | string>
        }
      >
      steps?: Step[]
      'timeout-minutes'?: number
    }
  }
}

type CompositeAction = { runs?: { steps?: Step[] } }

// The image builds, smoke tests, and Trivy gate all live in the composite action that
// build-backend.yml (and publish-backend-images.yml) delegate to -- only the job-level
// declarations (services, env) stay in the calling workflow file.
function readBuildBackendWorkflow(): Workflow {
  return load(readFileSync('.github/workflows/build-backend.yml', 'utf8')) as Workflow
}

function readBuildBackendImagesSteps(): Step[] {
  const action = load(
    readFileSync('.github/actions/build-backend-images/action.yml', 'utf8'),
  ) as CompositeAction
  return action.runs?.steps ?? []
}

const deployedNativeAddonSmoke = readFileSync('ci/check-deployed-worker-native-addons.mjs', 'utf8')

describe('build-backend workflow', () => {
  it('runs the deployed Valkey diagnostic in a fresh API image container', () => {
    const step = readBuildBackendImagesSteps().find(
      candidate => candidate.name === 'Run API smoke test',
    )

    expect(step?.env?.VALKEY_URL).toBe("redis://localhost:${{ job.services.valkey.ports['6379'] }}")
    expect(step?.run).toContain('PORT=$(python3 ci/allocate-browser-safe-ports.py 1)')
    const [serverSmoke, diagnosticSmoke] =
      step?.run?.split('Running deployed Valkey diagnostic') ?? []
    expect(serverSmoke).not.toContain('ENVIRONMENT=test')
    expect(step?.run).toContain('docker run --rm --network host')
    expect(diagnosticSmoke).toContain('-e NODE_ENV=test -e ENVIRONMENT=test -e VALKEY_URL')
    expect(step?.run).toContain('valkey-admin.mts diagnose')
    expect(step?.run).toContain("jq -s -e '")
    expect(step?.run).toContain('length == 1 and')
    expect(step?.run).toContain('(.[0] |')
    expect(step?.run).toContain('.schemaVersion == 1')
    expect(step?.run).toContain('.operation == "diagnose"')
    expect(step?.run).toContain('observedFlushTargetKeyCounts | keys ==')
    expect(step?.run).not.toContain(
      'docker exec "$SERVER_CONTAINER" /nodejs/bin/node --experimental-strip-types',
    )
  })

  it('limits every image gate to OS vulnerabilities and writes complete findings reports', () => {
    const scanStep = readBuildBackendImagesSteps().find(
      step => step.name === 'Scan OS packages in images with Trivy',
    )

    expect(scanStep?.run).toContain('--pkg-types os')
    expect(scanStep?.run).toContain('--quiet')
    expect(scanStep?.run).toContain('--table-mode detailed')
    expect(scanStep?.run).toContain('--output "trivy-${target}-os-table.txt"')
    expect(scanStep?.run).toContain('2> "trivy-${target}-os-stderr.txt"')
    expect(scanStep?.run).toContain('cat "trivy-${target}-os-table.txt"')
    expect(scanStep?.run).toContain('cat "trivy-${target}-os-stderr.txt" >&2')
    expect(scanStep?.run).not.toContain('echo "Scanning')
    expect(scanStep?.run).not.toContain('No CRITICAL/HIGH')
    expect(scanStep?.run).not.toContain('| tee')
    expect(scanStep?.run).not.toContain('head -n 200')
    expect(scanStep?.run).toContain('title=Trivy OS vulnerability findings')
    expect(scanStep?.run).toContain('title=Trivy scanner error')
  })

  it('builds the active worker images without reading deployment topology', () => {
    const compositeAction = readFileSync('.github/actions/build-backend-images/action.yml', 'utf8')
    const steps = readBuildBackendImagesSteps()
    const images = steps.find(step => step.name === 'Set backend image set')
    expect(images?.run).toContain('active_worker_images=')
    expect(compositeAction).not.toContain('worker-queue-policy-cli')

    const ioMetadata = steps.find(step => step.name === 'Docker metadata (worker-io)')
    const ioSmoke = steps.find(step => step.name === 'Run worker-io smoke test')
    expect(ioMetadata?.if).toContain('worker_io_automation_enabled')
    expect(ioSmoke?.if).toContain('worker_io_automation_enabled')

    for (const stepName of [
      'Report Docker image sizes',
      'Scan OS packages in images with Trivy',
      'Generate Trivy SBOMs',
    ]) {
      expect(steps.find(step => step.name === stepName)?.run).toContain('ACTIVE_WORKER_IMAGES')
    }
  })

  it('gives worker-io smoke tests a reachable Valkey service', () => {
    const buildJob = readBuildBackendWorkflow().jobs?.build
    expect(buildJob?.services?.valkey).toMatchObject({ ports: [6379] })
    expect(buildJob?.services?.valkey?.image).toMatch(
      /^valkey\/valkey-bundle:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/u,
    )
    expect(buildJob?.services?.valkey?.options).toContain('valkey-cli ping')

    const workerIoSmokeStep = readBuildBackendImagesSteps().find(
      step => step.name === 'Run worker-io smoke test',
    )
    expect(workerIoSmokeStep?.env?.VALKEY_URL).toBe(
      "redis://localhost:${{ job.services.valkey.ports['6379'] }}",
    )
    expect(workerIoSmokeStep?.run).toContain(
      'docker run -d --name "$WORKER_CONTAINER" --network host',
    )
    expect(workerIoSmokeStep?.run).toContain(
      'WORKER_QUEUE_EXCLUDES=$(docker run --rm --entrypoint /nodejs/bin/node "$IMAGE"',
    )
    expect(workerIoSmokeStep?.run).toContain(
      'const queues = m.WORKER_DEFINITIONS.map(definition => `-${definition.queueName}`)',
    )
    expect(workerIoSmokeStep?.run).toContain('worker-io WORKER_DEFINITIONS is empty')
    expect(workerIoSmokeStep?.run).toContain('-e QUEUES="$WORKER_QUEUE_EXCLUDES"')
    expect(workerIoSmokeStep?.run).not.toContain('-e QUEUES=emails')
    expect(workerIoSmokeStep?.run).toContain('-e VALKEY_URL \\')
  })

  it('gives worker-cpu smoke tests a reachable Valkey service', () => {
    const workerCpuSmokeStep = readBuildBackendImagesSteps().find(
      step => step.name === 'Run worker-cpu smoke test',
    )
    expect(workerCpuSmokeStep?.env?.VALKEY_URL).toBe(
      "redis://localhost:${{ job.services.valkey.ports['6379'] }}",
    )
    expect(workerCpuSmokeStep?.if).toBe(
      "${{ !cancelled() && (steps.bake-core.outcome == 'success' || steps.bake-all.outcome == 'success') }}",
    )
    expect(workerCpuSmokeStep?.run).toContain(
      'docker run -d --name "$WORKER_CONTAINER" --network host',
    )
    expect(workerCpuSmokeStep?.run).toContain('-e VALKEY_URL \\')
  })

  it('enqueues a heartbeat job and verifies completion in both worker smoke tests', () => {
    const steps = readBuildBackendImagesSteps()

    for (const name of ['Run worker-cpu smoke test', 'Run worker-io smoke test']) {
      const step = steps.find(s => s.name === name)
      expect(step?.run).toContain("'@queues/heartbeat/enqueues'")
      expect(step?.run).toContain('m.enqueueHeartbeat()')
      expect(step?.run).toContain('job completed: heartbeat')
    }
  })

  it('gates the build on CRITICAL/HIGH fixable Trivy findings', () => {
    // continue-on-error must be gone from every step in the enforcement chain
    // (install guard, scan, SBOM) so a finding actually fails the `backend` gate.
    // "Install Trivy" itself
    // keeps continue-on-error: true — the install guard step immediately after
    // it is the deliberate enforcement point for install failures.
    const steps = readBuildBackendImagesSteps()

    const installStep = steps.find(step => step.name === 'Install Trivy')
    expect(installStep?.['continue-on-error']).toBe(true)
    // id lets the guard tell "ran and failed" apart from "skipped because an
    // earlier unrelated step already failed the job" (run 31910979397).
    expect(installStep?.id).toBe('install-trivy')
    // The install guard below now hard-fails a required check on missing trivy,
    // so the release download itself needs retries against transient GitHub
    // Releases blips (matching the retry pattern used for nodejs downloads
    // elsewhere in this repo).
    expect(installStep?.run).toContain('--retry 3 --retry-all-errors')

    const installGuardStep = steps.find(step => step.name === 'Trivy install guard')
    expect(installGuardStep?.['continue-on-error']).toBeUndefined()
    expect(installGuardStep?.run).toContain('exit 1')
    // `!cancelled()` alone is also true when Install Trivy was skipped, so the
    // guard must additionally require the install step actually ran. Assert
    // the exact expression (not toContain) so a boolean-operator regression
    // like `!cancelled() || steps.install-trivy.outcome != 'skipped'` — which
    // would re-enable the cascade this test guards against — fails here too.
    expect(installGuardStep?.if).toBe(
      "${{ !cancelled() && steps.install-trivy.outcome != 'skipped' }}",
    )

    const scanStep = steps.find(step => step.name === 'Scan OS packages in images with Trivy')
    expect(scanStep?.['continue-on-error']).toBeUndefined()
    expect(scanStep?.run).toContain('--exit-code "$TRIVY_FINDINGS_EXIT_CODE"')
    expect(scanStep?.run).toContain('--severity CRITICAL,HIGH')
    expect(scanStep?.run).toContain('--ignore-unfixed')
    expect(scanStep?.run).toContain('--pkg-types os')
    // The active-image loop must scan every target before failing, not abort on
    // the first vulnerable image, so the step summary stays complete.
    expect(scanStep?.run).toContain('|| target_exit=$?')
    expect(scanStep?.run).toContain('exit "$scan_error_exit"')
    expect(scanStep?.run).toContain('exit "$TRIVY_FINDINGS_EXIT_CODE"')

    const sbomStep = steps.find(step => step.name === 'Generate Trivy SBOMs')
    expect(sbomStep?.['continue-on-error']).toBeUndefined()
    // The SBOM step only runs once the OS vulnerability gate has already passed
    // (no `if: always()`), so filtering it by severity would only ever truncate
    // the artifact, never gate anything. Keep it a complete, unfiltered inventory.
    expect(sbomStep?.run).toContain('--exit-code 0')
    expect(sbomStep?.run).not.toContain('--severity')
    expect(sbomStep?.run).not.toContain('--ignore-unfixed')
    expect(sbomStep?.run).not.toContain('--pkg-types')
    expect(sbomStep?.run).not.toContain('--ignorefile')
    expect(sbomStep?.run).not.toContain('--scanners vuln')

    const uploadStep = steps.find(step => step.name === 'Upload Trivy artifacts')
    expect(uploadStep?.['continue-on-error']).toBe(true)
  })

  it('verifies every deployed Vurst wrapper against its required target assets', () => {
    const step = readBuildBackendImagesSteps().find(
      candidate => candidate.name === 'Run worker-cpu smoke test',
    )
    expect(step?.run).toContain(
      'docker exec -i "$WORKER_CONTAINER" /nodejs/bin/node --input-type=module',
    )
    expect(step?.run).toContain('ci/check-deployed-worker-native-addons.mjs')
    expect(deployedNativeAddonSmoke).toContain("wrapper: '@jongleberry/vurst-ai'")
    expect(deployedNativeAddonSmoke).toContain("wrapper: '@jongleberry/vurst-html'")
    expect(deployedNativeAddonSmoke).toContain("wrapper: '@jongleberry/vurst-markdown'")
    expect(deployedNativeAddonSmoke).toContain('vurst-ai.linux-arm64-gnu.node')
    expect(deployedNativeAddonSmoke).toContain('onnxruntime/libonnxruntime.so')
    expect(deployedNativeAddonSmoke).toContain('vurst-html.linux-arm64-gnu.node')
    expect(deployedNativeAddonSmoke).toContain('vurst-markdown.linux-arm64-gnu.node')
    expect(deployedNativeAddonSmoke).toContain('wrapperPackage.optionalDependencies')
    expect(deployedNativeAddonSmoke).toContain('foreignPlatforms')
  })

  it('imports lingua-rs from the deployed worker-cpu dependency tree', () => {
    expect(deployedNativeAddonSmoke).toContain("requireFromConsumer('@workers/language-detection')")
    expect(deployedNativeAddonSmoke).toContain("resolve('@services/language-detection/detector')")
    expect(deployedNativeAddonSmoke).toContain("resolve('lingua-rs')")
    expect(deployedNativeAddonSmoke).toContain('import(pathToFileURL(lingua).href)')
  })

  it('keeps the deployed native-addon smoke script syntactically valid', () => {
    expect(() =>
      execFileSync(process.execPath, ['--check', 'ci/check-deployed-worker-native-addons.mjs']),
    ).not.toThrow()
  })
})
