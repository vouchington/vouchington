import { expect } from 'vitest'
import { checkPostPublicationReaderInventory } from '../repo-file-policy/post-publication-reader-inventory.mts'
import {
  canonicalBuilder,
  inventoryPath,
  makeContext,
} from '../repo-file-policy/post-publication-reader-inventory.test-support.mts'

export type InventoryReaderCase = {
  classification: string
  direct?: string
  expected: string | null
}

export function runInventoryReaderCase(testCase: InventoryReaderCase) {
  const errors: string[] = []
  checkPostPublicationReaderInventory(
    makeContext(
      {
        version: 1,
        canonical_builder: canonicalBuilder,
        implemented: [{ path: 'backend/direct.mts', classification: testCase.classification }],
        pr2_baseline: [],
        classified_exceptions: [],
      },
      testCase.direct === undefined ? {} : { direct: testCase.direct },
    ),
    errors,
  )
  if (testCase.expected === null) {
    expect(errors).toEqual([])
    return
  }
  expect(errors).toContain(`${inventoryPath}: implemented backend/direct.mts ${testCase.expected}`)
}
