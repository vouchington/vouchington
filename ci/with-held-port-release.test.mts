import { afterEach, describe, expect, it } from 'vitest'
import {
  createReporter,
  definedEnv,
  withHeldPortRelease,
} from '../playwright/config/web-server-command.mts'

describe('withHeldPortRelease', () => {
  const original = process.env.PORT_HOLD_DIR

  afterEach(() => {
    if (original === undefined) delete process.env.PORT_HOLD_DIR
    else process.env.PORT_HOLD_DIR = original
  })

  it('returns the original command when PORT_HOLD_DIR is unset', () => {
    delete process.env.PORT_HOLD_DIR
    expect(withHeldPortRelease('2218', 'node server.js')).toBe('node server.js')
  })

  it('prefixes an absolute allocator release when PORT_HOLD_DIR is set', () => {
    process.env.PORT_HOLD_DIR = '/tmp/voucha-port-hold-test'
    const command = withHeldPortRelease('2218', 'node server.js')
    expect(command).toContain('allocate-browser-safe-ports.py')
    expect(command.startsWith('python3 ')).toBe(true)
    expect(command).toContain('--release')
    expect(command).toContain('2218')
    expect(command).toContain('/tmp/voucha-port-hold-test')
    expect(command.endsWith(' && node server.js')).toBe(true)
    expect(command).toContain('/ci/allocate-browser-safe-ports.py')
  })

  it('drops undefined environment entries', () => {
    expect(definedEnv({ PORT: '2218', EMPTY: undefined })).toEqual({ PORT: '2218' })
  })

  it('selects the CI or local Playwright reporter', () => {
    expect(createReporter('out.xml', true)).toEqual([
      ['github'],
      ['junit', { outputFile: process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE || 'out.xml' }],
    ])
    expect(createReporter('out.xml', false)).toEqual([['html', { open: 'never' }]])
  })
})
