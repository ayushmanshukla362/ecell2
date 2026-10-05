import { test, expect } from '@playwright/test'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { noOverflow, signUp } from './auth-helpers.js'

async function mutation(page, path, body) {
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json()
  return page.request.post(path, { data: body, headers: { 'X-CSRF-Token': csrfToken, Origin: new URL(page.url()).origin } })
}

test('admins search partial emails, retain multi-selection across filters/pages, and bulk add team members and access', async ({ page }, info) => {
  const failures = []
  page.on('pageerror', (problem) => failures.push(problem.message))
  await page.route('https://accounts.google.com/gsi/client', (route) => route.abort())
  await signUp(page, `bulkowner+${info.project.name}@example.test`, 'Bulk Owner')
  await expect(page).toHaveURL(/\/admin$/)
  // Registered-user fixtures exercise the real directory/API without 31 signup emails.
  const users = Array.from({ length: 31 }, (_, n) => ({ id: randomUUID(), email: `bulk+${info.project.name}${String(n).padStart(2, '0')}@example.test`, name: `Bulk ${info.project.name} ${String(n).padStart(2, '0')}` }))
  const db = new DatabaseSync('test-results/browser-data/test.sqlite')
  try { for (const [n, user] of users.entries()) db.prepare('INSERT INTO users(id,email,name,verified_at) VALUES(?,?,?,?)').run(user.id, user.email, user.name, Date.UTC(n === 0 ? 2025 : 2026, 1, 1)) }
  finally { db.close() }
  const seed = await mutation(page, '/api/admin/members/bulk', { userIds: [users[0].id], batch: '2025-2026', group: 'volunteers' })
  expect(seed.status()).toBe(201)

  await page.getByRole('button', { name: /Team & volunteers/ }).click()
  await page.getByRole('button', { name: 'Add users', exact: true }).click()
  await page.getByLabel('Destination batch').fill('2032-2033')
  await page.getByLabel('Member group').selectOption('volunteers')
  await page.getByLabel('Shared role / department').fill('Technology')
  await page.getByLabel('Search users', { exact: true }).fill('b')
  await expect(page.getByText('Type at least 2 characters to search users.', { exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'User search results', exact: true })).toHaveCount(0)
  await page.getByLabel('Search users', { exact: true }).fill(`bulk+${info.project.name}`)
  await expect(page.getByText(/31 matching users/)).toBeVisible()
  await page.getByRole('checkbox', { name: `Select ${users[0].email}`, exact: true }).check()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: `Select ${users[30].email}`, exact: true }).check()
  await expect(page.locator('.admin-picker-summary strong')).toHaveText('2 selected')
  await page.getByLabel('Signup year', { exact: true }).selectOption('2025')
  await expect(page.getByText(/1 matching user ·/)).toBeVisible()
  await expect(page.getByRole('checkbox', { name: `Select ${users[0].email}`, exact: true })).toBeChecked()
  await page.getByLabel('Team batch', { exact: true }).selectOption('2025-2026')
  await expect(page.getByRole('checkbox', { name: `Select ${users[0].email}`, exact: true })).toBeChecked()
  await expect(page.locator('.admin-picker-summary strong')).toHaveText('2 selected')
  await page.getByRole('button', { name: `Remove ${users[30].email} from selection`, exact: true }).click()
  await expect(page.locator('.admin-picker-summary strong')).toHaveText('1 selected')
  await page.getByLabel('Signup year', { exact: true }).selectOption('')
  await page.getByLabel('Team batch', { exact: true }).selectOption('')
  await expect(page.getByText(/31 matching users/)).toBeVisible()
  await page.getByRole('checkbox', { name: /Select this page/ }).check()
  await expect(page.locator('.admin-picker-summary strong')).toHaveText('30 selected')
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click()
  await page.getByRole('checkbox', { name: `Select ${users[0].email}`, exact: true }).check()
  await page.getByRole('checkbox', { name: `Select ${users[1].email}`, exact: true }).check()
  await noOverflow(page)
  await page.screenshot({ path: `test-results/bulk-team-${info.project.name}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Add 2 users to team', exact: true }).click()
  await expect(page.getByText('Added 2 members to 2032-2033.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: `Edit ${users[0].name}`, exact: true })).toBeVisible()
  const publicContent = await (await page.request.get('/api/content')).json()
  expect(publicContent.members.filter((member) => member.batch === '2032-2033' && member.name.startsWith(`Bulk ${info.project.name}`))).toHaveLength(2)
  expect(publicContent.members.every((member) => !member.account)).toBe(true)

  await page.getByRole('button', { name: 'Add users', exact: true }).click()
  await page.getByLabel('Search users', { exact: true }).fill(users[0].email)
  await expect(page.getByRole('checkbox', { name: `Select ${users[0].email}`, exact: true })).toBeDisabled()
  await expect(page.getByText('Already in this batch', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.route('**/api/admin/users?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Directory unavailable. Retry search.' }) }), { times: 1 })
  await page.getByRole('button', { name: 'Access management', exact: true }).click()
  await expect(page.getByText('Directory unavailable. Retry search.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Retry user search', exact: true }).click()
  await page.getByLabel('Search users', { exact: true }).fill(`bulk+${info.project.name}`)
  await page.getByLabel('Team batch', { exact: true }).selectOption('2032-2033')
  await expect(page.getByText(/2 matching users/)).toBeVisible()
  await page.getByRole('checkbox', { name: /Select this page/ }).check()
  await expect(page.locator('.admin-picker-summary strong')).toHaveText('2 selected')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  await page.route('**/api/admin/access/bulk', async (route) => { await gate; await route.continue() }, { times: 1 })
  await page.getByRole('button', { name: 'Authorize 2 users', exact: true }).click()
  try {
    await expect(page.getByRole('button', { name: 'Content', exact: true })).toBeDisabled()
    await expect(page.getByLabel('Search users', { exact: true })).toBeDisabled()
  } finally { release() }
  await expect(page.getByText('Administrator access granted to 2 users. Access is available immediately when they sign in.', { exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: `Select ${users[0].email}`, exact: true })).toBeDisabled()
  for (const user of users.slice(0, 2)) await expect(page.getByRole('button', { name: `Revoke access for ${user.email}`, exact: true })).toBeVisible()
  await expect(page.locator('.admin-picker-summary strong')).toHaveText('0 selected')
  await noOverflow(page)
  await page.screenshot({ path: `test-results/bulk-access-${info.project.name}.png`, fullPage: true })
  expect(failures).toEqual([])
})
