import { mkdirSync } from 'node:fs'
import type { BrowserContext, Page } from 'playwright'

/**
 * Internal browser port for the Playwright executor.
 *
 * This is NOT a second AutomationProvider interface — the only provider contract
 * remains `AutomationProvider` (execution/provider.ts). This port exists so the
 * provider's decision logic (challenge detection, selectors, read-back) can be
 * unit-tested with tiny fake drivers while the real driver wraps Playwright here,
 * isolated inside the executor infrastructure (flow.md §49.1/§80.1).
 */

export interface DriverSession {
  /** Navigates and waits for load. Throws on navigation failure. */
  navigate(url: string): Promise<void>
  currentUrl(): string
  /** Returns innerText of the first matching selector candidate, or null when none matches. */
  queryText(selectors: string[]): Promise<string | null>
  /** True when any selector candidate resolves to a visible element. */
  queryVisible(selectors: string[], timeoutMs?: number): Promise<boolean>
  /** Fills the FIRST visible selector candidate. Throws when none resolves (fail closed). */
  fill(selectorCandidates: string[], value: string): Promise<void>
  /** Clicks the FIRST visible selector candidate. Throws when none resolves (fail closed). */
  click(selectorCandidates: string[]): Promise<void>
  waitForSelector(selectors: string[], timeoutMs: number): Promise<boolean>
  close(): Promise<void>
}

export interface BrowserDriver {
  open(): Promise<DriverSession>
}

const NAV_TIMEOUT_MS = 20_000
const ELEMENT_TIMEOUT_MS = 6_000

class PlaywrightDriverSession implements DriverSession {
  constructor(
    private readonly context: BrowserContext,
    private readonly page: Page,
  ) {}

  async navigate(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
  }

  currentUrl(): string {
    return this.page.url()
  }

  async queryText(selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
      const node = this.page.locator(selector).first()
      try {
        const text = await node.innerText({ timeout: ELEMENT_TIMEOUT_MS })
        if (text && text.trim().length > 0) return text.trim()
      } catch {
        // try next candidate
      }
    }
    return null
  }

  async queryVisible(selectors: string[], timeoutMs = ELEMENT_TIMEOUT_MS): Promise<boolean> {
    for (const selector of selectors) {
      try {
        await this.page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs })
        return true
      } catch {
        // try next candidate
      }
    }
    return false
  }

  private async firstResolving(selectors: string[]): Promise<ReturnType<Page['locator']>> {
    for (const selector of selectors) {
      const node = this.page.locator(selector).first()
      try {
        await node.waitFor({ state: 'visible', timeout: ELEMENT_TIMEOUT_MS })
        return node
      } catch {
        // try next candidate
      }
    }
    throw new Error(`selector not found: tried ${selectors.length} deterministic candidates`)
  }

  async fill(selectorCandidates: string[], value: string): Promise<void> {
    const node = await this.firstResolving(selectorCandidates)
    await node.fill(value)
  }

  async click(selectorCandidates: string[]): Promise<void> {
    const node = await this.firstResolving(selectorCandidates)
    await node.click()
  }

  async waitForSelector(selectors: string[], timeoutMs: number): Promise<boolean> {
    return this.queryVisible(selectors, timeoutMs)
  }

  async close(): Promise<void> {
    await this.context.close()
  }
}

/**
 * Real Chromium session backed by a PERSISTENT profile directory
 * (`LINKEDIN_BROWSER_PROFILE_PATH`). Credentials/session state never leave this
 * process: no cookies/storage are read by the provider layer, nothing is logged,
 * nothing is returned in ExecutorOutcome beyond verified content text.
 */
export class PlaywrightBrowserDriver implements BrowserDriver {
  constructor(private readonly options: { profilePath: string; headless: boolean }) {}

  async open(): Promise<DriverSession> {
    // Lazy import keeps construction cheap and lets unit tests inject fakes instead.
    const { chromium } = await import('playwright')
    mkdirSync(this.options.profilePath, { recursive: true })
    const context = await chromium.launchPersistentContext(this.options.profilePath, {
      headless: this.options.headless,
      viewport: { width: 1280, height: 860 },
      args: ['--disable-blink-features=AutomationControlled'],
    })
    const page = context.pages()[0] ?? (await context.newPage())
    return new PlaywrightDriverSession(context, page)
  }
}
