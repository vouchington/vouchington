import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const nativeAddonConsumers: (readonly [string, string, string?])[] = [
  ['lingua-rs', 'backend/services/language-detection/package.json'],
  ['@jongleberry/vurst-ai', 'backend/workers/ai-agents/package.json'],
  [
    '@jongleberry/vurst-html',
    'backend/services/crawler-html/package.json',
    '@vouchington/crawler-html',
  ],
  ['@jongleberry/vurst-markdown', 'backend/modules/markdown-extraction/package.json'],
]

type FailedNativeAddon = {
  cause: string
  packageName: string
}

function errorCause(error: unknown): string {
  return error instanceof Error ? error.message.replaceAll('\n', ' ') : String(error)
}

async function checkNativeAddon(
  packageName: string,
  consumerPackagePath: string,
  throughPackage?: string,
): Promise<string | null> {
  let requireFromConsumer = createRequire(resolve(process.cwd(), consumerPackagePath))
  let resolvedPackagePath: string

  try {
    if (throughPackage) {
      requireFromConsumer = createRequire(requireFromConsumer.resolve(throughPackage))
    }
    resolvedPackagePath = requireFromConsumer.resolve(packageName)
  } catch (error) {
    return errorCause(error)
  }

  try {
    await import(pathToFileURL(resolvedPackagePath).href)
    return null
  } catch (error) {
    return errorCause(error)
  }
}

async function main(): Promise<void> {
  const failedAddons = await nativeAddonConsumers.reduce<Promise<FailedNativeAddon[]>>(
    async (pendingFailures, [packageName, consumerPackagePath, throughPackage]) => {
      const failures = await pendingFailures
      const cause = await checkNativeAddon(packageName, consumerPackagePath, throughPackage)
      return cause === null ? failures : [...failures, { cause, packageName }]
    },
    Promise.resolve([]),
  )

  if (failedAddons.length === 0) {
    console.log('✓ Native addons are ready')
    return
  }

  console.error('Native addon readiness check failed:')
  for (const { cause, packageName } of failedAddons) {
    console.error(`- ${packageName}: ${cause}`)
  }
  console.error('')
  console.error('Repair with: pnpm install --frozen-lockfile --force')
  console.error('Rerun the same ./dev/initialize command after reinstalling dependencies.')
  process.exitCode = 1
}

await main()
