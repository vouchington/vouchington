import { accessSync, constants, readdirSync } from 'node:fs'

// Executed in the running image so it observes the serving process's extracted addons.
export function checkImageRuntime(libraryDirectory = '/app/backend/lib'): void {
  const root = process.env.TMPDIR
  if (process.getuid?.() !== 65532) throw new Error('not uid 65532')
  if (!root) throw new Error('TMPDIR must point at writable ephemeral storage')
  accessSync(root, constants.W_OK)
  const addons = readdirSync(root).filter(
    name => name.startsWith('.bun-65532-') && name.endsWith('.node'),
  )
  if (addons.length === 0) throw new Error(`no embedded native addon extracted to ${root}`)
  if (process.argv[2] === 'io') {
    const libraries = readdirSync(libraryDirectory).toSorted().join(' ')
    if (libraries !== 'libduckdb.so') {
      throw new Error(`IO image ships shared libraries beyond libduckdb.so: ${libraries}`)
    }
  } else if (process.argv[2] !== undefined) {
    throw new Error('image-smoke.mts accepts only the optional io check')
  }
  console.log(`✓ ${addons.length} native addons extracted to ${root} as uid 65532`)
}
