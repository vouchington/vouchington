import { watch } from 'node:fs'
import { access } from 'node:fs/promises'
import { join } from 'node:path'

export function waitForFileMarker(dir: string, markerNames: string[]) {
  const watcher = watch(dir)
  let settled = false
  let resolveMarker!: (marker: string) => void
  let rejectMarker!: (error: Error) => void
  const promise = new Promise<string>((resolve, reject) => {
    resolveMarker = resolve
    rejectMarker = reject
  })
  const check = async () => {
    for (const marker of markerNames) {
      try {
        await access(join(dir, marker))
        if (!settled) {
          settled = true
          watcher.close()
          resolveMarker(marker)
        }
        return
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          if (!settled) {
            settled = true
            watcher.close()
            rejectMarker(err as Error)
          }
          return
        }
      }
    }
  }
  watcher.on('change', () => void check())
  watcher.on('error', err => {
    if (!settled) {
      settled = true
      rejectMarker(err)
    }
  })
  void check()
  return { promise, close: () => watcher.close() }
}
