export enum ContentRating {
  LIVRE = 'LIVRE',
  DEZ = '10+',
  DOZE = '12+',
  QUATORZE = '14+',
  DEZESSEIS = '16+',
  DEZOITO = '18+',
  EIGHTEEN_PLUS = '18+',
}

export enum AiTextDeclaration {
  HUMAN_ONLY = 'HUMAN_ONLY',
  HUMAN_WITH_AI = 'HUMAN_WITH_AI',
  PARTIAL_AI = 'PARTIAL_AI',
  FULL_AI = 'FULL_AI',
}

export enum AiCoverDeclaration {
  HUMAN_OR_PHOTO = 'HUMAN_OR_PHOTO',
  AI_GENERATED = 'AI_GENERATED',
  HYBRID = 'HYBRID',
  NONE = 'NONE',
}
