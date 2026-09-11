import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'

function crc32(value: Buffer): number {
  let crc = 0xffffffff
  for (const byte of value) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function zipState(state: string): Buffer {
  const name = Buffer.from('ci-state.json')
  const input = Buffer.from(state)
  const output = deflateRawSync(input)
  const crc = crc32(input)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(8, 6)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(output.length, 18)
  local.writeUInt32LE(input.length, 22)
  local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(8, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(output.length, 20)
  central.writeUInt32LE(input.length, 24)
  central.writeUInt16LE(name.length, 28)
  const offset = local.length + name.length + output.length
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + name.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([local, name, output, central, name, end])
}
export function prJson(draft: boolean, labels: string[]): string {
  return JSON.stringify({ draft, labels: labels.map(name => ({ name })) })
}
export function recordedState(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 'ci-state:v1',
    prNumber: 8277,
    headSha: 'head-sha',
    testedSha: 'merge-sha',
    processingResult: 'success',
    deferred: true,
    producers: { 'test-backend-unit': 'success', 'test-web': 'success', storybook: 'skipped' },
    ...overrides,
  })
}
export function artifactList(id = 999, expired = false): string {
  return JSON.stringify({
    artifacts: [{ id, expired, created_at: '2026-01-01T00:00:00Z', workflow_run: { id: 888 } }],
  })
}
export function workflowRun(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 888,
    name: 'CI',
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    head_sha: 'head-sha',
    pull_requests: [{ number: 8277 }],
    ...overrides,
  })
}
export function workflowRuns(
  runs: Array<Record<string, unknown>> = [
    {
      id: 12_345,
      created_at: '2026-01-03T00:00:00Z',
      head_sha: 'head-sha',
      pull_requests: [{ number: 8277 }],
    },
    {
      id: 888,
      created_at: '2026-01-02T00:00:00Z',
      head_sha: 'head-sha',
      pull_requests: [{ number: 8277 }],
    },
  ],
): string {
  return JSON.stringify([{ workflow_runs: runs }])
}
export function executeReadyDedupe({
  prResponse = prJson(false, []),
  prExit = 0,
  artifactsResponse = artifactList(),
  artifactsExit = 0,
  runResponse = workflowRun(),
  runExit = 0,
  runsResponse = workflowRuns(),
  runsExit = 0,
  stateResponse = recordedState(),
  zipExit = 0,
  tempAvailable = true,
  eventAction = 'opened',
  eventName = 'pull_request',
}: {
  prResponse?: string
  prExit?: number
  artifactsResponse?: string
  artifactsExit?: number
  runResponse?: string
  runExit?: number
  runsResponse?: string
  runsExit?: number
  stateResponse?: string
  zipExit?: number
  tempAvailable?: boolean
  eventAction?: string
  eventName?: string
} = {}): { outputs: Record<string, string>; stderr: string; stdout: string } {
  const directory = mkdtempSync(join(tmpdir(), 'ci-ready-dedupe-'))
  const ghPath = join(directory, 'gh')
  const outputPath = join(directory, 'github-output')
  const zipPath = join(directory, 'state.zip')
  const runnerTemp = tempAvailable ? directory : join(directory, 'not-a-directory')
  if (!tempAvailable) writeFileSync(runnerTemp, '')
  writeFileSync(zipPath, zipState(stateResponse))
  writeFileSync(
    ghPath,
    `#!/bin/bash
args="$*"
if [[ "$args" == *"/pulls/"* ]]; then printf '%s' "$GH_PR_RESPONSE"; exit "$GH_PR_EXIT"; fi
if [[ "$args" == *"/actions/artifacts?name="* ]]; then printf '%s' "$GH_ARTIFACTS_RESPONSE"; exit "$GH_ARTIFACTS_EXIT"; fi
if [[ "$args" == *"/actions/workflows/ci.yml/runs?"* ]]; then printf '%s' "$GH_RUNS_RESPONSE"; exit "$GH_RUNS_EXIT"; fi
if [[ "$args" == *"/actions/runs/"* ]]; then printf '%s' "$GH_RUN_RESPONSE"; exit "$GH_RUN_EXIT"; fi
if [[ "$args" == *"/artifacts/"*"/zip"* ]]; then cat "$GH_STATE_ZIP"; exit "$GH_ZIP_EXIT"; fi
exit 1
`,
  )
  chmodSync(ghPath, 0o755)
  try {
    const result = spawnSync('bash', ['ci/ready-dedupe.sh'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        GH_PR_RESPONSE: prResponse,
        GH_PR_EXIT: String(prExit),
        GH_ARTIFACTS_RESPONSE: artifactsResponse,
        GH_ARTIFACTS_EXIT: String(artifactsExit),
        GH_RUN_RESPONSE: runResponse,
        GH_RUN_EXIT: String(runExit),
        GH_RUNS_RESPONSE: runsResponse,
        GH_RUNS_EXIT: String(runsExit),
        GH_STATE_ZIP: zipPath,
        GH_ZIP_EXIT: String(zipExit),
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: 'owner/repo',
        EVENT_NAME: eventName,
        EVENT_ACTION: eventAction,
        HEAD_SHA: 'head-sha',
        TESTED_SHA: 'merge-sha',
        PR_NUMBER: '8277',
        RUN_ID: '12345',
        RUNNER_TEMP: runnerTemp,
      },
    })
    if (result.status !== 0)
      throw new Error(`ready-dedupe exited ${result.status}: ${result.stderr}`)
    return {
      outputs: Object.fromEntries(
        readFileSync(outputPath, 'utf8')
          .trim()
          .split('\n')
          .map(line => line.split('=', 2) as [string, string]),
      ),
      stderr: result.stderr,
      stdout: result.stdout,
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
