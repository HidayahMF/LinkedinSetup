// Test-only environment for suites that must exercise the honest SIMULATION
// executor (Phase C hardening). Pinning here makes those suites deterministic
// even when a developer's local .env selects AUTOMATION_PROVIDER=playwright.
// Must be imported BEFORE any src module (dotenv never overrides existing vars).
process.env['AUTOMATION_PROVIDER'] = 'simulation'
delete process.env['AUTOMATION_MODULE']
process.env['AI_PROVIDER'] = 'local'
process.env['NODE_ENV'] = 'test'
