// Test-only environment setup. Must be imported BEFORE any src module so dotenv
// (which never overrides existing variables) keeps these values.
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const stubUrl = pathToFileURL(join(import.meta.dirname, 'stubAutomation.mjs')).href

// Pin the test executor to the deterministic stub so a developer's local .env
// (e.g. AUTOMATION_PROVIDER=playwright for the real smoke test) can never leak
// into the automated suites. Playwright itself is still covered directly via
// createProviderFromConfig + injected fake drivers (D-01/D-02/D-11…D-19).
process.env['AUTOMATION_PROVIDER'] = 'module'
process.env['AUTOMATION_MODULE'] = stubUrl
process.env['AI_PROVIDER'] = 'local'
process.env['NODE_ENV'] = 'test'
