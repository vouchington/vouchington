import { readFile, stat } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('workflow shell scripts', () => {
  it('keeps the directly invoked Playwright OTel store script executable', async () => {
    const mainWebWorkflow = await readFile('.github/workflows/main-web.yml', 'utf8')

    expect(mainWebWorkflow).toContain('run: ./ci/store-playwright-otel.sh')
    const storeScriptMode =
      process.platform === 'win32' ? 0o111 : (await stat('ci/store-playwright-otel.sh')).mode
    expect(storeScriptMode & 0o111).not.toBe(0)
  })
})
