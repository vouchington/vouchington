import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

function readPackage(manifest) {
  return JSON.parse(readFileSync(manifest, 'utf8'))
}

function requireFromConsumer(consumer) {
  const manifest = realpathSync(`/app/backend/node_modules/${consumer}/package.json`)
  return createRequire(manifest)
}

async function checkLingua() {
  const requireFromWorker = requireFromConsumer('@workers/language-detection')
  const serviceEntry = requireFromWorker.resolve('@services/language-detection/detector')
  const lingua = createRequire(serviceEntry).resolve('lingua-rs')

  await import(pathToFileURL(lingua).href)
  console.log('✓ lingua-rs imports with its native binding')
}

async function checkVurst({ consumer, requiredAssets, wrapper }) {
  const requireFromWorker = requireFromConsumer(consumer)
  const wrapperManifest = requireFromWorker.resolve(`${wrapper}/package.json`)
  const wrapperEntry = requireFromWorker.resolve(wrapper)
  const requireFromWrapper = createRequire(wrapperEntry)
  const wrapperPackage = readPackage(wrapperManifest)
  const expectedPlatform = `${wrapper}-linux-arm64-gnu`
  const platformPackages = Object.keys(wrapperPackage.optionalDependencies ?? {})

  if (!platformPackages.includes(expectedPlatform)) {
    throw new Error(`${wrapper} does not declare ${expectedPlatform}`)
  }

  const platformManifest = requireFromWrapper.resolve(`${expectedPlatform}/package.json`)
  const platformRoot = dirname(platformManifest)
  const platformPackage = readPackage(platformManifest)
  if (platformPackage.version !== wrapperPackage.version) {
    throw new Error(`${expectedPlatform} version does not match ${wrapper}`)
  }

  const missing = requiredAssets.filter(relative => !existsSync(join(platformRoot, relative)))
  if (missing.length) {
    throw new Error(`${expectedPlatform} assets are missing: ${missing.join(', ')}`)
  }

  const foreignPlatforms = platformPackages.filter(name => {
    if (name === expectedPlatform) return false
    try {
      requireFromWrapper.resolve(`${name}/package.json`)
      return true
    } catch {
      return false
    }
  })
  if (foreignPlatforms.length) {
    throw new Error(
      `unexpected ${wrapper} platform packages remain: ${foreignPlatforms.join(', ')}`,
    )
  }

  await import(pathToFileURL(wrapperEntry).href)
  console.log(`✓ ${wrapper} imports with matching ${expectedPlatform}`)
}

await checkLingua()
await checkVurst({
  consumer: '@workers/ai-agents',
  wrapper: '@jongleberry/vurst-ai',
  requiredAssets: ['vurst-ai.linux-arm64-gnu.node', 'onnxruntime/libonnxruntime.so'],
})
await checkVurst({
  consumer: '@workers/ai-agents',
  wrapper: '@jongleberry/vurst-markdown',
  requiredAssets: ['vurst-markdown.linux-arm64-gnu.node'],
})
await checkVurst({
  consumer: '@workers/crawl-browser',
  wrapper: '@jongleberry/vurst-html',
  requiredAssets: ['vurst-html.linux-arm64-gnu.node'],
})
