import { expect } from '@playwright/test'
import { readFileSync, statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

export const password = 'browser test unique passphrase'
const mailPath = 'test-results/browser-data/mail.json'
export const readMail = () => JSON.parse(readFileSync(mailPath, 'utf8'))
export const mailVersion = () => statSync(mailPath).mtimeMs

export function accountFor(email) {
  const db = new DatabaseSync('test-results/browser-data/test.sqlite', { readOnly: true })
  try { return db.prepare('SELECT id, email, password_hash, google_sub FROM users WHERE email = ?').get(email) }
  finally { db.close() }
}

export async function mockGoogle(page, email = 'unused-provider@example.test') {
  // Mock only Google's external provider script. All /api/auth requests still
  // reach the real browser-test Express server, cookies, and SQLite database.
  await page.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `(() => {
      let settings;
      window.google = { accounts: { id: {
        initialize(options) { settings = options; },
        renderButton(container, options) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'Continue with Google';
          button.addEventListener('click', () => {
            options.click_listener?.();
            const fixture = btoa(JSON.stringify({ email: ${JSON.stringify(email)}, nonce: settings.nonce }));
            settings.callback({ credential: 'browser-google-fixture:' + fixture });
          });
          container.replaceChildren(button);
        }
      } } };
    })();`,
  }))
}

export async function sendCode(page, email, route = '/signup') {
  await page.goto(route)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  await expect(page.getByLabel('Verification code', { exact: true })).toBeVisible()
}

export async function verifyCode(page, email) {
  const code = readMail()[email]
  expect(code).toMatch(/^\d{6}$/)
  await page.getByLabel('Verification code', { exact: true }).fill(code)
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click()
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible()
}

export async function signUp(page, email, name = 'Test Administrator') {
  await sendCode(page, email)
  await verifyCode(page, email)
  await page.getByLabel('Your name', { exact: true }).fill(name)
  await page.getByLabel('New password', { exact: true }).fill(password)
  await page.getByLabel('Confirm new password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
}

export async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}
