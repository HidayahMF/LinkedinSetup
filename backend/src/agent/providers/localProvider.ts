import { AIOutputError, type AIProvider, type AIGenerateInput } from './types.js'

/**
 * Deterministic local provider. Used by default so the whole pipeline runs with ZERO
 * external dependencies and zero hallucination risk: it never invents content — it only
 * echoes the deterministic analysis produced by the rule-based agent components.
 */
export class LocalDeterministicProvider implements AIProvider {
  readonly name = 'local-deterministic'

  async generate(_input: AIGenerateInput): Promise<string> {
    // The local provider does not synthesize free-form text; callers use the
    // deterministic agent components instead.
    return '[local] no free-form generation'
  }

  async generateStructured<T>(
    _input: AIGenerateInput,
    _schema: { parse: (data: unknown) => T },
  ): Promise<T> {
    throw new AIOutputError(
      'local provider cannot produce structured generations; use the deterministic agent components',
    )
  }
}
