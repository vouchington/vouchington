import { describe, expect, it } from 'vitest'
import { streamCsvRows } from './stringify-csv.mts'

async function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  }
  return Buffer.concat(chunks).toString('utf8')
}

describe('streamCsvRows', () => {
  it('serializes rows with header', async () => {
    const rows = [
      {
        title: 'Feed 1',
        url: 'https://a.com/rss',
        feed_type: 'article',
        home_page_url: 'https://a.com',
        topic: 'Tech',
      },
    ]
    const csv = await collectStream(
      streamCsvRows(rows, ['title', 'url', 'feed_type', 'home_page_url', 'topic']),
    )
    expect(csv).toContain('title,url,feed_type,home_page_url,topic')
    expect(csv).toContain('Feed 1')
    expect(csv).toContain('https://a.com/rss')
  })

  it('handles null/undefined values as empty strings', async () => {
    const rows = [
      { title: 'No URL', url: null, feed_type: 'article', home_page_url: undefined, topic: 'Tech' },
    ]
    const csv = await collectStream(
      streamCsvRows(rows as Record<string, string | null | undefined>[], [
        'title',
        'url',
        'feed_type',
        'home_page_url',
        'topic',
      ]),
    )
    expect(csv).toBe('title,url,feed_type,home_page_url,topic\nNo URL,,article,,Tech\n')
  })

  it('handles empty rows array', async () => {
    const csv = await collectStream(streamCsvRows([], ['title', 'url']))
    expect(csv).toContain('title,url')
  })

  it('quotes values with commas', async () => {
    const rows = [{ title: 'A, B', url: 'https://a.com' }]
    const csv = await collectStream(streamCsvRows(rows, ['title', 'url']))
    expect(csv).toContain('"A, B"')
  })

  it('serializes only declared columns', async () => {
    const rows = [{ title: 'Feed A', url: 'https://a.com/rss', internal_note: 'not exported' }]

    await expect(collectStream(streamCsvRows(rows, ['title', 'url']))).resolves.toBe(
      'title,url\nFeed A,https://a.com/rss\n',
    )
  })

  it.each([
    ['= formula', '=SUM(A1:A10)', "'=SUM(A1:A10)"],
    ['+ prefix', '+123', "'+123"],
    ['- prefix', '-1', "'-1"],
    ['@ prefix', '@user', "'@user"],
    ['tab prefix', '\t=SUM(A1:A10)', "'\t=SUM(A1:A10)"],
    ['carriage-return prefix', '\r=SUM(A1:A10)', "'\r=SUM(A1:A10)"],
  ])('prefixes formula-injection cell with single quote: %s', async (_label, input, expected) => {
    const rows = [{ val: input }]
    const csv = await collectStream(streamCsvRows(rows, ['val']))
    expect(csv).toContain(expected)
  })

  it('does not alter regular values', async () => {
    const rows = [{ val: 'normal text' }]
    const csv = await collectStream(streamCsvRows(rows, ['val']))
    expect(csv).toContain('normal text')
    expect(csv).not.toContain("'")
  })
})
