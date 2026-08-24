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

/**
 * Repo-level contract guardrails.
 *
 * History: the Phase-1 version of this test banned ALL browser-automation
 * dependencies because none were sanctioned yet. As of Phase D, Playwright is
 * the MANDATORY executor stack (flow.md §68/§79) and is therefore allowed — but
 * ONLY inside `backend/src/infrastructure/automation/**`. Everything else that
 * was dangerous before (puppeteer, AI-vendor SDKs, bypass helpers, browser
 * code anywhere else) remains banned. The guardrail got stricter where it
 * matters: it now enforces the executor containment boundary.
 */

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

  it('no non-sanctioned automation/AI dependencies are installed', () => {
    // playwright is sanctioned (flow.md §68); puppeteer and AI-vendor SDKs are not.
    const pkgs = ['package.json', 'frontend/package.json', 'backend/package.json']
    const banned = /puppeteer|openai|@google|gemini|anthropic|langchain|linkedin-api/i
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
      /\b(forceExecute|bypassApproval|adminExecute|executeUnapproved)\b/i
    const offenders = files.filter((file) => forbidden.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('browser automation is contained inside backend/src/infrastructure/automation only', () => {
    const frontendFiles = collectFiles(join(root, 'frontend', 'src')).filter(
      (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
    )
    // The frontend must never touch browser automation at all.
    const frontendOffenders = frontendFiles.filter((f) =>
      /playwright|puppeteer|chromium\.launch/i.test(readFileSync(f, 'utf8')),
    )
    expect(frontendOffenders).toEqual([])

    // Backend may import playwright ONLY inside the designated infrastructure directory.
    const backendFiles = collectFiles(join(root, 'backend', 'src')).filter(
      (f) => f.endsWith('.ts'),
    )
    const containmentDir = join(root, 'backend', 'src', 'infrastructure', 'automation')
    const escaped = backendFiles.filter(
      (f) =>
        !f.startsWith(containmentDir) &&
        /from\s+['"]playwright['"]|chromium\.launch/i.test(readFileSync(f, 'utf8')),
    )
    expect(escaped).toEqual([])
  })
})
