import { describe, expect, it } from 'vitest'
import { mergeExtractedEntries } from './catalog.mts'

const BASE_EN_TS = "const enMessages = {\n  nav: {\n    home: 'Home',\n  },\n}\n"

describe('mergeExtractedEntries — first run (no existing "extracted" namespace)', () => {
  it('appends a new extracted namespace before the closing brace', () => {
    const result = mergeExtractedEntries(BASE_EN_TS, [
      {
        fullKey: 'extracted.comments.commentTree.helloWorld_a1b2c3d4',
        normalizedText: 'Hello world',
      },
    ])
    expect(result.addedCount).toBe(1)
    expect(result.totalExtractedCount).toBe(1)
    expect(result.mergedText).toBe(
      "const enMessages = {\n  nav: {\n    home: 'Home',\n  },\n\n  extracted: {\n    'comments': {\n      'commentTree': {\n        'helloWorld_a1b2c3d4': 'Hello world',\n      },\n    },\n  },\n}\n",
    )
    // Untouched hand-authored namespaces stay exactly as written.
    expect(result.mergedText).toContain("nav: {\n    home: 'Home',\n  },")
  })
})

describe('mergeExtractedEntries — determinism across repeated runs (Stage B correctness gate)', () => {
  it('is byte-identical on a second run over its own output with the same entries (idempotent)', () => {
    const entries = [
      {
        fullKey: 'extracted.comments.commentTree.helloWorld_a1b2c3d4',
        normalizedText: 'Hello world',
      },
    ]
    const first = mergeExtractedEntries(BASE_EN_TS, entries)
    const second = mergeExtractedEntries(first.mergedText, entries)
    expect(second.mergedText).toBe(first.mergedText)
    expect(second.addedCount).toBe(0)
    expect(second.totalExtractedCount).toBe(1)
  })

  it('unions new entries into an already-populated extracted namespace and re-sorts keys at every level', () => {
    const firstRunText = mergeExtractedEntries(BASE_EN_TS, [
      {
        fullKey: 'extracted.comments.commentTree.helloWorld_a1b2c3d4',
        normalizedText: 'Hello world',
      },
    ]).mergedText

    // Deliberately out of alphabetical order, and split across two different namespaces, to
    // prove sorting is applied on serialization rather than depending on input/insertion order.
    const result = mergeExtractedEntries(firstRunText, [
      { fullKey: 'extracted.comments.commentTree.zebraText_z1z2z3z4', normalizedText: 'Zebra' },
      {
        fullKey: 'extracted.messages.recipientPicker.appleText_a1a2a3a4',
        normalizedText: 'Apple',
      },
    ])

    expect(result.addedCount).toBe(2)
    expect(result.totalExtractedCount).toBe(3)
    expect(result.mergedText).toBe(
      "const enMessages = {\n  nav: {\n    home: 'Home',\n  },\n\n  extracted: {\n    'comments': {\n      'commentTree': {\n        'helloWorld_a1b2c3d4': 'Hello world',\n        'zebraText_z1z2z3z4': 'Zebra',\n      },\n    },\n    'messages': {\n      'recipientPicker': {\n        'appleText_a1a2a3a4': 'Apple',\n      },\n    },\n  },\n}\n",
    )
  })

  it('re-running the exact same full entry set a third time still changes nothing further', () => {
    const entries = [
      {
        fullKey: 'extracted.comments.commentTree.helloWorld_a1b2c3d4',
        normalizedText: 'Hello world',
      },
      { fullKey: 'extracted.comments.commentTree.zebraText_z1z2z3z4', normalizedText: 'Zebra' },
    ]
    const run1 = mergeExtractedEntries(BASE_EN_TS, entries)
    const run2 = mergeExtractedEntries(run1.mergedText, entries)
    const run3 = mergeExtractedEntries(run2.mergedText, entries)
    expect(run3.mergedText).toBe(run2.mergedText)
    expect(run3.addedCount).toBe(0)
  })
})

describe('mergeExtractedEntries — embedded control characters', () => {
  it('escapes embedded newlines so re-serialized output stays a valid single-line string literal', () => {
    const result = mergeExtractedEntries(BASE_EN_TS, [
      {
        fullKey: 'extracted.crawlers.crawlerRemovalFields.subscribeAdvertisement_9d0d679f',
        normalizedText: 'Subscribe\nAdvertisement',
      },
    ])
    expect(result.mergedText).toContain(
      String.raw`'subscribeAdvertisement_9d0d679f': 'Subscribe\nAdvertisement',`,
    )
    expect(result.mergedText).not.toMatch(/Subscribe\nAdvertisement/)
  })

  it('round-trips a newline-containing entry unchanged across repeated merges (idempotent)', () => {
    const entries = [
      {
        fullKey: 'extracted.crawlers.crawlerRemovalFields.subscribeAdvertisement_9d0d679f',
        normalizedText: 'Subscribe\nAdvertisement',
      },
    ]
    const first = mergeExtractedEntries(BASE_EN_TS, entries)
    const second = mergeExtractedEntries(first.mergedText, entries)
    expect(second.mergedText).toBe(first.mergedText)
    expect(second.addedCount).toBe(0)
  })

  it('escapes embedded tabs and carriage returns', () => {
    const result = mergeExtractedEntries(BASE_EN_TS, [
      {
        fullKey: 'extracted.comments.commentTree.tabbed_a1b2c3d4',
        normalizedText: 'a\tb\rc',
      },
    ])
    expect(result.mergedText).toContain(String.raw`'tabbed_a1b2c3d4': 'a\tb\rc',`)
  })
})

describe('mergeExtractedEntries — key collisions', () => {
  it('throws when the same full key maps to two different source strings', () => {
    const firstRunText = mergeExtractedEntries(BASE_EN_TS, [
      {
        fullKey: 'extracted.comments.commentTree.helloWorld_a1b2c3d4',
        normalizedText: 'Hello world',
      },
    ]).mergedText

    expect(() =>
      mergeExtractedEntries(firstRunText, [
        {
          fullKey: 'extracted.comments.commentTree.helloWorld_a1b2c3d4',
          normalizedText: 'DIFFERENT TEXT',
        },
      ]),
    ).toThrow(/key collision for "extracted\.comments\.commentTree\.helloWorld_a1b2c3d4"/)
  })

  it('does not throw when the same key repeats with the identical text (true duplicate, not a collision)', () => {
    const firstRunText = mergeExtractedEntries(BASE_EN_TS, [
      {
        fullKey: 'extracted.comments.commentTree.helloWorld_a1b2c3d4',
        normalizedText: 'Hello world',
      },
    ]).mergedText

    expect(() =>
      mergeExtractedEntries(firstRunText, [
        {
          fullKey: 'extracted.comments.commentTree.helloWorld_a1b2c3d4',
          normalizedText: 'Hello world',
        },
      ]),
    ).not.toThrow()
  })
})
