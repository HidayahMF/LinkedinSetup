// Deterministic test automation provider. Modes are controlled via globalThis.__stubMode.
export function createAutomationProvider() {
  return {
    name: 'test-stub',
    async execute(input) {
      // Phase D-09: expose exactly what the executor handed to the provider.
      globalThis.__lastExecutorInput = { actionType: input.actionType, payload: input.payload }
      const mode = globalThis.__stubMode ?? 'success'
      if (mode === 'challenge') {
        return { outcome: 'challenge', message: 'LinkedIn requires additional verification.' }
      }
      if (mode === 'fail') {
        return { outcome: 'failed', message: 'target page structure changed' }
      }
      if (mode === 'no_verify') {
        return { outcome: 'success', message: 'applied but could not read back' }
      }
      if (input.actionType === 'update_headline') {
        return { outcome: 'success', message: 'ok', observedAfter: input.payload.headline }
      }
      if (input.actionType === 'update_about') {
        return { outcome: 'success', message: 'ok', observedAfter: input.payload.about }
      }
      if (input.actionType === 'publish_post') {
        return { outcome: 'success', message: 'ok', observedAfter: input.payload.text }
      }
      return { outcome: 'unverified', message: `no verifier for ${input.actionType}` }
    },
  }
}
