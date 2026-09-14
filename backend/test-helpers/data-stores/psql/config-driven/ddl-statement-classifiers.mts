export function isAlwaysForbiddenDrop(statement: string): boolean {
  return /\bDROP\s+(?:DATABASE|EXTENSION|FUNCTION|PROCEDURE|SCHEMA|TABLE|TRIGGER|TYPE|SEQUENCE|(?:MATERIALIZED\s+)?VIEW)\b/is.test(
    statement,
  )
}

export function isMixedAlterTableStatement(statement: string): boolean {
  if (!/\bADD\s+(?:COLUMN\s+)?IF\s+NOT\s+EXISTS\b/is.test(statement)) return false
  return (
    /\b(?:DROP|RENAME|OWNER|ALTER\s+COLUMN)\b/is.test(statement) ||
    /\bADD\s+(?!COLUMN\s+IF\s+NOT\s+EXISTS\b|IF\s+NOT\s+EXISTS\b)/is.test(statement)
  )
}

export function isRepairAlterTable(statement: string): boolean {
  return /\bALTER\s+TABLE\b[\s\S]*(?:\bDROP\s+(?:COLUMN|CONSTRAINT)\b|\bALTER\s+COLUMN\b|\bVALIDATE\s+CONSTRAINT\b)/is.test(
    statement,
  )
}

export function isDestructiveAlterTable(statement: string): boolean {
  return /\bALTER\s+TABLE\b[\s\S]*\bDROP\s+(?:COLUMN|CONSTRAINT)\b/is.test(statement)
}

export function hasStructuralDdl(statement: string): boolean {
  return /\bALTER\b|\bCREATE\b/is.test(statement) && !isSafeCreateStatement(statement)
}

export function isSelectIntoTableCreation(statement: string): boolean {
  return /^\s*(?:WITH\b[\s\S]*?\)\s*)?SELECT\b[\s\S]*\bINTO\b/is.test(statement)
}

export function isUnclassifiedCreateDdl(statement: string): boolean {
  return /\bCREATE\b/is.test(statement) && !isClassifiedCreateStatement(statement)
}

function isClassifiedCreateStatement(statement: string): boolean {
  return /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b|\bCREATE\s+TABLE\b|\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\b|\bCREATE\s+TYPE\b|\bCREATE\s+SEQUENCE\b|\bCREATE\s+TRIGGER\b|\bCREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\b|\bCREATE\s+OR\s+REPLACE\s+(?:FUNCTION|PROCEDURE)\b/is.test(
    statement,
  )
}

function isSafeCreateStatement(statement: string): boolean {
  return /\bCREATE\s+OR\s+REPLACE\s+(?:FUNCTION|PROCEDURE)\b/is.test(statement)
}
