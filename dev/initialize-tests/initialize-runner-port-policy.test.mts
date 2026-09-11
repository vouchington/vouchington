import { execFile } from 'node:child_process'
import { copyFile, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const initializePath = fileURLToPath(new URL('../initialize', import.meta.url))
const testDirs: string[] = []

async function run(script: string, env = '') {
  const root = await mkdtemp(join(tmpdir(), 'voucha-runner-port-policy-'))
  testDirs.push(root)
  await mkdir(join(root, 'worktree'))
  await writeFile(join(root, 'worktree', '.env'), env)
  const command = `source "$1" >/dev/null 2>&1; ${script}`
  const result = await execFileAsync('bash', ['-lc', command, 'initialize-test', initializePath], {
    cwd: join(root, 'worktree'),
    env: { ...process.env, HOME: dirname(root) },
  })
  return result.stdout.trim()
}

async function copyInitializeToMetacharacterPath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voucha-runner-port-policy-#-'-"))
  testDirs.push(root)
  await mkdir(join(root, 'dev'), { recursive: true })
  await mkdir(join(root, 'ci'), { recursive: true })
  await copyFile(initializePath, join(root, 'dev', 'initialize'))
  await cp(fileURLToPath(new URL('../lib', import.meta.url)), join(root, 'dev', 'lib'), {
    recursive: true,
  })
  await copyFile(
    fileURLToPath(new URL('../../ci/runner-port-policy.mts', import.meta.url)),
    join(root, 'ci', 'runner-port-policy.mts'),
  )
  await copyFile(
    fileURLToPath(new URL('../../ci/runner-port-policy.json', import.meta.url)),
    join(root, 'ci', 'runner-port-policy.json'),
  )
  return join(root, 'dev', 'initialize')
}

const setup = `
WORKTREE_DIR=$(worktree_dir_from_path "$PWD")
SANITIZED_DIR=$(sanitize_worktree_dir "$WORKTREE_DIR")
DB_NAME="voucha"
VALKEY_CONTAINER="voucha-valkey"
`

describe('initialize runner port policy', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('loads the policy when the worktree path contains URL metacharacters', async () => {
    const copiedInitialize = await copyInitializeToMetacharacterPath()
    const result = await execFileAsync(
      'bash',
      [
        '-lc',
        'source "$1"; load_runner_port_policy; printf \'%s,%s\' "$RUNNER_RESERVED_PORT_START" "$RUNNER_RESERVED_PORT_END"',
        'initialize-test',
        copiedInitialize,
      ],
      { env: { ...process.env, HOME: dirname(dirname(copiedInitialize)) } },
    )

    expect(result.stdout).toBe('2200,2999')
  })

  it('rejects saved reserved and non-worker-8787 ports in main and non-main worktrees', async () => {
    const portGroups = await Promise.all(
      ['true', 'false'].map(async isMain => {
        const output = await run(
          `${setup} IS_MAIN=${isMain}; assign_worktree_ports >/dev/null; printf '%s' "$BACKEND_PORT,$NEXT_PORT,$VALKEY_PORT,$WORKER_PORT,$IMAGE_LAMBDA_PORT,$INSPECTOR_PORT,$STORYBOOK_PORT"`,
          'export PORT=8787\nexport NEXT_PORT=2201\nexport VALKEY_URL=redis://localhost:2202\nexport WORKER_PORT=2203\nexport IMAGE_LAMBDA_PORT=2204\nexport INSPECTOR_PORT=2205\nexport STORYBOOK_PORT=2206\n',
        )
        return output.split(',').map(Number)
      }),
    )
    expect(portGroups[0]?.[3]).toBe(8787)
    const nonEntrypointPorts = portGroups.flatMap((ports, groupIndex) =>
      ports.filter((_, portIndex) => groupIndex !== 0 || portIndex !== 3),
    )
    expect(nonEntrypointPorts.every(port => port !== 8787 && (port < 2200 || port > 2999))).toBe(
      true,
    )
  })

  it('rerolls reserved fresh allocations for the main worktree', async () => {
    const output = await run(
      `${setup} allocate_random_ports() { if [ ! -f .called ]; then : > .called; printf '2200 2201 2202 2203'; else printf '3200 3201 3202 3203'; fi; }; IS_MAIN=true; assign_worktree_ports >/dev/null; printf '%s' "$BACKEND_PORT,$NEXT_PORT,$VALKEY_PORT,$WORKER_PORT,$IMAGE_LAMBDA_PORT"`,
      'export INSPECTOR_PORT=3300\nexport STORYBOOK_PORT=3400\n',
    )
    expect(output).toBe('3200,3201,3202,8787,3203')
  })

  it('treats leading-zero decimal port strings according to the port policy', async () => {
    const output = await run(
      `RUNNER_RESERVED_PORT_START=2200; RUNNER_RESERVED_PORT_END=2999; if is_valid_port 0080 && is_allocatable_worktree_port 0080; then printf '80=true'; else printf '80=false'; fi; if is_valid_port 002200 && ! is_allocatable_worktree_port 002200; then printf ',2200=true'; else printf ',2200=false'; fi; if is_valid_port 008787 && ! is_allocatable_worktree_port 008787; then printf ',8787=true'; else printf ',8787=false'; fi`,
    )

    expect(output).toBe('80=true,2200=true,8787=true')
  })

  it('does not retain 8787 as a saved main-worktree non-worker port', async () => {
    const outputs = await Promise.all(
      [
        'export PORT=8787\nexport NEXT_PORT=3101\nexport VALKEY_URL=redis://localhost:3102\nexport IMAGE_LAMBDA_PORT=3103\n',
        'export PORT=3100\nexport NEXT_PORT=8787\nexport VALKEY_URL=redis://localhost:3102\nexport IMAGE_LAMBDA_PORT=3103\n',
        'export PORT=3100\nexport NEXT_PORT=3101\nexport VALKEY_URL=redis://localhost:8787\nexport IMAGE_LAMBDA_PORT=3103\n',
        'export PORT=3100\nexport NEXT_PORT=3101\nexport VALKEY_URL=redis://localhost:3102\nexport IMAGE_LAMBDA_PORT=8787\n',
      ].map(env =>
        run(
          `${setup} allocate_random_ports() { printf '3200 3201 3202 3203'; }; IS_MAIN=true; assign_worktree_ports >/dev/null; printf '%s' "$BACKEND_PORT,$NEXT_PORT,$VALKEY_PORT,$WORKER_PORT,$IMAGE_LAMBDA_PORT"`,
          `${env}export INSPECTOR_PORT=3300\nexport STORYBOOK_PORT=3400\n`,
        ),
      ),
    )

    expect(outputs).toStrictEqual(Array(4).fill('3200,3201,3202,8787,3203'))
  })

  it('rerolls fresh main-worktree allocations containing 8787 for a non-worker port', async () => {
    const outputs = await Promise.all(
      [
        '8787 3201 3202 3203',
        '3200 8787 3202 3203',
        '3200 3201 8787 3203',
        '3200 3201 3202 8787',
      ].map(allocatedPorts =>
        run(
          `${setup} allocate_random_ports() { if [ ! -f .called ]; then : > .called; printf '${allocatedPorts}'; else printf '3300 3301 3302 3303'; fi; }; IS_MAIN=true; assign_worktree_ports >/dev/null; printf '%s' "$BACKEND_PORT,$NEXT_PORT,$VALKEY_PORT,$WORKER_PORT,$IMAGE_LAMBDA_PORT"`,
          'export INSPECTOR_PORT=3400\nexport STORYBOOK_PORT=3500\n',
        ),
      ),
    )

    expect(outputs).toStrictEqual(Array(4).fill('3300,3301,3302,8787,3303'))
  })

  it('rerolls saved Inspector and Storybook ports that collide with core ports or each other', async () => {
    const output = await run(
      `${setup} allocate_random_ports() { if [ ! -f .called ]; then : > .called; printf '3400'; else printf '3500'; fi; }; IS_MAIN=false; assign_worktree_ports >/dev/null; printf '%s' "$BACKEND_PORT,$NEXT_PORT,$VALKEY_PORT,$WORKER_PORT,$IMAGE_LAMBDA_PORT,$INSPECTOR_PORT,$STORYBOOK_PORT"`,
      'export PORT=3100\nexport NEXT_PORT=3101\nexport VALKEY_URL=redis://localhost:3102\nexport WORKER_PORT=3103\nexport IMAGE_LAMBDA_PORT=3104\nexport INSPECTOR_PORT=03100\nexport STORYBOOK_PORT=03400\n',
    )

    expect(output).toBe('3100,3101,3102,3103,3104,3400,3500')
  })
})
