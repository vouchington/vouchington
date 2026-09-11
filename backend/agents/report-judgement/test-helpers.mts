import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'

export function makeReportJudgementModelResponse(json: object): unknown {
  return {
    id: `resp-${randomUUID()}`,
    output: [
      {
        type: 'message',
        status: 'completed',
        content: [{ type: 'output_text', text: JSON.stringify(json) }],
      },
    ],
  }
}

export function makeReportJudgementModelCaller(json: object) {
  return vi.fn<(input: string, entityId: string) => Promise<unknown>>(() =>
    Promise.resolve(makeReportJudgementModelResponse(json)),
  )
}
