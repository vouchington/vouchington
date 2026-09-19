import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createAndSendCopyrightOutboundCorrespondence,
  createCopyrightCorrespondenceSchemaFixture,
  createCopyrightInboundCorrespondence,
  rejectCopyrightInboundCorrespondenceBodyMutation,
  rejectCopyrightSentCorrespondenceBodyMutation,
  type CopyrightCorrespondenceSchemaFixture,
} from '../../../test-helpers/data-stores/psql/copyright-correspondence-schema.mts'
import { onGracefulShutdown } from '../index.mts'

let fixture: CopyrightCorrespondenceSchemaFixture

describe('copyright correspondence schema', () => {
  beforeAll(async () => {
    fixture = await createCopyrightCorrespondenceSchemaFixture()
  })

  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('freezes inbound correspondence body on receipt', async () => {
    const id = await createCopyrightInboundCorrespondence(fixture)
    await expect(rejectCopyrightInboundCorrespondenceBodyMutation(id)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('freezes outbound correspondence body after it is sent', async () => {
    const id = await createAndSendCopyrightOutboundCorrespondence(fixture)
    await expect(rejectCopyrightSentCorrespondenceBodyMutation(id)).rejects.toMatchObject({
      code: '23514',
    })
  })
})
