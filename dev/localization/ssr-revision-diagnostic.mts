import { SSR_LOCALIZATION_REVISION_ATTRIBUTE } from '../../web/lib/i18n/ssr-localization-revision-props.ts'

export const LOCALIZATION_SSR_REVISION_DIAGNOSTIC = 'LOCALIZATION_SSR_REVISION_DIAGNOSTIC'

export const LOCALIZATION_SSR_DIAGNOSTIC_PATHS = ['/', '/login', '/news'] as const

const NEXTJS_RESTART_HINT =
  'restart the nextjs tmux window so SSR reloads the backend catalog revision'

export function isLocalizationSsrRevisionDiagnosticEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[LOCALIZATION_SSR_REVISION_DIAGNOSTIC] === '1'
}

export function nextLocalizationOrigin(port: string): string {
  return `http://127.0.0.1:${port}`
}

export async function maybeAssertSsrLocalizationRevision(
  backendRevision: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!isLocalizationSsrRevisionDiagnosticEnabled(env)) return
  const port = env.NEXT_PORT
  if (!port) throw new TypeError('NEXT_PORT is required; run ./dev/initialize web first')
  await assertSsrLocalizationRevision(backendRevision, nextLocalizationOrigin(port))
}

export function parseSsrLocalizationRevision(html: string): string | undefined {
  const match = new RegExp(`${SSR_LOCALIZATION_REVISION_ATTRIBUTE}="([^"]+)"`).exec(html)
  return match?.[1]
}

async function assertSsrPathRevision(url: string, expectedRevision: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
  } catch (error) {
    throw new Error(`Next.js SSR localization diagnostic is unavailable at ${url}`, {
      cause: error,
    })
  }
  if (!response.ok) {
    throw new Error(
      `Next.js SSR localization diagnostic is unavailable at ${url}: HTTP ${response.status}`,
    )
  }
  const revision = parseSsrLocalizationRevision(await response.text())
  if (revision === undefined) {
    throw new Error(
      `Next.js SSR HTML at ${url} has no ${SSR_LOCALIZATION_REVISION_ATTRIBUTE}; local nextjs must run with NODE_ENV=development`,
    )
  }
  if (revision !== expectedRevision) {
    throw new Error(
      `Next.js SSR localization at ${url} rendered revision ${revision}, expected ${expectedRevision}; ${NEXTJS_RESTART_HINT}`,
    )
  }
}

export async function assertSsrLocalizationRevision(
  expectedRevision: string,
  origin: string,
  paths: readonly string[] = LOCALIZATION_SSR_DIAGNOSTIC_PATHS,
): Promise<void> {
  const hostname = new URL(origin).hostname
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new TypeError('SSR localization diagnostic must target the local Next.js origin')
  }
  await Promise.all(
    paths.map(path => assertSsrPathRevision(new URL(path, origin).toString(), expectedRevision)),
  )
}
