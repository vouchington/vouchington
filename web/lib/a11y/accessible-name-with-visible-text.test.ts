import { describe, expect, it } from 'vitest'
import { accessibleNameWithVisibleText } from './accessible-name-with-visible-text'

describe('accessibleNameWithVisibleText', () => {
  it('keeps a name that already contains the visible word', () => {
    expect(accessibleNameWithVisibleText('Vote', 'Choose a vote')).toBe('Choose a vote')
    expect(accessibleNameWithVisibleText('Confirm ban', 'Confirm ban evasion for Alex')).toBe(
      'Confirm ban evasion for Alex',
    )
  })

  it('prefixes visible text when a longer word only shares a substring', () => {
    expect(accessibleNameWithVisibleText('Warn', 'Issue warning to user from this report')).toBe(
      'Warn. Issue warning to user from this report',
    )
  })

  it('prefixes visible text when intervening words break the sequence', () => {
    expect(accessibleNameWithVisibleText('Dismiss flag', 'Dismiss ban-evasion flag for Alex')).toBe(
      'Dismiss flag. Dismiss ban-evasion flag for Alex',
    )
    expect(
      accessibleNameWithVisibleText('Re-run judgement', 'Re-run AI judgement for Post report'),
    ).toBe('Re-run judgement. Re-run AI judgement for Post report')
    expect(
      accessibleNameWithVisibleText('remove Outdated', 'View AI judgement details: remove'),
    ).toBe('remove Outdated. View AI judgement details: remove')
  })
})
