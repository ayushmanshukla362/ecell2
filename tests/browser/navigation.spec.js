import { test, expect } from '@playwright/test'
import { noOverflow, signUp } from './auth-helpers.js'

// Auth, content and contact use the real isolated production-build server on
// 4174. It captures email locally. Never contact Google's real sign-in service.
test.beforeEach(async ({ page }) => {
  await page.route('https://accounts.google.com/gsi/client', (route) => route.abort())
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

async function checkNavbarLayout(page) {
  await noOverflow(page)
  const problems = await page.locator('.site-nav__inner').evaluate((nav) => {
    const items = [...nav.children].map((element) => ({
      name: element.className,
      rect: element.getBoundingClientRect(),
    })).filter(({ rect }) => rect.width && rect.height)
    const issues = []
    for (const [index, item] of items.entries()) {
      if (item.rect.left < 0 || item.rect.right > innerWidth) issues.push(`${item.name} is outside the viewport`)
      for (const other of items.slice(index + 1)) {
        if (item.rect.left < other.rect.right - 1 && item.rect.right > other.rect.left + 1 && item.rect.top < other.rect.bottom - 1 && item.rect.bottom > other.rect.top + 1) issues.push(`${item.name} overlaps ${other.name}`)
      }
    }
    return issues
  })
  expect(problems).toEqual([])
}

async function expectAnchor(page, id) {
  const target = page.locator(`[id="${id}"]`)
  await expect(target).toBeAttached()
  await expect.poll(async () => target.evaluate((element) => {
    const { top } = element.getBoundingClientRect()
    return top >= 0 && top < 160
  })).toBe(true)
}

test('one primary sign-in CTA and larger brand fit 320, 390, 768 and desktop; signup is discoverable', async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const navbar = page.locator('.site-nav')
    await expect(navbar.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(1)
    await expect(navbar.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(navbar.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/signin')
    await expect(navbar.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
    await expect(navbar.getByText('Start a conversation')).toHaveCount(0)
    expect(await navbar.locator('.site-nav__brand img').evaluate((image) => image.getBoundingClientRect().width)).toBeGreaterThanOrEqual(40)
    expect(await navbar.locator('.site-nav__brand span').evaluate((label) => parseFloat(getComputedStyle(label).fontSize))).toBeGreaterThan(13.3)
    await checkNavbarLayout(page)
  }
  await page.locator('.site-nav').getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible()
})

test('mobile menu is labeled, keyboard dismissible, and closes after navigation while the CTA stays visible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Primary navigation' })
  const toggle = page.getByRole('button', { name: 'Open menu', exact: true })
  await expect(nav).toBeHidden()
  await expect(page.locator('.site-nav__cta')).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-controls', 'primary-navigation')
  await toggle.click()
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
  await expect(nav.getByRole('link', { name: 'Team', exact: true })).toBeVisible()
  await checkNavbarLayout(page)
  await page.keyboard.press('Escape')
  await expect(nav).toBeHidden()
  await expect(toggle).toBeFocused()
  await toggle.click()
  await nav.getByRole('link', { name: 'Team', exact: true }).click()
  await expect(page).toHaveURL(/\/teams$/)
  await expect(nav).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.site-nav__cta')).toBeVisible()
  await checkNavbarLayout(page)
})

test('a real signed-in member gets one Account CTA, no Admin link, and sign-out restores Sign in', async ({ page }, info) => {
  await signUp(page, `navigation-member+${info.project.name}@example.test`, 'Navigation Member')
  await expect(page).toHaveURL(/\/account$/)
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const navbar = page.locator('.site-nav')
    await expect(navbar.getByRole('link', { name: 'Account', exact: true })).toHaveCount(1)
    await expect(navbar.getByRole('link', { name: 'Account', exact: true })).toBeVisible()
    await expect(navbar.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0)
    await expect(navbar.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
    await checkNavbarLayout(page)
  }
  await page.locator('.site-nav').getByRole('link', { name: 'Account', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.locator('.site-nav').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
})

test('sharing an idea navigates to the real contact form with optional email, without sending or subscribing', async ({ page }, info) => {
  const contactPosts = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/contact') contactPosts.push(request.url())
  })
  const email = `idea+${info.project.name}@example.test`
  await page.goto('/')
  await page.getByLabel('Your email address (optional)', { exact: true }).fill('not-an-email')
  await page.getByRole('button', { name: 'Share your idea' }).click()
  await expect(page).toHaveURL(/\/$/)
  expect(contactPosts).toEqual([])
  await page.getByLabel('Your email address (optional)', { exact: true }).fill(email)
  await page.getByRole('button', { name: 'Share your idea' }).click()
  await expect(page).toHaveURL(/\/contactus#contact-form$/)
  expect(page.url()).not.toContain(email)
  await expect(page.getByRole('form', { name: 'Contact E-Cell' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue(email)
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeEmpty()
  await expectAnchor(page, 'contact-form')
  expect(contactPosts).toEqual([])
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('alert')).toContainText('complete all required fields')
  expect(contactPosts).toEqual([])

  await page.goto('/events')
  await page.getByRole('button', { name: 'Share your idea' }).click()
  await expect(page).toHaveURL(/\/contactus#contact-form$/)
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeEmpty()
  expect(contactPosts).toEqual([])
})

test('conversation links reach the contact form directly and social links use existing public identities', async ({ page }) => {
  for (const [route, link] of [['/', 'Have something in mind?'], ['/events', 'Bring us your idea']]) {
    await page.goto(route)
    await page.getByRole('link', { name: link }).click()
    await expect(page).toHaveURL(/\/contactus#contact-form$/)
    await expectAnchor(page, 'contact-form')
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible()
  }
  await expect(page.locator('footer').getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', 'https://www.linkedin.com/company/ecell-abes-ec/')
  await expect(page.locator('.contact-channels').getByRole('link', { name: /Instagram/ })).toHaveAttribute('href', 'https://www.instagram.com/ecell_abesec/')
  await expect(page.locator('.contact-channels').getByRole('link', { name: /Email/ })).toHaveAttribute('href', 'mailto:ecell@abes.ac.in')
})

test('in-page links, direct hash URLs and history preserve anchor scrolling', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Scroll to About section' }).click()
  await expect(page).toHaveURL(/\/#about$/)
  await expectAnchor(page, 'about')
  await page.getByRole('link', { name: 'See our track record' }).click()
  await expect(page).toHaveURL(/\/#achievements$/)
  await expectAnchor(page, 'achievements')
  await page.goBack()
  await expect(page).toHaveURL(/\/#about$/)
  await expectAnchor(page, 'about')
  await page.goto('/teams#roster')
  await expectAnchor(page, 'roster')
  await page.goto('/events#connect')
  await expect(page.locator('.archive-card__link').first()).toBeAttached()
  await expectAnchor(page, 'connect')
  await page.goto('/#%E0%A4%A') // Malformed encodings must not crash the router.
  await expect(page.locator('main')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})

test('public links have real destinations and internal routes resolve rather than rendering blank or missing pages', async ({ page }) => {
  test.setTimeout(120000)
  const targets = new Set()
  for (const route of ['/', '/events', '/teams', '/contactus', '/signin', '/signup', '/reset-password']) {
    await page.goto(route)
    await expect(page.locator('main')).toBeVisible()
    if (route === '/events') await expect(page.locator('.archive-card__link').first()).toBeVisible()
    if (route === '/') await expect(page.locator('.event-row').first()).toBeAttached()
    const links = await page.locator('a[href]:not([role="button"])').evaluateAll((elements) => elements.map((element) => ({
      raw: element.getAttribute('href'), url: element.href,
    })))
    for (const { raw, url } of links) {
      expect(raw.trim(), `Empty link on ${route}`).not.toBe('')
      expect(raw, `Placeholder link on ${route}`).not.toBe('#')
      expect(url).not.toMatch(/^javascript:/i)
      const target = new URL(url)
      if (target.origin === new URL(page.url()).origin) targets.add(`${target.pathname}${target.search}${target.hash}`)
    }
    await noOverflow(page)
  }
  expect(targets.size).toBeGreaterThan(8)
  for (const target of targets) {
    await page.goto(target)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('main h1').first()).not.toBeEmpty()
    await expect(page.getByRole('heading', { name: "This page isn't here." })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Event not found.' })).toHaveCount(0)
    const { hash } = new URL(page.url())
    if (hash) await expect(page.locator(`[id="${decodeURIComponent(hash.slice(1))}"]`)).toBeAttached()
  }
})

test('unknown routes render a useful client 404 and event misses retain their archive recovery', async ({ page }) => {
  await page.goto('/this-page-does-not-exist/deeper')
  await expect(page.getByRole('heading', { level: 1, name: "This page isn't here." })).toBeVisible()
  await noOverflow(page)
  await page.getByRole('link', { name: 'Back to home' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('#hero-title')).toBeVisible()
  await page.goto('/events/this-event-does-not-exist')
  await expect(page.getByRole('heading', { name: 'Event not found.' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to the archive', exact: true }).click()
  await expect(page).toHaveURL(/\/events$/)
})

for (const scenario of ['native success', 'clipboard fallback', 'native denied', 'copy denied', 'copy unavailable', 'share canceled']) {
  test(`event sharing reports ${scenario} honestly`, async ({ page }) => {
    // Only browser capability boundaries are replaced; event data and routing
    // still come from the production app and real isolated content API.
    await page.addInitScript((mode) => {
      window.__copiedEventUrls = []
      Object.defineProperty(navigator, 'share', { configurable: true, value: ['clipboard fallback', 'copy denied', 'copy unavailable'].includes(mode) ? undefined : async (data) => {
        if (mode === 'share canceled') throw new DOMException('Canceled', 'AbortError')
        if (mode === 'native denied') throw new DOMException('Denied', 'NotAllowedError')
        window.__sharedEvent = data
      } })
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'copy unavailable' ? undefined : { writeText: async (url) => {
        if (mode === 'copy denied') throw new DOMException('Denied', 'NotAllowedError')
        window.__copiedEventUrls.push(url)
      } } })
    }, scenario)
    await page.goto('/events')
    await page.getByRole('link', { name: 'Read the story' }).first().click()
    await expect(page.locator('#event-detail-title')).toBeVisible()
    const url = page.url()
    await page.getByRole('button', { name: 'Share event', exact: true }).click()
    if (scenario === 'native success') {
      await expect(page.getByRole('status')).toHaveText('Event shared.')
      expect(await page.evaluate(() => window.__sharedEvent.url)).toBe(url)
    } else if (scenario === 'copy denied' || scenario === 'copy unavailable') {
      await expect(page.getByRole('alert')).toContainText('Could not share or copy automatically')
      const input = page.getByLabel('Event link', { exact: true })
      await expect(input).toHaveValue(url)
      await expect(input).toHaveAttribute('readonly', '')
      await input.focus()
      expect(await input.evaluate((element) => element.value.slice(element.selectionStart, element.selectionEnd))).toBe(url)
    } else if (scenario === 'share canceled') {
      await expect(page.getByRole('status')).toHaveText('Sharing canceled. No link was shared.')
      expect(await page.evaluate(() => window.__copiedEventUrls)).toEqual([])
    } else {
      await expect(page.getByRole('status')).toHaveText('Event link copied to clipboard.')
      expect(await page.evaluate(() => window.__copiedEventUrls)).toEqual([url])
    }
    await expect(page.getByRole('button', { name: 'Share event', exact: true })).toBeEnabled()
    await noOverflow(page)
  })
}
