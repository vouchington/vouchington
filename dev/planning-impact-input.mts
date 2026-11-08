export async function readPlanningImpactStdin(): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of process.stdin) {
    const value: unknown = chunk
    if (typeof value !== 'string' && !Buffer.isBuffer(value))
      throw new Error('planning impact session input must contain bytes or text')
    const buffer = typeof value === 'string' ? Buffer.from(value) : value
    bytes += buffer.length
    if (bytes > 4096) throw new Error('planning impact session input exceeds 4 KiB')
    chunks.push(buffer)
  }
  const input = Buffer.concat(chunks).toString('utf8').trim()
  if (!input) throw new Error('planning impact session input is required on stdin')
  try {
    return JSON.parse(input) as unknown
  } catch {
    throw new Error('planning impact session input must be valid JSON')
  }
}
