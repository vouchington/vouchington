import { vi } from 'vitest'

/**
 * Captures every stdout, stderr, and console write until the test's mocks are restored. Returns
 * a reader for everything written so far, so a test can prove private text never reached a log.
 */
export function captureTestLogOutput(): () => string {
  const chunks: string[] = []
  const record = (chunk: unknown) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString())
    return true
  }
  vi.spyOn(process.stdout, 'write').mockImplementation(record)
  vi.spyOn(process.stderr, 'write').mockImplementation(record)
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      chunks.push(args.map(String).join(' '))
    })
  }
  return () => chunks.join('\n')
}
