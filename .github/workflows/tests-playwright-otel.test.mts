import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/tests-playwright.yml', 'utf8')
const playwrightSharedConfig = readFileSync('playwright/config/shared-config.mts', 'utf8')

function workflowJobSection(body: string, jobName: string): string {
  const match = body.match(
    new RegExp(`\\n {2}${jobName}:[\\s\\S]*?(?=\\n {2}[a-zA-Z0-9_-]+:\\n|$)`),
  )
  expect(match).not.toBeNull()
  return match![0]
}

describe('tests-playwright.yml OTel collector', () => {
  it('supports main-only OTel observability without expanding PR behavior', () => {
    const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8')
    const pathFilters = readFileSync('.github/ci-path-filters.yml', 'utf8')
    const mainWebWorkflow = readFileSync('.github/workflows/main-web.yml', 'utf8')
    const allocatePorts = workflow.indexOf('- name: Allocate ports')
    const startOtelCollector = workflow.indexOf('- name: Start OTel collector')
    const setupBackend = workflow.indexOf('uses: ./.github/actions/setup-backend')

    expect(workflow).toContain('otel_enabled:')
    expect(workflow).toContain("OTEL_ENABLED: ${{ inputs.otel_enabled && '1' || '' }}")
    expect(workflow).toContain('NEXT_PUBLIC_GIT_COMMIT: ${{ github.sha }}')
    expect(workflow).toContain('name: Start OTel collector')
    expect(startOtelCollector).toBeGreaterThan(allocatePorts)
    expect(startOtelCollector).toBeLessThan(setupBackend)
    expect(workflow.slice(allocatePorts, startOtelCollector)).not.toMatch(/\n {6}- (?:name|uses):/)
    expect(workflow).toContain('echo "Starting OTel collector"')
    expect(workflow).toContain('otel/opentelemetry-collector-contrib:0.153.0')
    expect(workflow).toContain('dev/otel/collector-config-ci.yaml')
    expect(workflow).toContain('chmod 0777 "$RUNNER_TEMP/otel-output"')
    expect(workflow).toContain('-p "127.0.0.1:$OTEL_HTTP_PORT:4318"')
    expect(workflow).toContain('-p "127.0.0.1:$OTEL_GRPC_PORT:4317"')
    expect(workflow).not.toContain('docker port "$COLLECTOR_NAME"')
    expect(workflow).not.toContain('port is already allocated')
    expect(workflow).not.toContain('OTel collector port collided')
    expect(workflow).not.toContain('Failed to allocate non-colliding OTel collector ports')
    expect(workflow).toContain('OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:$OTEL_HTTP_PORT')
    expect(workflow).toContain('docker stop --time 10')
    expect(workflow).toContain('playwright-otel-output-shard-${{ matrix.shard }}')
    expect(playwrightSharedConfig).toContain(`OTEL_SERVICE_NAME: 'voucha-web'`)
    expect(playwrightSharedConfig).toContain(
      `otelPreload: './backend/modules/on-error/sentry-preload.mts'`,
    )
    expect(playwrightSharedConfig).toContain(`otelPreload: './lambdas/shared/sentry-preload.mts'`)
    expect(workflow).not.toContain('aws-actions/configure-aws-credentials')
    expect(workflow).not.toContain('id-token: write')
    // ci.yml (PR-only) still passes the otel flag for main-push detection in PRs
    expect(ciWorkflow).toContain(
      "otel_enabled: ${{ vars.PLAYWRIGHT_OTEL_ENABLED == 'true' && github.event_name == 'push' && github.ref == 'refs/heads/main' && needs.detect-changes.outputs.trusted-secret-context == 'true' }}",
    )
    expect(mainWebWorkflow).toContain("otel_enabled: ${{ vars.PLAYWRIGHT_OTEL_ENABLED == 'true' }}")
    expect(mainWebWorkflow).toContain("- 'ci/runner-port-policy.mts'")
    // store-playwright-otel moved to main-web.yml (main-only push workflow)
    expect(mainWebWorkflow).toContain('store-playwright-otel:')
    const playwrightOtelStoreJob = workflowJobSection(mainWebWorkflow, 'store-playwright-otel')
    expect(playwrightOtelStoreJob).toContain('continue-on-error: true')
    expect(mainWebWorkflow).toContain(
      "(needs.playwright-tests.result == 'success' || needs.playwright-tests.result == 'failure')",
    )
    expect(playwrightOtelStoreJob).toContain('pattern: playwright-otel-output-shard-*')
    expect(playwrightOtelStoreJob).toContain('github-token: ${{ secrets.GITHUB_TOKEN }}')
    expect(playwrightOtelStoreJob).toContain('repository: ${{ github.repository }}')
    expect(playwrightOtelStoreJob).toContain('run-id: ${{ github.run_id }}')
    expect(playwrightOtelStoreJob).toContain('id: otel-store-credentials')
    expect(playwrightOtelStoreJob).toContain(
      'if [ -n "$AWS_OTEL_STORE_ROLE_ARN" ] && [ -n "$AWS_OTEL_STORE_URI" ]; then',
    )
    expect(
      playwrightOtelStoreJob.match(
        /if: steps\.otel-store-credentials\.outputs\.available == 'true'/g,
      ),
    ).toHaveLength(3)
    expect(playwrightOtelStoreJob).toContain(
      'role-to-assume: ${{ secrets.AWS_OTEL_STORE_ROLE_ARN }}',
    )
    expect(playwrightOtelStoreJob).not.toContain('role-to-assume: ${{ secrets.AWS_TEST_ROLE_ARN }}')
    expect(mainWebWorkflow).toContain('OTEL_STORE_URI: ${{ secrets.AWS_OTEL_STORE_URI }}')
    expect(ciWorkflow).not.toContain('test-playwright-otel:')
    expect(pathFilters).toContain("'playwright/config/**'")
    expect(pathFilters).toContain('playwright/config/**')
    expect(pathFilters).toContain('ts-shared/utils/**')
    expect(ciWorkflow).toContain("github.event_name == 'push'")
    expect(ciWorkflow).toContain("github.ref == 'refs/heads/main'")
    expect(ciWorkflow).not.toContain('uses: ./.github/workflows/tests-playwright-otel.yml')
  })

  it('reaps labeled workspace-owned collectors and verified legacy collectors before allocating ports', () => {
    const reap = workflow.indexOf('- name: Reap orphaned OTel collectors')
    const allocate = workflow.indexOf('- name: Allocate ports')

    expect(reap).toBeGreaterThan(-1)
    expect(reap).toBeLessThan(allocate)
    const reapStep = workflow.slice(reap, allocate)
    expect(reapStep).not.toContain('if: inputs.otel_enabled')
    expect(reapStep).toContain('docker ps -aq --no-trunc')
    expect(reapStep).toContain('--filter "label=com.voucha.ci.component=playwright-otel"')
    expect(reapStep).toContain('--filter "label=com.voucha.ci.workspace=$GITHUB_WORKSPACE"')
    expect(reapStep).toContain('docker rm -f "$container_id" || true')
    expect(reapStep).toContain("docker ps -aq --no-trunc --filter 'name=^/voucha-otel-'")
    expect(reapStep).toContain('docker inspect "$container_id" | python3 -c')
    expect(reapStep).toContain(
      're.fullmatch(r"/voucha-otel-[0-9]+-[0-9]+-[0-9]+", container.get("Name", ""))',
    )
    expect(reapStep).toContain('== "otel/opentelemetry-collector-contrib:0.153.0"')
    expect(reapStep).toContain('mount.get("Source") == os.environ["OTEL_CONFIG_SOURCE"]')
    expect(reapStep).toContain(
      'export OTEL_CONFIG_SOURCE="$GITHUB_WORKSPACE/dev/otel/collector-config-ci.yaml"',
    )
    expect(reapStep).toContain('mount.get("Destination") == "/etc/otelcol-contrib/config.yaml"')
    expect(reapStep).toContain('mount.get("RW") is False')
    expect(reapStep).toContain('if docker inspect "$container_id" | python3 -c')
    expect(reapStep).toContain('docker rm -f "$container_id" || true')
    expect(reapStep).not.toContain('docker container prune')
    expect(reapStep).not.toContain('docker system prune')
    expect(reapStep).not.toContain('docker image prune')
  })

  it('requires every legacy ownership predicate, including the current workspace mount', () => {
    const reap = workflow.indexOf('- name: Reap orphaned OTel collectors')
    const allocate = workflow.indexOf('- name: Allocate ports')
    const reapStep = workflow.slice(reap, allocate)

    expect(reapStep).toMatch(
      /len\(containers\) == 1\s+and re\.fullmatch\(r"\/voucha-otel-\[0-9\]\+-\[0-9\]\+-\[0-9\]\+", container\.get\("Name", ""\)\)\s+is not None\s+and container\.get\("Config", \{\}\)\.get\("Image"\)\s+== "otel\/opentelemetry-collector-contrib:0\.153\.0"\s+and any\(\s+mount\.get\("Type"\) == "bind"\s+and mount\.get\("Source"\) == os\.environ\["OTEL_CONFIG_SOURCE"\]\s+and mount\.get\("Destination"\) == "\/etc\/otelcol-contrib\/config\.yaml"\s+and mount\.get\("RW"\) is False/,
    )
    expect(reapStep).toContain(
      'export OTEL_CONFIG_SOURCE="$GITHUB_WORKSPACE/dev/otel/collector-config-ci.yaml"',
    )
    expect(reapStep).not.toContain('OTEL_CONFIG_SOURCE="$PWD/')
  })

  it('starts the labeled collector immediately after allocation', () => {
    const allocate = workflow.indexOf('- name: Allocate ports')
    const start = workflow.indexOf('- name: Start OTel collector')
    const setupBackend = workflow.indexOf('uses: ./.github/actions/setup-backend')

    expect(start).toBeGreaterThan(allocate)
    expect(start).toBeLessThan(setupBackend)
    expect(workflow.slice(allocate, start)).not.toMatch(/\n {6}- (?:name|uses):/)
    const startStep = workflow.slice(start, setupBackend)
    expect(startStep).toContain('--label "com.voucha.ci.component=playwright-otel"')
    expect(startStep).toContain('--label "com.voucha.ci.workspace=$GITHUB_WORKSPACE"')
    expect(startStep).toContain('-p "127.0.0.1:$OTEL_HTTP_PORT:4318"')
    expect(startStep).toContain('-p "127.0.0.1:$OTEL_GRPC_PORT:4317"')
    expect(startStep.indexOf('--release "$OTEL_HTTP_PORT"')).toBeLessThan(
      startStep.indexOf('docker run -d --name "$COLLECTOR_NAME"'),
    )
    expect(startStep.indexOf('--release "$OTEL_GRPC_PORT"')).toBeLessThan(
      startStep.indexOf('docker run -d --name "$COLLECTOR_NAME"'),
    )
  })
})
