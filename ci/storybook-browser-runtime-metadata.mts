import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

interface PackageManifest {
  name?: string
  version?: string
}

interface PlaywrightBrowsersManifest {
  browsers?: Array<{ browserVersion?: string; name?: string; revision?: string }>
}

export interface StorybookBrowserRuntimeMetadata {
  architecture: string
  chromium: string
  node: string
  platform: NodeJS.Platform
  playwright: string
  storybookAddonVitest: string
  vitest: string
  vitestBrowserPlaywright: string
}

const require = createRequire(import.meta.url)

export function storybookBrowserRuntimeMetadata(): StorybookBrowserRuntimeMetadata {
  return {
    architecture: process.arch,
    chromium: chromiumVersion(),
    node: process.version,
    platform: process.platform,
    playwright: packageVersion('playwright'),
    storybookAddonVitest: packageVersion('@storybook/addon-vitest'),
    vitest: packageVersion('vitest'),
    vitestBrowserPlaywright: packageVersion('@vitest/browser-playwright'),
  }
}

function packageVersion(packageName: string): string {
  try {
    let directory = dirname(require.resolve(packageName))
    while (true) {
      const manifestPath = resolve(directory, 'package.json')
      if (existsSync(manifestPath)) {
        const manifest = readJson<PackageManifest>(manifestPath)
        if (manifest.name === packageName && manifest.version) return manifest.version
      }
      const parent = dirname(directory)
      if (parent === directory) return 'unknown'
      directory = parent
    }
  } catch {
    return 'unknown'
  }
}

function chromiumVersion(): string {
  try {
    const manifest = readJson<PlaywrightBrowsersManifest>(
      resolve(dirname(require.resolve('playwright-core')), 'browsers.json'),
    )
    const chromium = manifest.browsers?.find(browser => browser.name === 'chromium')
    return chromium?.browserVersion ?? chromium?.revision ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}
