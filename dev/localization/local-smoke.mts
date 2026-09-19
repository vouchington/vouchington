import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { catalogRevision, loadCatalogDirectory } from '@vouchington/localization-compiler'
import { waitFor } from '../../integration-tests/web/helpers/wait.mts'
import { WEB_CHROME_SELECTOR } from '../../web/lib/i18n/route-selectors.generated.mts'
import { maybeAssertSsrLocalizationRevision } from './ssr-revision-diagnostic.mts'

const execFileAsync = promisify(execFile)
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function requiredEnvironment(name: 'PORT' | 'WORKER_PORT'): string {
  const value = process.env[name]
  if (!value) throw new TypeError(`${name} is required; run ./dev/initialize web first`)
  return value
}

export function backendLocalizationUrl(port = requiredEnvironment('PORT')): string {
  const url = new URL(`http://localhost:${port}/api/v1/localization`)
  url.searchParams.set('consumer', 'web')
  url.searchParams.set('locales', 'en')
  url.searchParams.set('selectors', WEB_CHROME_SELECTOR)
  return url.toString()
}

export async function assertBackendLocalizationReady(
  url = backendLocalizationUrl(),
  workerSecret = process.env.CF_WORKER_SECRET,
): Promise<string> {
  const hostname = new URL(url).hostname
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new TypeError('Localization readiness probe must target the local backend')
  }
  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        'x-voucha-client': 'web',
        'x-voucha-platform': 'web',
        'x-voucha-app-version': 'development',
        ...(workerSecret ? { 'x-cf-worker-secret': workerSecret } : {}),
      },
      signal: AbortSignal.timeout(5_000),
    })
  } catch (error) {
    throw new Error(`Localization backend is unavailable at ${url}`, { cause: error })
  }
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`Localization backend is unavailable at ${url}: HTTP ${response.status}`)
  }
  const payload: unknown = await response.json()
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('revision' in payload) ||
    typeof payload.revision !== 'string'
  ) {
    throw new Error('Localization backend returned no catalog revision')
  }
  return payload.revision
}

export async function isLocalWorkerReady(url: string): Promise<boolean> {
  const hostname = new URL(url).hostname
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new TypeError('Worker readiness probe must target the local Worker')
  }
  try {
    const { stdout } = await execFileAsync(
      'curl',
      [
        '--silent',
        '--show-error',
        '--insecure',
        '--max-time',
        '5',
        '--output',
        '/dev/null',
        '--write-out',
        '%{http_code}',
        url,
      ],
      { timeout: 6_000 },
    )
    return stdout === '200'
  } catch {
    return false
  }
}

export async function findReadyLocalWorkerUrl(
  port = requiredEnvironment('WORKER_PORT'),
): Promise<string | undefined> {
  const httpsUrl = `https://localhost:${port}/`
  if (await isLocalWorkerReady(httpsUrl)) return httpsUrl
  const httpUrl = `http://localhost:${port}/`
  if (await isLocalWorkerReady(httpUrl)) return httpUrl
  return undefined
}

async function startLocalStack(): Promise<void> {
  requiredEnvironment('WORKER_PORT')
  await execFileAsync('./dev/tmux', ['--no-attach'])
  let backendRevision: string | undefined
  await waitFor(
    'localization backend',
    async () => {
      try {
        backendRevision = await assertBackendLocalizationReady()
        return true
      } catch {
        return false
      }
    },
    120_000,
  )
  const currentCatalog = await loadCatalogDirectory(join(repoRoot, 'localization', 'catalog'))
  if (!backendRevision) throw new Error('Localization backend returned no catalog revision')
  if (backendRevision !== catalogRevision(currentCatalog.catalog)) {
    throw new Error('Running backend localization catalog is stale; restart the managed tmux stack')
  }
  await maybeAssertSsrLocalizationRevision(backendRevision)
}

async function runBrowserSmoke(): Promise<void> {
  let workerUrl: string | undefined
  await waitFor(
    'local Worker landing page',
    async () => {
      workerUrl = await findReadyLocalWorkerUrl()
      return workerUrl !== undefined
    },
    120_000,
  )
  if (!workerUrl) throw new Error('Local Worker URL was not selected')
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const { stdout, stderr } = await execFileAsync(
    command,
    ['exec', 'playwright', 'test', '--config', 'playwright/localization-tmux.config.mts'],
    { env: { ...process.env, LOCALIZATION_TMUX_WORKER_URL: workerUrl } },
  )
  process.stdout.write(stdout)
  process.stderr.write(stderr)
}

async function main(): Promise<void> {
  await startLocalStack()
  await runBrowserSmoke()
}

if (import.meta.main) await main()
