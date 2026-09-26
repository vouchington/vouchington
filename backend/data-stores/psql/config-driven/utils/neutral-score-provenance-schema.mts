export function neutralScoreProvenanceColumnSql(tracksNeutralScore: boolean | undefined): string {
  return tracksNeutralScore ? 'score_is_neutral BOOLEAN NOT NULL DEFAULT FALSE,' : ''
}

export function semanticScoreProvenanceColumnSql(tracksSemanticScore: boolean | undefined): string {
  return tracksSemanticScore ? 'score_is_semantic BOOLEAN NOT NULL DEFAULT FALSE,' : ''
}
