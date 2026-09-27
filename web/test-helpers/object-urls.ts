import { vi } from 'vitest'

/** Browser boundary for jsdom Files, which Vitest's Node object URL shim cannot read. */
export function mockObjectUrls() {
  let next = 0
  const create = vi.fn<(file: Blob) => string>(() => `blob:preview-${++next}`)
  const revoke = vi.fn<(url: string) => void>()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    },
  )
  return { create, revoke }
}
