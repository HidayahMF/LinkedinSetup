import { env } from '../../config/env.js'
import type { AIProvider } from './types.js'
import { LocalDeterministicProvider } from './localProvider.js'
import { OpenAICompatibleProvider } from './httpProvider.js'

let cached: AIProvider | null = null

export function getAIProvider(): AIProvider {
  if (cached) return cached
  if (env.AI_PROVIDER === 'openai_compatible' && env.AI_API_KEY) {
    cached = new OpenAICompatibleProvider(env.AI_BASE_URL, env.AI_API_KEY, env.AI_MODEL)
    return cached
  }
  cached = new LocalDeterministicProvider()
  return cached
}
