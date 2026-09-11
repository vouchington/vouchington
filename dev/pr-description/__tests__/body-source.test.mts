import { describe, expect, it } from 'vitest'

import { resolveBody } from '../body-source.mts'

const SAMPLE_BODY = '## Summary\n\nTest body.\n'

function makeRunGh(body: string): (args: string[]) => Promise<string> {
  return () => Promise.resolve(JSON.stringify({ body }))
}

function makeReadFile(body: string): (path: string) => Promise<string> {
  return () => Promise.resolve(body)
}

describe('resolveBody', () => {
  describe('body-file source', () => {
    it('resolves from --body-file when provided', async () => {
      const result = await resolveBody({
        bodyFile: '/tmp/body.md',
        readFile: makeReadFile(SAMPLE_BODY),
      })
      expect(result.source).toBe('body-file')
      expect(result.body).toBe(SAMPLE_BODY)
    })

    it('calls readFile with the given path', async () => {
      let capturedPath: string | undefined
      await resolveBody({
        bodyFile: '/some/path.md',
        readFile: path => {
          capturedPath = path
          return Promise.resolve(SAMPLE_BODY)
        },
      })
      expect(capturedPath).toBe('/some/path.md')
    })

    it('prefers body-file over stdin even when stdin is not a TTY', async () => {
      const result = await resolveBody({
        bodyFile: '/tmp/body.md',
        isStdinPiped: true,
        readFile: makeReadFile(SAMPLE_BODY),
        readStdin: () => Promise.resolve('stdin body'),
      })
      expect(result.source).toBe('body-file')
    })

    it('prefers body-file over pr', async () => {
      const result = await resolveBody({
        bodyFile: '/tmp/body.md',
        pr: '42',

        readFile: makeReadFile(SAMPLE_BODY),
        runGh: makeRunGh('pr body'),
      })
      expect(result.source).toBe('body-file')
      expect(result.body).toBe(SAMPLE_BODY)
    })
  })

  describe('body-file - as stdin', () => {
    it('treats --body-file - as stdin (mirrors gh convention)', async () => {
      const result = await resolveBody({
        bodyFile: '-',
        readStdin: () => Promise.resolve(SAMPLE_BODY),
      })
      expect(result.source).toBe('stdin')
      expect(result.body).toBe(SAMPLE_BODY)
    })
  })

  describe('stdin source', () => {
    it('resolves from stdin when not a TTY and no body-file', async () => {
      const result = await resolveBody({
        isStdinPiped: true,
        readStdin: () => Promise.resolve(SAMPLE_BODY),
      })
      expect(result.source).toBe('stdin')
      expect(result.body).toBe(SAMPLE_BODY)
    })

    it('prefers stdin over pr when not a TTY', async () => {
      const result = await resolveBody({
        pr: '42',
        isStdinPiped: true,
        readStdin: () => Promise.resolve(SAMPLE_BODY),
        runGh: makeRunGh('pr body'),
      })
      expect(result.source).toBe('stdin')
    })
  })

  describe('pr source', () => {
    it('resolves from gh pr view when no body-file and stdin is not piped', async () => {
      const result = await resolveBody({
        pr: '42',
        isStdinPiped: false,
        runGh: makeRunGh(SAMPLE_BODY),
      })
      expect(result.source).toBe('pr')
      expect(result.body).toBe(SAMPLE_BODY)
    })

    it('treats a null body (empty PR) as an empty string', async () => {
      const result = await resolveBody({
        pr: '42',
        isStdinPiped: false,
        runGh: () => Promise.resolve(JSON.stringify({ body: null })),
      })
      expect(result.source).toBe('pr')
      expect(result.body).toBe('')
    })

    it('passes correct args to runGh', async () => {
      let capturedArgs: string[] | undefined
      await resolveBody({
        pr: '99',
        isStdinPiped: false,
        runGh: args => {
          capturedArgs = args
          return Promise.resolve(JSON.stringify({ body: SAMPLE_BODY }))
        },
      })
      expect(capturedArgs).toEqual(['pr', 'view', '99', '--json', 'body'])
    })
  })

  describe('no source', () => {
    it('throws when no body-file, stdin is not piped, and no pr number', async () => {
      await expect(resolveBody({ isStdinPiped: false })).rejects.toThrow('No body source')
    })
  })
})
