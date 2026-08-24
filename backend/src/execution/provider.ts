import { env } from '../config/env.js'
import { SimulationProvider } from '../infrastructure/automation/simulationProvider.js'
import { PlaywrightProvider } from '../infrastructure/automation/playwrightProvider.js'

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

export type AutomationProviderKind = 'simulation' | 'playwright' | 'module'

/**
 * Pure factory (Phase D). Fail-closed rules:
 * - kind 'playwright' without LINKEDIN_BROWSER_PROFILE_PATH → throws
 * - kind 'module' without AUTOMATION_MODULE → throws
 * - unknown kind → throws
 * There is NEVER a silent fallback from playwright to simulation: a broken
 * browser setup must surface as EXECUTION_ERROR, not as a quiet no-op success.
 */
export function createProviderFromConfig(config: {
  kind?: AutomationProviderKind
  modulePath?: string
  browserProfilePath?: string
  headless?: boolean
}): AutomationProvider {
  const kind: AutomationProviderKind | undefined = config.kind

  if (kind === 'playwright') {
    if (!config.browserProfilePath) {
      throw new Error(
        'AUTOMATION_PROVIDER=playwright requires LINKEDIN_BROWSER_PROFILE_PATH — refusing to start (fail closed)',
      )
    }
    return new PlaywrightProvider({
      profilePath: config.browserProfilePath,
      headless: config.headless ?? false,
    })
  }

  if (kind === 'module') {
    if (!config.modulePath) {
      throw new Error('AUTOMATION_PROVIDER=module requires AUTOMATION_MODULE — refusing to start (fail closed)')
    }
    return createModuleAutomationProvider(config.modulePath)
  }

  if (kind === 'simulation') {
    return new SimulationProvider()
  }

  // Legacy compatibility (pre-Phase-D deployments): AUTOMATION_MODULE alone selects module mode.
  if (!kind && config.modulePath) {
    return createModuleAutomationProvider(config.modulePath)
  }

  if (kind) {
    throw new Error(`unknown AUTOMATION_PROVIDER "${String(kind)}" — refusing to start (fail closed)`)
  }
  return new SimulationProvider()
}

/** Module providers are loaded through dynamic import at execution time. */
export function createModuleAutomationProvider(moduleName: string): AutomationProvider {
  return {
    name: `module:${moduleName}`,
    async execute(input: ExecutorInput): Promise<ExecutorOutcome> {
      const mod: Record<string, unknown> = await import(/* @vite-ignore */ moduleName)
      const factory =
        (mod['createAutomationProvider'] as (() => AutomationProvider) | undefined) ??
        ((mod as { default?: { createAutomationProvider?: () => AutomationProvider } }).default
          ?.createAutomationProvider as (() => AutomationProvider) | undefined)
      if (!factory) {
        throw new Error(`configured automation module "${moduleName}" exposes no createAutomationProvider()`)
      }
      const provider = factory()
      return provider.execute(input)
    },
  }
}

/**
 * Resolves the configured executor for the running process.
 * Precedence:
 *   AUTOMATION_PROVIDER=playwright  → real browser executor (profile path REQUIRED)
 *   AUTOMATION_PROVIDER=module      → AUTOMATION_MODULE dynamic import
 *   AUTOMATION_PROVIDER=simulation  → honest no-op executor
 *   unset + AUTOMATION_MODULE set   → legacy module mode (back-compat)
 *   otherwise                       → simulation
 */
export async function loadAutomationProvider(): Promise<AutomationProvider> {
  const kind = env.AUTOMATION_PROVIDER
  if (kind !== undefined && !['simulation', 'playwright', 'module'].includes(kind)) {
    throw new Error(`unknown AUTOMATION_PROVIDER "${kind}"`)
  }
  return createProviderFromConfig({
    kind,
    modulePath: env.AUTOMATION_MODULE,
    browserProfilePath: env.LINKEDIN_BROWSER_PROFILE_PATH,
    headless: env.LINKEDIN_HEADLESS,
  })
}
