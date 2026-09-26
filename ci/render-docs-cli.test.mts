import { afterEach, describe, expect, it, vi } from 'vitest'

import { runRenderDocsCli } from './render-docs-cli.mts'

const USAGE = 'Usage: render-example-docs.mts <output-dir>'

describe('runRenderDocsCli', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints usage and returns 2 without rendering when no output directory is given', async () => {
    const error = vi.spyOn(console, 'error').mockReturnValue(undefined)
    const render = vi.fn<(outputDir: string) => Promise<void>>()

    await expect(runRenderDocsCli([], USAGE, render)).resolves.toBe(2)
    expect(error).toHaveBeenCalledWith(USAGE)
    expect(render).not.toHaveBeenCalled()
  })

  it('renders into the output directory and returns 0', async () => {
    const render = vi.fn<(outputDir: string) => Promise<void>>().mockResolvedValue(undefined)

    await expect(runRenderDocsCli(['out/docs', 'ignored'], USAGE, render)).resolves.toBe(0)
    expect(render).toHaveBeenCalledExactlyOnceWith('out/docs')
  })

  it.each([
    ['an Error', new Error('Cannot read catalog'), 'Cannot read catalog'],
    ['a non-Error value', 'disk full', 'disk full'],
  ])('prints %s thrown by the renderer and returns 1', async (_case, thrown, message) => {
    const error = vi.spyOn(console, 'error').mockReturnValue(undefined)

    await expect(runRenderDocsCli(['out'], USAGE, () => Promise.reject(thrown))).resolves.toBe(1)
    expect(error).toHaveBeenCalledExactlyOnceWith(message)
  })
})
