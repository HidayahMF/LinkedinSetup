import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function collectFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue
      collectFiles(full, acc)
    } else {
      acc.push(full)
    }
  }
  return acc
}

describe('foundation contract guardrails', () => {
  it('flow.md exists at project root as the architectural contract', () => {
    const p = join(root, 'flow.md')
    expect(existsSync(p)).toBe(true)
    expect(readFileSync(p, 'utf8').length).toBeGreaterThan(50_000)
  })

  it('.env.example exists and .gitignore protects .env', () => {
    expect(existsSync(join(root, '.env.example'))).toBe(true)
    const gitignore = readFileSync(join(root, '.gitignore'), 'utf8')
    expect(gitignore).toMatch(/^\.env$/m)
    expect(gitignore).toMatch(/^!\.env\.example$/m)
    expect(existsSync(join(root, '.env'))).toBe(false)
  })

  it('no premature automation/AI dependencies are installed', () => {
    const pkgs = ['package.json', 'frontend/package.json', 'backend/package.json']
    const banned =
      /playwright|puppeteer|openai|@google|gemini|anthropic|langchain|linkedin-api/i
    const found: string[] = []
    for (const pkg of pkgs) {
      if (!existsSync(join(root, pkg))) continue
      const json = JSON.parse(readFileSync(join(root, pkg), 'utf8'))
      const names = [
        ...Object.keys(json.dependencies ?? {}),
        ...Object.keys(json.devDependencies ?? {}),
      ]
      found.push(...names.filter((n) => banned.test(n)).map((n) => `${pkg}: ${n}`))
    }
    expect(found).toEqual([])
  })

  it('no execution bypass helpers exist anywhere in source code', () => {
    const files = [
      ...collectFiles(join(root, 'backend', 'src')),
      ...collectFiles(join(root, 'frontend', 'src')),
    ].filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    const forbidden =
      /\b(forceExecute|bypassApproval|adminExecute|executeUnapproved)\b|playwright|puppeteer|chromium\.launch/i
    const offenders = files.filter((file) => forbidden.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
