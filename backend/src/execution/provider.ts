import { env } from '../config/env.js'

export interface ExecutorInput {
  actionType: string
  payload: Record<string, unknown>
}

export interface ExecutorOutcome {
  outcome: 'success' | 'failed' | 'challenge' | 'unverified'
  message: string
  /** What the automation actually read back from the target site, when it could verify. */
  observedAfter?: unknown
}

export interface AutomationProvider {
  readonly name: string
  execute(input: ExecutorInput): Promise<ExecutorOutcome>
}

/**
 * Honest default executor. No browser automation module is configured, so nothing touches
 * any external site and results can NOT be claimed as success (flow.md §56: report
 * UNVERIFIED instead of pretending SUCCESS).
 */
class SimulationProvider implements AutomationProvider {
  readonly name = 'simulation'

  async execute(input: ExecutorInput): Promise<ExecutorOutcome> {
    return {
      outcome: 'unverified',
      message: `No browser automation module configured; action "${input.actionType}" was prepared and validated but nothing was executed externally.`,
    }
  }
}

async function loadConfiguredProvider(): Promise<AutomationProvider | null> {
  const moduleName = env.AUTOMATION_MODULE
  if (!moduleName) return null
  try {
    // Dynamic import keeps this module decoupled from any specific automation library.
    const specifier = String(moduleName)
    const mod: Record<string, unknown> = await import(/* @vite-ignore */ specifier)
    const factory =
      (mod['createAutomationProvider'] as (() => AutomationProvider) | undefined) ??
      ((mod as { default?: { createAutomationProvider?: () => AutomationProvider } }).default
        ?.createAutomationProvider as (() => AutomationProvider) | undefined)
    if (!factory) return null
    return factory()
  } catch (err) {
    throw new Error(`configured automation module "${moduleName}" failed to load: ${(err as Error).message}`)
  }
}

export async function loadAutomationProvider(): Promise<AutomationProvider> {
  const configured = await loadConfiguredProvider()
  return configured ?? new SimulationProvider()
}
