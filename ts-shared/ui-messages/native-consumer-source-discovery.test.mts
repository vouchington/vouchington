import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { readNativeProductSources } from './native-consumer-source-discovery.mts'

const execFileAsync = promisify(execFile)

describe('native consumer source discovery', () => {
  it('reads tracked and nonignored untracked product sources while excluding build outputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-native-source-discovery-'))
    try {
      await execFileAsync('git', ['init', '--quiet'], { cwd: root })
      await writeFixture(root, '.gitignore', '**/obj/\n**/bin/\n**/.build/\n**/DerivedData/\n')
      await writeFixture(
        root,
        'swift-clients/ui/Sources/Feature/Tracked.swift',
        'let tracked = true\n',
      )
      await writeFixture(
        root,
        'dotnet-clients/src/Voucha.Client.Core/Feature/Untracked.cs',
        'var untracked = true;\n',
      )
      await writeFixture(
        root,
        'dotnet-clients/src/Voucha.Client.Core/obj/Ignored.cs',
        'var ignored = true;\n',
      )
      await writeFixture(
        root,
        'dotnet-clients/src/Voucha.Client.Core/bin/Ignored.cs',
        'var ignored = true;\n',
      )
      await writeFixture(
        root,
        'swift-clients/ui/Sources/.build/Ignored.swift',
        'let ignored = true\n',
      )
      await writeFixture(
        root,
        'swift-clients/apps/DerivedData/Ignored.swift',
        'let ignored = true\n',
      )
      await writeFixture(
        root,
        'swift-clients/ui/Sources/VouchaLocalization/Generated/UiMessageKey.swift',
        'let generated = true\n',
      )
      await execFileAsync(
        'git',
        ['add', '.gitignore', 'swift-clients/ui/Sources/Feature/Tracked.swift'],
        { cwd: root },
      )
      await writeFixture(
        root,
        'dotnet-clients/src/Voucha.Client.Core/Feature/Deleted.cs',
        'var deleted = true;\n',
      )
      await execFileAsync(
        'git',
        ['add', 'dotnet-clients/src/Voucha.Client.Core/Feature/Deleted.cs'],
        { cwd: root },
      )
      await unlink(join(root, 'dotnet-clients/src/Voucha.Client.Core/Feature/Deleted.cs'))

      const sources = await readNativeProductSources(root)

      expect(sources.map(source => source.path)).toEqual([
        'dotnet-clients/src/Voucha.Client.Core/Feature/Untracked.cs',
        'swift-clients/ui/Sources/Feature/Tracked.swift',
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

async function writeFixture(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}
