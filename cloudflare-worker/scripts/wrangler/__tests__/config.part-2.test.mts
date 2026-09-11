import { describe, expect, it } from 'vitest'

import {
  appendWranglerReadySearchText,
  buildWranglerArgs,
  createWranglerStderrConsoleFilterState,
  createWranglerEvent,
  filterWranglerStderrConsoleLines,
  isWranglerReadyText,
  stripAnsi,
} from '../config.mts'

import { getWranglerDevWorkerPort } from '../dev-config.mts'

import { getWranglerPersistToPath } from '../runtime.mts'

const baseOptions = {
  certPath: '/repo/dev/certs/localhost.pem',
  hasCerts: false,
  inspectorPort: '3904',
  isCi: true,
  keyPath: '/repo/dev/certs/localhost-key.pem',
  persistTo: getWranglerPersistToPath('3902', '2'),
  workerPort: '3902',
}

describe('start-wrangler config', () => {
  it('trims empty log-level overrides before falling back to defaults', () => {
    expect(buildWranglerArgs({ ...baseOptions, logLevelOverride: '   ' }).logLevel).toBe('error')
    expect(
      buildWranglerArgs({ ...baseOptions, isCi: false, logLevelOverride: '   ' }).logLevel,
    ).toBe('none')
  })

  it('uses explicit dev --port arguments for runtime path keys', () => {
    expect(getWranglerDevWorkerPort(['--local', '--port', '3905'], '8787')).toBe('3905')
    expect(getWranglerDevWorkerPort(['--port=3906'], '8787')).toBe('3906')
    expect(getWranglerDevWorkerPort(['--port', '3905', '--port=3906'], '8787')).toBe('3906')
  })

  it('falls back to WORKER_PORT/default for dev runtime path keys', () => {
    expect(getWranglerDevWorkerPort(['--local'], '3907')).toBe('3907')
    expect(getWranglerDevWorkerPort(['--local'], undefined)).toBe('8787')
    expect(getWranglerDevWorkerPort(['--port='], '3907')).toBe('3907')
  })

  it('detects wrangler ready output', () => {
    expect(isWranglerReadyText('Ready on http://localhost:3902')).toBe(true)
    expect(isWranglerReadyText('ready on https://localhost:3902')).toBe(true)
    expect(isWranglerReadyText('starting wrangler dev')).toBe(false)
  })

  it('detects ready output before trimming the retained search text', () => {
    const result = appendWranglerReadySearchText(
      '',
      `Ready on http://localhost:3902\n${'x'.repeat(5000)}`,
    )

    expect(result.isReady).toBe(true)
    expect(result.searchText).toHaveLength(4096)
    expect(result.searchText).not.toContain('Ready on')
  })

  it('formats diagnostic events with versions and timing details', () => {
    const event = createWranglerEvent(
      {
        attempt: 1,
        event: 'ready',
        hasCerts: false,
        inspectorPort: '3904',
        isCi: true,
        logLevel: 'error',
        persistTo: getWranglerPersistToPath('3902', '2'),
        timestamp: '2026-05-10T12:00:00.000Z',
        workerPort: '3902',
        workerdVersion: '1.20260507.1',
        wranglerVersion: '4.90.0',
      },
      { readyMs: 12_345 },
    )

    expect(event).toEqual({
      attempt: 1,
      event: 'ready',
      hasCerts: false,
      inspectorPort: '3904',
      isCi: true,
      logLevel: 'error',
      persistTo: getWranglerPersistToPath('3902', '2'),
      readyMs: 12_345,
      timestamp: '2026-05-10T12:00:00.000Z',
      workerPort: '3902',
      workerdVersion: '1.20260507.1',
      wranglerVersion: '4.90.0',
    })
  })

  it('filters ANSI-colored workerd broken pipe errors and their stack from console output', () => {
    const state = createWranglerStderrConsoleFilterState()
    const output = filterWranglerStderrConsoleLines(
      state,
      '\x1b[31mX \x1b[41;31m[\x1b[41;97mERROR\x1b[41;31m]\x1b[0m ' +
        '\x1b[1mkj::getCaughtExceptionAsKj() = kj/async-io-unix.c++:186: ' +
        'disconnected: ::write(fd, buffer.begin(), buffer.size()): Broken pipe\x1b[0m\n' +
        '  stack: /home/runner/node_modules/@cloudflare/workerd-linux-arm64/bin/workerd@508fb03\n' +
        '[ERROR] real wrangler error\n',
    )

    expect(output).toEqual(['[ERROR] real wrangler error'])
  })

  it('filters workerd broken pipe errors split across stderr chunks', () => {
    const state = createWranglerStderrConsoleFilterState()

    expect(
      filterWranglerStderrConsoleLines(
        state,
        'kj::getCaughtExceptionAsKj() = kj/async-io-unix.c++:186: disconnected: ::write',
      ),
    ).toEqual([])
    expect(
      filterWranglerStderrConsoleLines(
        state,
        '(fd, buffer.begin(), buffer.size()): Broken pipe\n' +
          '  stack: /home/runner/node_modules/@cloudflare/workerd-linux-arm64/bin/workerd@361bf03\n' +
          'next line\n',
      ),
    ).toEqual(['next line'])
  })

  it('does not suppress unrelated Wrangler errors or stack lines', () => {
    const state = createWranglerStderrConsoleFilterState()

    expect(
      filterWranglerStderrConsoleLines(
        state,
        '[ERROR] route pattern is invalid\n' +
          '  stack: /home/runner/node_modules/@cloudflare/workerd-linux-arm64/bin/workerd@361bf03\n',
      ),
    ).toEqual([
      '[ERROR] route pattern is invalid',
      '  stack: /home/runner/node_modules/@cloudflare/workerd-linux-arm64/bin/workerd@361bf03',
    ])
  })

  it('only suppresses a stack line immediately following a broken pipe error', () => {
    const state = createWranglerStderrConsoleFilterState()

    expect(
      filterWranglerStderrConsoleLines(
        state,
        'kj::getCaughtExceptionAsKj() = kj/async-io-unix.c++:186: ' +
          'disconnected: ::write(fd, buffer.begin(), buffer.size()): Broken pipe\n' +
          '[ERROR] different failure\n' +
          '  stack: /home/runner/node_modules/@cloudflare/workerd-linux-arm64/bin/workerd@361bf03\n',
      ),
    ).toEqual([
      '[ERROR] different failure',
      '  stack: /home/runner/node_modules/@cloudflare/workerd-linux-arm64/bin/workerd@361bf03',
    ])
  })

  it('resets pending workerd stack suppression when flushing buffered stderr', () => {
    const state = createWranglerStderrConsoleFilterState()

    expect(
      filterWranglerStderrConsoleLines(
        state,
        'kj::getCaughtExceptionAsKj() = kj/async-io-unix.c++:186: ' +
          'disconnected: ::write(fd, buffer.begin(), buffer.size()): Broken pipe',
        { flush: true },
      ),
    ).toEqual([])
    expect(
      filterWranglerStderrConsoleLines(
        state,
        '  stack: /home/runner/node_modules/@cloudflare/workerd-linux-arm64/bin/workerd@361bf03\n',
      ),
    ).toEqual([
      '  stack: /home/runner/node_modules/@cloudflare/workerd-linux-arm64/bin/workerd@361bf03',
    ])
  })

  it('strips ANSI escape sequences from Wrangler stderr lines', () => {
    expect(stripAnsi('\x1b[31mX \x1b[41;97mERROR\x1b[0m')).toBe('X ERROR')
  })

  it('filters lines that are empty after stripping ANSI escape sequences', () => {
    const state = createWranglerStderrConsoleFilterState()

    expect(filterWranglerStderrConsoleLines(state, '\x1b[0m\nvisible\n')).toEqual(['visible'])
  })
})
