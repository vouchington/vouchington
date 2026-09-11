import { describe, expect, it, vi } from 'vitest'

const mockSpoolMediaBody = vi.hoisted(() =>
  vi.fn<typeof import('@vouchington/media').spoolMediaBody>(async () => {
    throw new Error('write failed')
  }),
)

vi.mock<typeof import('@vouchington/media')>(import('@vouchington/media'), async () => ({
  ...(await vi.importActual<typeof import('@vouchington/media')>('@vouchington/media')),
  spoolMediaBody: mockSpoolMediaBody,
}))

const { spoolImageToTempFile } = await import('./temp-file.mts')

describe('spoolImageToTempFile utility failure', () => {
  it('propagates a spooling failure from the shared utility', async () => {
    const chunks = (async function* () {
      yield Buffer.alloc(1024)
    })()

    await expect(
      spoolImageToTempFile(chunks, 1024, bytes => new Error(`too large: ${bytes}`)),
    ).rejects.toThrow('write failed')

    expect(mockSpoolMediaBody).toHaveBeenCalledWith(chunks, {
      maxBytes: 1024,
      prefix: 'voucha-image-resize-',
    })
  })
})
