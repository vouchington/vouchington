import type { Plugin } from 'vite'
import { describe, expect, it } from 'vitest'
import { createStorybookUseDirectiveLogFilter } from '../../.storybook/use-directive-log'

type BundleLog = { code?: string; message: string; id?: string }
type Seen = { level: string; log: BundleLog }

function runFilter(
  logs: Array<{ level: 'info' | 'debug' | 'warn' | 'error'; log: BundleLog }>,
  previous?: (level: string, log: BundleLog) => void,
) {
  const written: string[] = []
  const forwarded: Seen[] = []
  const { onLog, plugin } = createStorybookUseDirectiveLogFilter({
    previousOnLog: previous
      ? (level, log, defaultHandler) => {
          previous(level, log)
          defaultHandler(level, log)
        }
      : undefined,
    write: line => {
      written.push(line)
    },
  })
  for (const entry of logs) {
    onLog(entry.level, entry.log, (level, log) => {
      forwarded.push({ level, log })
    })
  }
  const closeBundle = plugin.closeBundle
  if (typeof closeBundle === 'function') void closeBundle.call({} as Plugin)
  return { written, forwarded }
}

describe('Storybook use-directive build log', () => {
  it('omits repeated use client and use server warnings and keeps one summary', () => {
    const { written, forwarded } = runFilter([
      {
        level: 'warn',
        log: {
          code: 'MODULE_LEVEL_DIRECTIVE',
          message: 'directive "use client" may not be preserved',
          id: 'components/shared/example.tsx',
        },
      },
      {
        level: 'warn',
        log: {
          code: 'MODULE_LEVEL_DIRECTIVE',
          message: "directive 'use server' may not be preserved",
          id: 'components/shared/server.tsx',
        },
      },
    ])

    expect(forwarded).toEqual([])
    expect(written).toEqual([
      'Vite MODULE_LEVEL_DIRECTIVE: Storybook does not preserve Next.js "use client" or "use server" directives. First module: components/shared/example.tsx. Further copies of this warning are omitted.',
      'Vite MODULE_LEVEL_DIRECTIVE: omitted 2 repeated use-directive warnings.',
    ])
  })

  it('forwards other warnings, errors, and a previously installed handler', () => {
    const previous: string[] = []
    const { written, forwarded } = runFilter(
      [
        {
          level: 'warn',
          log: {
            code: 'MODULE_LEVEL_DIRECTIVE',
            message: 'directive "use unknown" may not be preserved',
            id: 'other.tsx',
          },
        },
        {
          level: 'error',
          log: {
            code: 'MODULE_LEVEL_DIRECTIVE',
            message: 'directive "use client" failed the build',
            id: 'broken.tsx',
          },
        },
        {
          level: 'warn',
          log: { code: 'PLUGIN_TIMINGS', message: 'plugin timings', id: 'timings' },
        },
      ],
      (level, log) => {
        previous.push(`${level}:${log.code ?? ''}`)
      },
    )

    expect(previous).toEqual([
      'warn:MODULE_LEVEL_DIRECTIVE',
      'error:MODULE_LEVEL_DIRECTIVE',
      'warn:PLUGIN_TIMINGS',
    ])
    expect(forwarded.map(entry => `${entry.level}:${entry.log.id}`)).toEqual([
      'warn:other.tsx',
      'error:broken.tsx',
      'warn:timings',
    ])
    expect(written).toEqual([])
  })
})
