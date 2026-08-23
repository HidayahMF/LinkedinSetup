export interface AIGenerateInput {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
}

export interface AIToolCallInput extends AIGenerateInput {
  toolName: string
  toolSchemaHint?: string
}

/**
 * Provider-agnostic AI access (flow.md §75). The agent architecture depends only on this
 * interface — vendors can be swapped without touching orchestration logic.
 */
export interface AIProvider {
  readonly name: string
  generate(input: AIGenerateInput): Promise<string>
  /** Structured output MUST pass schema.parse before any caller uses it (flow.md §74/§76). */
  generateStructured<T>(input: AIGenerateInput, schema: { parse: (data: unknown) => T }): Promise<T>
}

export class AIOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AIOutputError'
  }
}
