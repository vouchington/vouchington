import { describe, expect, it } from 'vitest'

import {
  callsRequireAdmin,
  rejectsNonReferralProgramTopics,
  rendersPageWithAside,
} from '../route-admin-surface-facts.mts'
import { collectRouteAdminSurfaceFacts } from '../route-admin-surface-query.mts'

// Frozen inputs and verdicts from the legacy TypeScript predicate matrices.
const lexicalCases = [
  { id: 'call-01', kind: 'call', source: 'requireAdmin()', expected: true },
  { id: 'call-02', kind: 'call', source: 'Auth.requireAdmin((foo))', expected: true },
  { id: 'call-03', kind: 'call', source: '((Auth.requireAdmin))?.()', expected: true },
  { id: 'call-04', kind: 'call', source: 'require\\u0041dmin()', expected: true },
  { id: 'call-05', kind: 'call', source: 'requireAdmin`template`', expected: false },
  { id: 'call-06', kind: 'call', source: "obj['requireAdmin']()", expected: false },
  { id: 'call-07', kind: 'call', source: '((requireAdmin))()', expected: true },
  { id: 'call-08', kind: 'call', source: 'obj.requireAdmin()', expected: true },
  { id: 'aside-01', kind: 'aside', source: '<PageWithAside />', expected: true },
  { id: 'aside-02', kind: 'aside', source: '<Layout.PageWithAside />', expected: true },
  { id: 'aside-03', kind: 'aside', source: '<Layout:PageWithAside />', expected: false },
  { id: 'aside-04', kind: 'aside', source: "<Layout['PageWithAside'] />", expected: false },
  { id: 'aside-05', kind: 'aside', source: '<PageWithAside></PageWithAside>', expected: true },
  { id: 'aside-06', kind: 'aside', source: '<Other.PageWithAside />', expected: true },
  { id: 'aside-07', kind: 'aside', source: '<PageWithAside.Other />', expected: false },
  {
    id: 'topic-01',
    kind: 'topic',
    source: "row.topic_type !== 'referral_program'",
    expected: true,
  },
  {
    id: 'topic-02',
    kind: 'topic',
    source: 'row.topic_type !== "referral_program"',
    expected: true,
  },
  {
    id: 'topic-03',
    kind: 'topic',
    source: "'referral_program' !== (row.topic_type as string)",
    expected: true,
  },
  {
    id: 'topic-04',
    kind: 'topic',
    source: "(row.topic_type satisfies string) !== ('referral\\u005fprogram')",
    expected: true,
  },
  {
    id: 'topic-05',
    kind: 'topic',
    source: "row['topic_type'] !== 'referral_program'",
    expected: false,
  },
  {
    id: 'topic-06',
    kind: 'topic',
    source: "row.topic_type != 'referral_program'",
    expected: false,
  },
  {
    id: 'topic-07',
    kind: 'topic',
    source: "row.topic_type === 'referral_program'",
    expected: false,
  },
  {
    id: 'topic-08',
    kind: 'topic',
    source: 'row.topic_type !== `referral_program`',
    expected: false,
  },
  {
    id: 'topic-09',
    kind: 'topic',
    source: "row.topic_type !== ('referral_program' as const)",
    expected: true,
  },
  {
    id: 'topic-10',
    kind: 'topic',
    source: "row.topic_type !== 'referral\\u{5f}program'",
    expected: true,
  },
  {
    id: 'topic-11',
    kind: 'topic',
    source: "row.topic_type !== 'referral\\x5fprogram'",
    expected: true,
  },
  {
    id: 'topic-12',
    kind: 'topic',
    source: "row.topic_type !== 'referral_\\\nprogram'",
    expected: true,
  },
  {
    id: 'topic-13',
    kind: 'topic',
    source: "row.topic_type !== 'referral_\\\n\\\r\nprogram'",
    expected: true,
  },
  {
    id: 'topic-14',
    kind: 'topic',
    source: "row.topic_type !== ('referral_program' satisfies string)",
    expected: true,
  },
  {
    id: 'topic-15',
    kind: 'topic',
    source: "row.topic_type !== 'referralxprogram'",
    expected: false,
  },
  {
    id: 'topic-16',
    kind: 'topic',
    source: "row.topic_type !== '\\x72eferral_program'",
    expected: true,
  },
  {
    id: 'topic-17',
    kind: 'topic',
    source: "row.topic_type !== '\\u{72}eferral_program'",
    expected: true,
  },
  {
    id: 'topic-18',
    kind: 'topic',
    source: "row.topic_type !== '\\162eferral_program'",
    expected: true,
  },
  {
    id: 'topic-19',
    kind: 'topic',
    source: "row.topic_type !== 'referral\\x5Fprogram'",
    expected: true,
  },
  {
    id: 'topic-20',
    kind: 'topic',
    source: "row.topic_type !== 'referral\\u005Fprogram'",
    expected: true,
  },
  {
    id: 'topic-21',
    kind: 'topic',
    source: "row.topic_type !== 'referral\\u{0005F}program'",
    expected: true,
  },
  {
    id: 'topic-22',
    kind: 'topic',
    source: "row.topic_type !== 'referral\\137program'",
    expected: true,
  },
  {
    id: 'topic-23',
    kind: 'topic',
    source: "row.topic_type !== 'referral\\_program'",
    expected: true,
  },
  {
    id: 'topic-24',
    kind: 'topic',
    source: 'row.topic_type !== "referral\\\\x5fprogram"',
    expected: false,
  },
  {
    id: 'topic-25',
    kind: 'topic',
    source: "row.topic_type !== 'referral\\\\\\n_program'",
    expected: false,
  },
  {
    id: 'topic-26',
    kind: 'topic',
    source: "row.topic_type !== 'referral\\x2fprogram'",
    expected: false,
  },
  {
    id: 'topic-27',
    kind: 'topic',
    source: "row.topic_type !== 'referral\\x00program'",
    expected: false,
  },
  {
    id: 'topic-28',
    kind: 'topic',
    source: 'row.topic_type !== "referral\'program"',
    expected: false,
  },
  {
    id: 'topic-29',
    kind: 'topic',
    source: "row.topic_type !== 'referral\"program'",
    expected: false,
  },
  {
    id: 'topic-30',
    kind: 'topic',
    source: "row.topic_ty\\u0070e !== 'referral_program'",
    expected: true,
  },
  {
    id: 'topic-31',
    kind: 'topic',
    source: "row.topic_ty\\u{70}e !== 'referral_program'",
    expected: true,
  },
  {
    id: 'topic-32',
    kind: 'topic',
    source: "row.topic_type !== 'referral_\\\r\nprogram'",
    expected: true,
  },
  {
    id: 'topic-33',
    kind: 'topic',
    source: "row.topic_type !== 'referral_\\\rprogram'",
    expected: true,
  },
  {
    id: 'topic-34',
    kind: 'topic',
    source: "row.topic_type !== 'referral_\\\nprogram'",
    expected: true,
  },
  {
    id: 'topic-35',
    kind: 'topic',
    source: "row.topic_type !== 'referral_\\\n\\\r\nprogram'",
    expected: true,
  },
  {
    id: 'topic-36',
    kind: 'topic',
    source: String.raw`row.topic_type !== 'referral_\ program'`,
    expected: true,
  },
  {
    id: 'topic-37',
    kind: 'topic',
    source: String.raw`row.topic_type !== 'referral_\ program'`,
    expected: true,
  },
  {
    id: 'topic-38',
    kind: 'topic',
    source: "row.topic_type !== '\\\nreferral_program\\\n'",
    expected: true,
  },
] as const

describe('route-admin-surface lexical AST-grep parity', () => {
  it.each(lexicalCases)('$id preserves lexical matching', ({ kind, source, expected }) => {
    const facts = collectRouteAdminSurfaceFacts(source, 'synthetic-route.tsx')
    const actual =
      kind === 'call'
        ? callsRequireAdmin(facts)
        : kind === 'aside'
          ? rendersPageWithAside(facts)
          : rejectsNonReferralProgramTopics(facts)
    expect(actual).toBe(expected)
  })
})
