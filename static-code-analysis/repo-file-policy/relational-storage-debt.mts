// Shrink-only prelaunch debt. The acceptance check rejects any key that is not already on
// origin/main. Remove a key only after that column no longer has the defect. Do not add keys.
//
// JSON documents are not debt. Structured documents, data points, and change history stay JSON.
// An entity id inside a document still needs its own foreign-key column; this inventory cannot
// see inside JSON. Nothing remains. Token, cursor, protocol, and audit snapshot ids are reviewed
// in the catalog instead; see the schema rules.
export const EXISTING_RELATIONAL_STORAGE_DEBT = {
  json: new Set<string>(),
  uuidArray: new Set<string>(),
  missingForeignKey: new Set<string>(),
  encodedReference: new Set<string>(),
}
