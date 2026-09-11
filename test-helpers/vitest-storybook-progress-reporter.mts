import type { Reporter, TestModule } from 'vitest/node'

export const STORYBOOK_PROGRESS_MARKER_PREFIX = '[storybook-browser-progress]'
const MAX_MARKER_BYTES = 512
const MAX_MODULE_ID_CHARS = 400

export type StorybookProgressEvent = 'module-collected' | 'module-start' | 'module-end'

type WriteProgress = (chunk: string) => void

class VitestStorybookProgressReporter implements Reporter {
  private sequence = 0
  private readonly write: WriteProgress

  constructor(write: WriteProgress) {
    this.write = write
  }

  onTestRunStart(): void {
    this.sequence = 0
  }

  onTestModuleCollected(testModule: TestModule): void {
    this.emit('module-collected', testModule)
  }

  onTestModuleStart(testModule: TestModule): void {
    this.emit('module-start', testModule)
  }

  onTestModuleEnd(testModule: TestModule): void {
    this.emit('module-end', testModule)
  }

  private emit(event: StorybookProgressEvent, testModule: TestModule): void {
    this.sequence += 1
    this.write(
      formatStorybookProgressMarker(
        this.sequence,
        event,
        testModule.relativeModuleId || testModule.moduleId,
      ),
    )
  }
}

export function createVitestStorybookProgressReporter(
  write: WriteProgress = chunk => process.stdout.write(chunk),
): VitestStorybookProgressReporter {
  return new VitestStorybookProgressReporter(write)
}

export function formatStorybookProgressMarker(
  sequence: number,
  event: StorybookProgressEvent,
  moduleId: string,
): string {
  let boundedModuleId = moduleId.slice(0, MAX_MODULE_ID_CHARS)
  while (boundedModuleId.length > 0) {
    const suffix = boundedModuleId.length < moduleId.length ? '…' : ''
    const marker = `${STORYBOOK_PROGRESS_MARKER_PREFIX} seq=${sequence} event=${event} module=${JSON.stringify(`${boundedModuleId}${suffix}`)}\n`
    if (Buffer.byteLength(marker) <= MAX_MARKER_BYTES) return marker
    boundedModuleId = boundedModuleId.slice(0, -16)
  }
  return `${STORYBOOK_PROGRESS_MARKER_PREFIX} seq=${sequence} event=${event} module=""\n`
}

export function latestStorybookProgressSequence(text: string): number | null {
  const pattern = /\[storybook-browser-progress\] seq=(\d+) event=module-(?:collected|start|end)\b/g
  let latest: number | null = null
  for (const match of text.matchAll(pattern)) {
    const sequence = Number(match[1])
    if (Number.isSafeInteger(sequence)) latest = Math.max(latest ?? 0, sequence)
  }
  return latest
}
