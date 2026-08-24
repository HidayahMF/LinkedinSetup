import type { AutomationProvider, ExecutorInput, ExecutorOutcome } from '../../execution/provider.js'
import type { BrowserDriver, DriverSession } from './browserDriver.js'

/**
 * REAL LinkedIn browser executor (flow.md §79/§80.1).
 *
 * Hard boundaries implemented here:
 * - Receives ONLY {actionType, payload} of an already-approved action. It has no
 *   access to proposals, approvals or AI modules.
 * - NEVER logs, returns, or stores cookies / session tokens / credentials.
 * - Deterministic selector candidates only — no runtime/AI-supplied selectors.
 * - Any login/security challenge → outcome 'challenge' (queue pauses; user takes
 *   over). Never bypassed, never retried in a loop.
 * - Selector/navigation failure → outcome 'failed' (honest EXECUTION_ERROR).
 * - Read-back is performed after every write; the controller compares it with the
 *   approved payload and reports UNVERIFIED on mismatch — never fake SUCCESS.
 */

const LINKEDIN_BASE = 'https://www.linkedin.com'

/** URL fragments that indicate an auth wall rather than a logged-in session. */
const CHALLENGE_URL_PARTS = ['/login', '/checkpoint/', '/authwall', '/uas/login', '/secure']

/** DOM evidence of a login form (we never fill these — pause instead). */
const LOGIN_FORM_SELECTORS = ['input[name="session_key"]', 'form[class*="login"]', '#session_key']

/** CAPTCHA / 2FA / identity-verification surfaces. */
const CHALLENGE_SELECTORS = [
  'iframe[src*="captcha"]',
  'iframe[title*="challenge"]',
  'iframe[src*="challenge"]',
  '[data-test-id="captcha"]',
  'input[name="pinNumber"]',
  '#verification-code',
]

// --- deterministic selector candidates (to be validated via manual smoke test) ---
const EDIT_INTRO_BUTTON = [
  'button[aria-label*="Edit intro"]',
  'button[aria-label*="edit intro"]',
  '[data-view-name="profile-topcard-edit-intro"]',
]
const HEADLINE_INPUT = [
  'input[name="topcardHeadline"]',
  'textarea[name="topcardHeadline"]',
  '#profile-headline-form-element input',
  'input[id*="headline"]',
]
const SAVE_BUTTON = [
  'button[data-control-name="save"]',
  'button[aria-label*="Save"]',
  '.share-box-footer__primary-btn',
]
const HEADLINE_READBACK = [
  '.text-body-medium.break-words',
  'div[data-generated-suggestion-target] .text-body-medium',
]
const ABOUT_EDIT_BUTTON = [
  'button[aria-label*="Edit about"]',
  'a[href*="edit/forms/about"]',
]
const ABOUT_TEXTAREA = [
  'textarea[name="about"]',
  '#profile-about-form-element textarea',
  'textarea[id*="about"]',
]
const ABOUT_READBACK = [
  'section[data-view-name="profile-about"] span[aria-hidden="true"]',
  'section[class*="summary"] .text-body-medium span[aria-hidden="true"]',
]
const START_POST_BUTTON = [
  'button[aria-label*="Start a post"]',
  '.share-box-feed-entry__open-share-box',
]
const POST_TEXTAREA = [
  '.share-box-editor [contenteditable="true"]',
  'div[role="textbox"][contenteditable="true"]',
]
const FIRST_POST_TEXT = [
  '.feed-shared-update-v2__description .feed-shared-inline-show-more-text',
  '.feed-shared-update-v2__commentary',
]

export interface PlaywrightProviderOptions {
  profilePath: string
  headless: boolean
}

export class PlaywrightProvider implements AutomationProvider {
  readonly name = 'playwright'
  private readonly driver: BrowserDriver

  /** `driver` is optional to allow unit tests to inject a fake browser driver. */
  constructor(
    private readonly options: PlaywrightProviderOptions,
    driver?: BrowserDriver,
  ) {
    this.driver = driver ?? this.createDefaultDriver()
  }

  /** Factory that never launches a browser by itself (construction is inert). */
  static create(options: PlaywrightProviderOptions, driver?: BrowserDriver): PlaywrightProvider {
    return new PlaywrightProvider(options, driver)
  }

  private createDefaultDriver(): BrowserDriver {
    // Lazy require-free construction: the real driver is created on first use so
    // that merely building the provider never launches a browser.
    let cached: BrowserDriver | null = null
    return {
      open: async () => {
        if (!cached) {
          const { PlaywrightBrowserDriver } = await import('./browserDriver.js')
          cached = new PlaywrightBrowserDriver(this.options)
        }
        return cached.open()
      },
    }
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutcome> {
    let session: DriverSession | null = null
    try {
      session = await this.driver.open()
    } catch (err) {
      // Fail closed — never silently fall back to simulation (Phase D rule).
      return {
        outcome: 'failed',
        message: `EXECUTION_ERROR: browser could not be started (${(err as Error).message})`,
      }
    }

    try {
      const challenge = await this.detectChallenge(session)
      if (challenge) return challenge

      switch (input.actionType) {
        case 'update_headline':
          return await this.runHeadlineUpdate(session, String(input.payload['headline'] ?? ''))
        case 'update_about':
          return await this.runAboutUpdate(session, String(input.payload['about'] ?? ''))
        case 'publish_post':
        case 'create_post_draft_on_linkedin':
          return await this.runPublishPost(session, String(input.payload['text'] ?? ''))
        default:
          return {
            outcome: 'failed',
            message: `EXECUTION_ERROR: action type "${input.actionType}" is not implemented by the playwright executor`,
          }
      }
    } catch (err) {
      // Navigation/selector failure → honest EXECUTION_ERROR, never SUCCESS.
      return { outcome: 'failed', message: `EXECUTION_ERROR: ${(err as Error).message}` }
    } finally {
      try {
        await session.close()
      } catch {
        // closing must never mask the real result
      }
    }
  }

  /**
   * Distinguishes "logged-in" from any security surface. On ANY challenge the
   * provider stops immediately — the queue pauses and the user takes over.
   */
  private async detectChallenge(session: DriverSession): Promise<ExecutorOutcome | null> {
    const url = session.currentUrl()
    if (!url.startsWith('http')) {
      await session.navigate(LINKEDIN_BASE + '/feed/')
    }
    const current = session.currentUrl()
    if (CHALLENGE_URL_PARTS.some((part) => current.includes(part))) {
      let path = current
      try {
        path = new URL(current).pathname
      } catch {
        // keep raw url on parse failure — still safe to show (no query/credentials exposed)
      }
      return {
        outcome: 'challenge',
        message: `SECURITY_CHALLENGE: LinkedIn requires authentication/verification (landed on ${path}). Execution paused — take over in the browser window.`,
      }
    }
    if (await session.queryVisible(LOGIN_FORM_SELECTORS, 1_500)) {
      return {
        outcome: 'challenge',
        message:
          'SECURITY_CHALLENGE: LinkedIn shows a login form. Execution paused — sign in manually via the persistent browser profile, then retry.',
      }
    }
    if (await session.queryVisible(CHALLENGE_SELECTORS, 1_500)) {
      return {
        outcome: 'challenge',
        message:
          'SECURITY_CHALLENGE: LinkedIn requires CAPTCHA/2FA/identity verification. Execution paused — no bypass will be attempted.',
      }
    }
    return null
  }

  private async runHeadlineUpdate(session: DriverSession, headline: string): Promise<ExecutorOutcome> {
    await session.navigate(`${LINKEDIN_BASE}/in/me/`)
    const challenge = await this.detectChallenge(session)
    if (challenge) return challenge

    await session.click(EDIT_INTRO_BUTTON)
    await session.fill(HEADLINE_INPUT, headline)
    await session.click(SAVE_BUTTON)

    // Read back from the rendered profile card.
    await session.navigate(`${LINKEDIN_BASE}/in/me/`)
    const observed = await session.queryText(HEADLINE_READBACK)
    if (observed === null) {
      return { outcome: 'unverified', message: 'headline could not be read back from the profile page' }
    }
    return { outcome: 'success', message: 'headline update executed', observedAfter: observed }
  }

  private async runAboutUpdate(session: DriverSession, about: string): Promise<ExecutorOutcome> {
    await session.navigate(`${LINKEDIN_BASE}/in/me/`)
    const challenge = await this.detectChallenge(session)
    if (challenge) return challenge

    await session.click(ABOUT_EDIT_BUTTON)
    await session.fill(ABOUT_TEXTAREA, about)
    await session.click(SAVE_BUTTON)

    await session.navigate(`${LINKEDIN_BASE}/in/me/details/about/`)
    const observed = await session.queryText(ABOUT_READBACK)
    if (observed === null) {
      return { outcome: 'unverified', message: 'about section could not be read back' }
    }
    return { outcome: 'success', message: 'about update executed', observedAfter: observed }
  }

  private async runPublishPost(session: DriverSession, text: string): Promise<ExecutorOutcome> {
    await session.navigate(`${LINKEDIN_BASE}/feed/`)
    const challenge = await this.detectChallenge(session)
    if (challenge) return challenge

    await session.click(START_POST_BUTTON)
    await session.fill(POST_TEXTAREA, text)
    await session.click(SAVE_BUTTON)

    // Verify by reading back the most recent post on the user's activity feed.
    await session.navigate(`${LINKEDIN_BASE}/in/me/recent-activity/all/`)
    const observed = await session.queryText(FIRST_POST_TEXT)
    if (observed === null || !observed.includes(text.slice(0, Math.min(40, text.length)))) {
      return {
        outcome: 'unverified',
        message:
          observed === null
            ? 'published post could not be read back'
            : 'read-back text did not match the approved content',
      }
    }
    return { outcome: 'success', message: 'post published', observedAfter: observed.slice(0, text.length) }
  }
}
