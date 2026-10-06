import type { Plugin } from 'vite'

type StorybookBundleLogLevel = 'info' | 'debug' | 'warn' | 'error'

type StorybookBundleLog = {
  code?: string
  message: string
  id?: string
}

type StorybookBundleLogHandler = (
  level: StorybookBundleLogLevel,
  log: StorybookBundleLog,
  defaultHandler: (level: StorybookBundleLogLevel, log: StorybookBundleLog) => void,
) => void

function isRepeatedUseDirectiveWarning(level: string, log: StorybookBundleLog): boolean {
  if (level !== 'warn' || log.code !== 'MODULE_LEVEL_DIRECTIVE') return false
  return log.message.includes('use client') || log.message.includes('use server')
}

/**
 * Storybook's Vite build warns once per Next.js module that `"use client"` or
 * `"use server"` will not survive bundling. Those directives are intentional
 * and the warning text does not change, so the build log keeps the first module
 * and a final count instead of a full copy for every file.
 */
export function createStorybookUseDirectiveLogFilter(options?: {
  previousOnLog?: StorybookBundleLogHandler
  write?: (line: string) => void
}): { onLog: StorybookBundleLogHandler; plugin: Plugin } {
  const write =
    options?.write ??
    ((line: string) => {
      console.warn(line)
    })
  let suppressed = 0
  let announced = false
  let reported = false
  const flush = () => {
    if (reported || suppressed === 0) return
    reported = true
    const noun = suppressed === 1 ? 'warning' : 'warnings'
    write(`Vite MODULE_LEVEL_DIRECTIVE: omitted ${suppressed} repeated use-directive ${noun}.`)
  }
  const onLog: StorybookBundleLogHandler = (level, log, defaultHandler) => {
    if (isRepeatedUseDirectiveWarning(level, log)) {
      suppressed += 1
      if (!announced) {
        announced = true
        const firstModule = log.id ?? log.message.split('\n')[0]
        write(
          `Vite MODULE_LEVEL_DIRECTIVE: Storybook does not preserve Next.js "use client" or "use server" directives. First module: ${firstModule}. Further copies of this warning are omitted.`,
        )
      }
      return
    }
    if (options?.previousOnLog) options.previousOnLog(level, log, defaultHandler)
    else defaultHandler(level, log)
  }
  // Rolldown flushes these warnings after buildEnd, so closeBundle can still be
  // too early. beforeExit covers a drain of the event loop. exit also covers
  // process.exit(), which does not emit beforeExit, including a failed build.
  process.once('beforeExit', flush)
  process.on('exit', flush)
  const plugin: Plugin = {
    name: 'storybook-use-directive-log-summary',
    closeBundle() {
      flush()
    },
  }
  return { onLog, plugin }
}
