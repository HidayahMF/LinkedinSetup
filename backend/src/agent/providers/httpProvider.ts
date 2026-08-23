import { env } from '../../config/env.js'
import { AIOutputError, type AIProvider, type AIGenerateInput } from './types.js'

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

/**
 * Generic OpenAI-compatible adapter using plain fetch — no vendor SDK dependency.
 * Enabled only when AI_PROVIDER=openai_compatible AND AI_API_KEY is configured.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name = 'openai_compatible'
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly model: string

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
    this.model = model
    void env
  }

  async generate(input: AIGenerateInput): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
        max_tokens: input.maxTokens ?? 1024,
        temperature: input.temperature ?? 0.2,
      }),
    })
    if (!res.ok) {
      throw new AIOutputError(`AI provider HTTP ${res.status}: ${await res.text()}`)
    }
    const data = (await res.json()) as ChatCompletionResponse
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new AIOutputError('AI provider returned an empty completion')
    return content
  }

  async generateStructured<T>(
    input: AIGenerateInput,
    schema: { parse: (data: unknown) => T },
  ): Promise<T> {
    const raw = await this.generate({
      ...input,
      systemPrompt: `${input.systemPrompt}\nRespond with ONLY a valid JSON object matching the requested schema. No prose.`,
    })
    let parsedUnknown: unknown
    try {
      parsedUnknown = JSON.parse(raw)
    } catch (err) {
      // flow.md §61 — malformed structured output must never be guessed around
      throw new AIOutputError(`AI output was not valid JSON: ${(err as Error).message}`)
    }
    try {
      return schema.parse(parsedUnknown)
    } catch (err) {
      throw new AIOutputError(`AI output failed schema validation: ${(err as Error).message}`)
    }
  }
}
