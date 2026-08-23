// Test-only environment setup. Must be imported BEFORE any src module so dotenv
// (which never overrides existing variables) keeps these values.
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const stubUrl = pathToFileURL(join(import.meta.dirname, 'stubAutomation.mjs')).href

process.env['AUTOMATION_MODULE'] = stubUrl
process.env['AI_PROVIDER'] = 'local'
process.env['NODE_ENV'] = 'test'
