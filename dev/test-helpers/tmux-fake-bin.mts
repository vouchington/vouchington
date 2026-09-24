import { spawn } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { workerQueuePolicy } from '../../backend/modules/worker-queue-inventory/worker-queue-policy.mts'

const fakeTmuxPath = fileURLToPath(new URL('./fake-tmux.sh', import.meta.url))
const fakePgrepPath = fileURLToPath(new URL('./fake-pgrep.sh', import.meta.url))

const defaultQueues = [
  ...workerQueuePolicy.cpuOnlyQueues,
  ...workerQueuePolicy.ioCapableQueues,
].join(',')

// Each template file is executed once in beforeAll (30s hook budget) so no test's 10s dev/tmux run
// pays a fresh file's first-exec cost; see docs/development/reference-tests-vitest-projects.md.
const WARM_EXEC_TIMEOUT_MS = 10_000

const LOGGING_EXECUTABLE_NAMES = ['claude', 'codex', 'cursor-agent', 'pnpm'] as const
const TEMPLATE_FILE_NAMES = ['tmux', 'pgrep', 'docker', 'node', 'bash', ...LOGGING_EXECUTABLE_NAMES]

const DOCKER_SCRIPT =
  '#!/bin/bash\nprintf "docker %s\\n" "$*" >> "${FAKE_TMUX_LOG:?}"\nif [ "$1" = ps ]; then exit 0; fi\n'
const BASH_SCRIPT = '#!/bin/bash\nexec /bin/bash --noprofile --norc "$@"\n'
const NODE_SCRIPT = `#!/bin/bash
printf '%s\n' "$*" >> "\${FAKE_NODE_LOG:?}"
[[ "$*" == *"dev/localization/local-catalog.mts"* ]] && { printf '%s\n' "$(pwd)/.local/localization/catalog.sqlite"; exit 0; }
case "\${2:-}" in
  dev-all-queues)
    printf '%s\n' '${defaultQueues}'
    ;;
  *)
    printf 'node\n' >> "\${FAKE_EXEC_LOG:?}"; for arg in "$@"; do printf 'node-arg\t%s\n' "$arg" >> "\${FAKE_NODE_ARG_LOG:?}"; done
    printf 'node-env\tIMAGE_LAMBDA_PORT=%s\n' "\${IMAGE_LAMBDA_PORT:-}" >> "\${FAKE_NODE_ARG_LOG:?}"; printf 'node-env\tLOCALIZATION_SQLITE_PATH=%s\n' "\${LOCALIZATION_SQLITE_PATH:-}" >> "\${FAKE_NODE_ARG_LOG:?}"
    ;;
esac
`

const PASSTHROUGH_TARGETS: Record<string, string> = {
  basename: '/usr/bin/basename',
  dirname: '/usr/bin/dirname',
  openssl: '/usr/bin/openssl',
  grep: '/usr/bin/grep',
  tr: '/usr/bin/tr',
  sleep: '/bin/sleep',
}

function loggingScript(name: string) {
  return `#!/bin/bash\nprintf '${name}\\n' >> "\${FAKE_EXEC_LOG:?}"\n`
}

const testDirs: string[] = []

export function trackTmuxTestDir(dir: string) {
  testDirs.push(dir)
}

async function cleanupTmuxTestDirs() {
  await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
}

export interface MakeFakeBinOptions {
  tmux?: boolean
  codex?: boolean
  claude?: boolean
  cursor?: boolean
  overrides?: Record<string, string>
}

export interface TmuxFakeBinHooks {
  makeFakeBin: (options?: MakeFakeBinOptions) => Promise<string>
}

async function buildTemplate(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-tmux-template-'))
  await Promise.all([
    writeFile(join(dir, 'tmux'), await readFile(fakeTmuxPath, 'utf8')),
    writeFile(join(dir, 'pgrep'), await readFile(fakePgrepPath, 'utf8')),
    writeFile(join(dir, 'docker'), DOCKER_SCRIPT),
    writeFile(join(dir, 'node'), NODE_SCRIPT),
    writeFile(join(dir, 'bash'), BASH_SCRIPT),
    ...LOGGING_EXECUTABLE_NAMES.map(name => writeFile(join(dir, name), loggingScript(name))),
  ])
  await Promise.all(TEMPLATE_FILE_NAMES.map(name => chmod(join(dir, name), 0o555)))
  return dir
}

function warmFile(path: string, env: Record<string, string | undefined>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(path, [], { env, stdio: 'ignore' })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`tmux-fake-bin: warm-up of ${path} timed out`))
    }, WARM_EXEC_TIMEOUT_MS)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error instanceof Error ? error : new Error(String(error)))
    })
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function warmTemplate(templateDir: string): Promise<void> {
  const warmDir = await mkdtemp(join(tmpdir(), 'voucha-tmux-warm-'))
  try {
    const env: Record<string, string | undefined> = {
      ...process.env,
      FAKE_EXEC_LOG: join(warmDir, 'exec.log'),
      FAKE_NODE_ARG_LOG: join(warmDir, 'node-args.log'),
      FAKE_NODE_LOG: join(warmDir, 'node.log'),
      FAKE_TMUX_LOG: join(warmDir, 'tmux.log'),
      FAKE_TMUX_STATUS_LOG: join(warmDir, 'tmux-status.log'),
      PATH: `${templateDir}:/usr/bin:/bin`,
    }
    await Promise.all(TEMPLATE_FILE_NAMES.map(name => warmFile(join(templateDir, name), env)))
  } finally {
    await rm(warmDir, { force: true, recursive: true })
  }
}

async function writeOverride(dir: string, name: string, contents: string) {
  await writeFile(join(dir, name), contents)
  await chmod(join(dir, name), 0o755)
}

async function makeFakeBinFromTemplate(
  templateDir: string,
  options: MakeFakeBinOptions = {},
): Promise<string> {
  const { tmux = true, codex = true, claude = true, cursor = false, overrides = {} } = options
  const dir = await mkdtemp(join(tmpdir(), 'voucha-tmux-bin-'))
  trackTmuxTestDir(dir)

  const scriptedNames = ['docker', 'node', 'bash', 'pnpm']
  if (tmux) scriptedNames.push('tmux', 'pgrep')
  if (claude) scriptedNames.push('claude')
  if (codex) scriptedNames.push('codex')
  if (cursor) scriptedNames.push('cursor-agent')

  await Promise.all([
    ...scriptedNames.flatMap(name =>
      Object.hasOwn(overrides, name) ? [] : [symlink(join(templateDir, name), join(dir, name))],
    ),
    ...Object.entries(PASSTHROUGH_TARGETS).flatMap(([name, target]) =>
      Object.hasOwn(overrides, name) ? [] : [symlink(target, join(dir, name))],
    ),
    ...Object.entries(overrides).map(([name, script]) => writeOverride(dir, name, script)),
  ])

  return dir
}

// Registers a per-file beforeAll (build + warm one template dir), afterEach(cleanupTmuxTestDirs),
// and afterAll (remove the template). The returned makeFakeBin is the only route to a fake bin
// dir, and it throws until its own beforeAll has warmed the template.
export function registerTmuxFakeHooks(): TmuxFakeBinHooks {
  let templateDir: string | undefined

  beforeAll(async () => {
    const dir = await buildTemplate()
    try {
      await warmTemplate(dir)
    } catch (error) {
      await rm(dir, { force: true, recursive: true })
      throw error
    }
    templateDir = dir
  })

  afterEach(cleanupTmuxTestDirs)

  afterAll(async () => {
    const dir = templateDir
    templateDir = undefined
    if (dir) await rm(dir, { force: true, recursive: true })
  })

  return {
    makeFakeBin: async options => {
      if (!templateDir) {
        const error = new Error(
          'tmux-fake-bin: makeFakeBin() called before registerTmuxFakeHooks() warmed its ' +
            'template in beforeAll — call registerTmuxFakeHooks() at the top of the describe block.',
        )
        error.name = 'TmuxFakeBinNotWarmedError'
        throw error
      }
      return makeFakeBinFromTemplate(templateDir, options)
    },
  }
}
