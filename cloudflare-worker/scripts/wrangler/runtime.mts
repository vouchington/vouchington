import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface WranglerRuntimePathOptions {
  isCi: boolean
  runAttempt: string
  tempRoot?: string
  workerDir: string
  workerPort: string
}

export interface WranglerRuntimePaths {
  cache: string
  cfFetchCache: string
  home: string
  logs: string
  miniflareCache: string
  persistTo: string
  registry: string
  root: string
  tmp: string
  xdgCache: string
  xdgConfig: string
  xdgState: string
}

export function getWranglerPersistToPath(
  workerPort: string,
  runAttempt: string,
  tempRoot = tmpdir(),
): string {
  return getWranglerRuntimePaths({
    isCi: true,
    runAttempt,
    tempRoot,
    workerDir: '',
    workerPort,
  }).persistTo
}

export function getWranglerRuntimePaths(options: WranglerRuntimePathOptions): WranglerRuntimePaths {
  const tempRoot = options.tempRoot || tmpdir()
  const root = options.isCi
    ? join(
        tempRoot,
        'voucha-wrangler',
        `worker-${options.workerPort}-attempt-${options.runAttempt}`,
      )
    : join(options.workerDir, '.wrangler', 'runtime')

  return {
    cache: join(root, 'cache'),
    cfFetchCache: join(root, 'cf-fetch'),
    home: join(root, 'home'),
    logs: join(root, 'logs'),
    miniflareCache: join(root, 'miniflare-cache'),
    persistTo: join(root, 'persist'),
    registry: join(root, 'registry'),
    root,
    tmp: join(root, 'tmp'),
    xdgCache: join(root, 'xdg-cache'),
    xdgConfig: join(root, 'xdg-config'),
    xdgState: join(root, 'xdg-state'),
  }
}

export function createWranglerRuntimeEnv(
  env: NodeJS.ProcessEnv,
  paths: WranglerRuntimePaths,
): NodeJS.ProcessEnv {
  return {
    ...env,
    APPDATA: paths.xdgConfig,
    CLOUDFLARE_CF_FETCH_PATH: paths.cfFetchCache,
    HOME: paths.home,
    LOCALAPPDATA: paths.xdgCache,
    MINIFLARE_CACHE_DIR: paths.miniflareCache,
    TMPDIR: paths.tmp,
    WRANGLER_CACHE_DIR: paths.cache,
    WRANGLER_LOG_PATH: paths.logs,
    WRANGLER_REGISTRY_PATH: paths.registry,
    WRANGLER_SEND_ERROR_REPORTS: env.WRANGLER_SEND_ERROR_REPORTS ?? 'false',
    WRANGLER_SEND_METRICS: env.WRANGLER_SEND_METRICS ?? 'false',
    XDG_CACHE_HOME: paths.xdgCache,
    XDG_CONFIG_HOME: paths.xdgConfig,
    XDG_STATE_HOME: paths.xdgState,
  }
}

export function ensureWranglerRuntimeDirs(paths: WranglerRuntimePaths): void {
  for (const dir of [
    paths.cache,
    paths.home,
    paths.logs,
    paths.miniflareCache,
    paths.persistTo,
    paths.registry,
    paths.tmp,
    paths.xdgCache,
    paths.xdgConfig,
    paths.xdgState,
  ]) {
    mkdirSync(dir, { recursive: true })
  }
}
