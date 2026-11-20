/** Limits apply to bytes before UTF-8 decoding, including a final unterminated line. */
export async function* boundedLines(
  source: AsyncIterable<Uint8Array>,
  maxLineBytes: number,
  maxBytes: number,
): AsyncGenerator<string> {
  let pending = Buffer.alloc(0)
  let bytes = 0
  for await (const chunk of source) {
    bytes += chunk.byteLength
    if (bytes > maxBytes) throw new Error('Embedding stream exceeded its byte limit')
    const buffer = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk)
    let start = 0
    for (let end = buffer.indexOf(10); end !== -1; end = buffer.indexOf(10, start)) {
      if (end - start > maxLineBytes)
        throw new Error('Embedding stream line exceeded its byte limit')
      yield buffer.subarray(start, end).toString('utf8').replace(/\r$/, '')
      start = end + 1
    }
    pending = Buffer.from(buffer.subarray(start))
    if (pending.byteLength > maxLineBytes)
      throw new Error('Embedding stream line exceeded its byte limit')
  }
  if (pending.length) yield pending.toString('utf8').replace(/\r$/, '')
}
