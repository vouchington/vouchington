import { describe, expect, it, vi } from 'vitest'

const { mockReadFile, mockStat } = vi.hoisted(() => ({
  mockReadFile: vi.fn<(path: string) => Promise<Buffer>>(),
  mockStat: vi.fn<(path: string) => Promise<{ size: number }>>(),
}))

vi.mock<typeof import('node:fs/promises')>(import('node:fs/promises'), async () => ({
  ...(await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')),
  readFile: mockReadFile as unknown as typeof import('node:fs/promises').readFile,
  stat: mockStat as unknown as typeof import('node:fs/promises').stat,
}))

const { buildFileResponse, MAX_API_GATEWAY_IMAGE_BYTES } = await import('./builder.mts')

describe('buildFileResponse size preflight', () => {
  it('rejects oversized files without reading them', async () => {
    mockStat.mockResolvedValue({ size: MAX_API_GATEWAY_IMAGE_BYTES + 1 })

    await expect(
      buildFileResponse(200, { path: '/oversized', cleanup: async () => undefined }, 'jpeg'),
    ).resolves.toMatchObject({
      statusCode: 413,
      body: JSON.stringify({ error: 'Rendered image exceeds maximum response size' }),
    })
    expect(mockReadFile).not.toHaveBeenCalled()
  })
})
