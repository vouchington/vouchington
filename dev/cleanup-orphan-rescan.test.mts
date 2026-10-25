import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('worktree resource cleanup', () => {
  const cleanupPath = fileURLToPath(new URL('./cleanup', import.meta.url))

  it('deletes only confirmed names that remain orphaned after the locked rescan', async () => {
    const cleanup = await readFile(cleanupPath, 'utf8')
    expect(cleanup).toContain('CONFIRMED_DBS=("${ORPHANED_DBS[@]}")')
    expect(cleanup).toContain('resource_name_is_still_orphaned "$db" "${ORPHANED_DBS[@]}"')
    expect(cleanup).toContain('CONFIRMED_CONTAINERS=("${ORPHANED_CONTAINERS[@]}")')
    expect(cleanup).toContain(
      'resource_name_is_still_orphaned "$container" "${ORPHANED_CONTAINERS[@]}"',
    )
  })
})
