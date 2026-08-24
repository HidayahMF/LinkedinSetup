import type { AutomationProvider, ExecutorInput, ExecutorOutcome } from '../../execution/provider.js'

/**
 * Honest default executor (flow.md §56). Nothing touches any external site, so
 * results can NOT be claimed as success — every outcome is UNVERIFIED.
 * Used for tests, local development and as the explicit AUTOMATION_PROVIDER=simulation.
 */
export class SimulationProvider implements AutomationProvider {
  readonly name = 'simulation'

  async execute(input: ExecutorInput): Promise<ExecutorOutcome> {
    return {
      outcome: 'unverified',
      message: `No browser automation module configured; action "${input.actionType}" was prepared and validated but nothing was executed externally.`,
    }
  }
}
