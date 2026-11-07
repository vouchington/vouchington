/** Code-keyed copy for household admission refusals. The API contract is the code. */
export function householdLimitDisplayMessages(): Readonly<Record<string, string>> {
  return {
    HOUSEHOLD_LIMIT_REACHED: "You can't create another household.",
    HOUSEHOLD_MEMBER_LIMIT_REACHED: "This household can't take another member.",
    INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED: "This person can't join another household.",
  }
}
