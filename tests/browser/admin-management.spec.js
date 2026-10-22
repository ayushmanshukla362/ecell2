import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { noOverflow, signUp, password } from './auth-helpers.js'

// Each project owns its own configured manager email and creates that account
// itself. These scenarios do not depend on admin.spec.js running first.
test.beforeEach(async ({ page }) => {
  await page.route('https://accounts.google.com/gsi/client', (route) => route.abort())
})

async function mutate(page, method, path) {
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json()
  return page.request.fetch(path, { method, data: {}, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Origin: new URL(page.url()).origin } })
}

async function upload(page, label, file) {
  const response = page.waitForResponse((result) => result.url().endsWith('/api/admin/uploads') && result.request().method() === 'POST' && result.status() === 201)
  await page.getByLabel(label, { exact: true }).setInputFiles(file)
  const { image } = await (await response).json()
  await expect(page.getByRole('button', { name: 'Close editor', exact: true })).toBeEnabled()
  return image
}

test('owners upload and reuse public images, protect referenced files, and manage administrator access', async ({ page, browser, request }, info) => {
  test.setTimeout(180000)
  const failures = []
  page.on('pageerror', (error) => failures.push(error.message))
  const owner = `manager+${info.project.name}@example.test`
  const title = `Uploaded ${info.project.name} Founders Event`
  const memberName = `Uploaded ${info.project.name} Portrait`
  const bytes = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#e4b825' } }).png().toBuffer()
  const file = (name) => ({ name, mimeType: 'image/png', buffer: bytes })
  const images = []
  let cover
  let listing
  let gallery
  let portrait

  await signUp(page, owner)
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('button', { name: 'Access management', exact: true })).toBeVisible()

  await test.step('validate files and keep the editor locked until a binary upload completes', async () => {
    await page.getByRole('button', { name: 'Add event', exact: true }).click()
    await page.getByLabel('Title', { exact: false }).fill(title)
    await page.getByLabel('Display date').fill('March 8, 2031')
    await page.getByLabel('Archive year').fill('2031')
    await page.getByLabel('About the event', { exact: true }).fill('Image uploads preserve the event story.')
    await page.getByLabel('Upload cover image', { exact: true }).setInputFiles({ name: 'not-an-image.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') })
    await expect(page.getByText('Choose a JPEG, PNG, or WebP image.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish event', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Dismiss failure for not-an-image.txt', exact: true }).click()
    await page.getByLabel('Upload cover image', { exact: true }).setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(8 * 1024 * 1024 + 1) })
    await expect(page.getByText('This image exceeds the 8 MiB limit.')).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss failure for too-large.png', exact: true }).click()

    let release
    const gate = new Promise((resolve) => { release = resolve })
    let sentBytes
    let sentType
    await page.route('**/api/admin/uploads', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      sentBytes = route.request().postDataBuffer()
      sentType = route.request().headers()['content-type']
      await gate
      return route.continue()
    }, { times: 1 })
    const firstResponse = page.waitForResponse((response) => response.url().endsWith('/api/admin/uploads') && response.request().method() === 'POST')
    await page.getByLabel('Upload cover image', { exact: true }).setInputFiles(file('first-cover.png'))
    try {
      await expect(page.getByRole('button', { name: 'Close editor', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
      await expect(page.locator('.admin-editor button[type="submit"]')).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Media', exact: true })).toBeDisabled()
      await expect(page.getByRole('progressbar', { name: 'Upload cover image progress' })).toBeVisible()
      await expect(page.getByRole('img', { name: 'Selected file first-cover.png', exact: true })).toBeVisible()
    } finally { release() }
    const firstUpload = await firstResponse
    expect(firstUpload.status()).toBe(201)
    const first = (await firstUpload.json()).image
    images.push(first)
    expect(sentType).toBe('image/png')
    expect(sentBytes.equals(bytes)).toBe(true)
    await expect(page.getByRole('img', { name: 'Cover image preview', exact: true })).toHaveAttribute('src', first.url)
    await expect(page.getByRole('button', { name: 'Close editor', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Remove cover image', exact: true }).click()
    await expect(page.getByRole('img', { name: 'Cover image preview', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Choose cover image from media', exact: true }).click()
    await page.getByRole('article', { name: `Uploaded image ${first.id}`, exact: true }).getByRole('button', { name: 'Use this image', exact: true }).click()
    await expect(page.getByRole('img', { name: 'Cover image preview', exact: true })).toHaveAttribute('src', first.url)
    cover = await upload(page, 'Upload cover image', file('replacement-cover.png'))
    images.push(cover)
    await expect(page.getByRole('img', { name: 'Cover image preview', exact: true })).toHaveAttribute('src', cover.url)
    await noOverflow(page)
  })

  await test.step('upload listing and multiple gallery images without hiding partial failures', async () => {
    listing = await upload(page, 'Upload listing image', file('listing.png'))
    images.push(listing)
    await page.getByLabel('Upload gallery images', { exact: true }).setInputFiles(Array.from({ length: 31 }, (_, index) => file(`too-many-${index}.png`)))
    await expect(page.getByText('Choose at most 30 more images. A gallery can contain up to 30 images.')).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss selection error', exact: true }).click()
    const uploaded = []
    const collect = async (response) => {
      if (response.url().endsWith('/api/admin/uploads') && response.request().method() === 'POST' && response.status() === 201) uploaded.push((await response.json()).image)
    }
    page.on('response', collect)
    await page.getByLabel('Upload gallery images', { exact: true }).setInputFiles([file('gallery-one.png'), file('gallery-two.png'), { name: 'corrupt.png', mimeType: 'image/png', buffer: Buffer.from('not decodable image bytes') }])
    await expect(page.getByText('Some files were not uploaded. Retry them or dismiss each failure before saving. Successful uploads are kept.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish event', exact: true })).toBeDisabled()
    await expect.poll(() => uploaded.length).toBe(2)
    page.off('response', collect)
    gallery = uploaded
    images.push(...gallery)
    await expect(page.getByRole('img', { name: 'Gallery image preview 1', exact: true })).toHaveAttribute('src', gallery[0].url)
    await expect(page.getByRole('img', { name: 'Gallery image preview 2', exact: true })).toHaveAttribute('src', gallery[1].url)
    await page.getByRole('button', { name: 'Dismiss failure for corrupt.png', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Publish event', exact: true })).toBeEnabled()
    await noOverflow(page)
    await page.getByRole('button', { name: 'Publish event', exact: true }).click()
    await expect(page.getByText('Saved and published successfully.')).toBeVisible()
    const content = await (await request.get('/api/content')).json()
    const event = content.events.find((item) => item.title === title)
    expect(event).toMatchObject({ image: cover.url, listingImage: listing.url, images: gallery.map((image) => image.url), descriptionSections: { about: 'Image uploads preserve the event story.' } })
    for (const image of images) {
      const response = await request.get(image.url)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('image/webp')
      expect((await response.body()).subarray(0, 4).toString()).toBe('RIFF')
    }
    await page.goto('/events')
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    await expect(card.locator('img')).toHaveAttribute('src', listing.url)
    await card.getByRole('link', { name: /Read the story/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page.locator(`img[src="${gallery[0].url}"]`).first()).toBeVisible()
    await page.goto('/admin')
    await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click()
    await expect(page.getByRole('img', { name: 'Cover image preview', exact: true })).toHaveAttribute('src', cover.url)
    await expect(page.getByRole('img', { name: 'Gallery image preview 2', exact: true })).toHaveAttribute('src', gallery[1].url)
    await expect(page.getByLabel('About the event', { exact: true })).toHaveValue('Image uploads preserve the event story.')
    await page.getByLabel('Short description').fill('Edited without losing uploaded images or story fields.')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByText('Saved and published successfully.')).toBeVisible()
  })

  await test.step('upload a portrait and prevent deletion while any saved record uses an image', async () => {
    await page.getByRole('button', { name: /Team & volunteers/ }).click()
    await page.getByRole('button', { name: 'Add member', exact: true }).click()
    await page.getByLabel('Name', { exact: false }).fill(memberName)
    await page.getByLabel('Role', { exact: true }).fill('President')
    await page.locator('#content-batch').fill('2031-2032')
    portrait = await upload(page, 'Upload portrait image', file('portrait.png'))
    images.push(portrait)
    await page.getByRole('button', { name: 'Publish member', exact: true }).click()
    await expect(page.getByText('Saved and published successfully.')).toBeVisible()
    const content = await (await request.get('/api/content')).json()
    expect(content.members.find((item) => item.name === memberName).image).toBe(portrait.url)
    await page.goto('/teams')
    await page.getByRole('button', { name: '2031-2032', exact: true }).click()
    await expect(page.getByRole('heading', { name: memberName, exact: true })).toBeVisible()
    await expect(page.locator(`img[src="${portrait.url}"]`)).toBeVisible()
    await page.goto('/admin')
    await page.getByRole('button', { name: 'Media', exact: true }).click()
    await expect(page.getByRole('button', { name: `Delete upload ${cover.id}`, exact: true })).toBeDisabled()
    await expect(page.getByRole('article', { name: `Uploaded image ${cover.id}`, exact: true }).getByText(`In use by: ${title}`, { exact: true })).toBeVisible()
    expect((await mutate(page, 'DELETE', `/api/admin/uploads/${cover.id}`)).status()).toBe(409)
    await noOverflow(page)
    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByRole('button', { name: `Delete upload ${images[0].id}`, exact: true }).click()
    await expect(page.getByRole('article', { name: `Uploaded image ${images[0].id}`, exact: true })).toBeVisible()
    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: `Delete upload ${images[0].id}`, exact: true }).click()
    await expect(page.getByRole('article', { name: `Uploaded image ${images[0].id}`, exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Content', exact: true }).click()
    await page.getByRole('button', { name: `Delete ${title}`, exact: true }).click()
    await expect(page.getByRole('button', { name: `Edit ${title}`, exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: /Team & volunteers/ }).click()
    await page.getByRole('button', { name: `Delete ${memberName}`, exact: true }).click()
    await expect(page.getByRole('button', { name: `Edit ${memberName}`, exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Media', exact: true }).click()
    for (const image of images.slice(1)) {
      const remove = page.getByRole('button', { name: `Delete upload ${image.id}`, exact: true })
      await expect(remove).toBeEnabled()
      await remove.click()
      await expect(page.getByRole('article', { name: `Uploaded image ${image.id}`, exact: true })).toHaveCount(0)
      expect((await request.get(image.url)).status()).toBe(404)
    }
    const mediaResponse = page.waitForResponse((response) => response.url().endsWith('/api/admin/uploads') && response.request().method() === 'POST' && response.status() === 201)
    await page.getByLabel('Upload images to media library', { exact: true }).setInputFiles(file('standalone-media.png'))
    const standalone = (await (await mediaResponse).json()).image
    const mediaCard = page.getByRole('article', { name: `Uploaded image ${standalone.id}`, exact: true })
    await expect(mediaCard.getByLabel(`Image URL for ${standalone.id}`, { exact: true })).toHaveValue(standalone.url)
    await expect(mediaCard.getByRole('button', { name: `Delete upload ${standalone.id}`, exact: true })).toBeEnabled()
    await mediaCard.getByRole('button', { name: `Delete upload ${standalone.id}`, exact: true }).click()
    await expect(mediaCard).toHaveCount(0)
  })

  await test.step('owners authorize a not-yet-registered administrator and immediately revoke privileges', async () => {
    await page.route('**/api/admin/access', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary access-list outage. Please retry.' }) }), { times: 1 })
    await page.getByRole('button', { name: 'Access management', exact: true }).click()
    await expect(page.getByText('Temporary access-list outage. Please retry.')).toBeVisible()
    await page.getByRole('button', { name: 'Retry loading administrators', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Authorize administrator', exact: true })).toBeEnabled()
    await page.getByLabel('Administrator email address', { exact: true }).fill('not-an-email')
    await page.getByRole('button', { name: 'Authorize administrator', exact: true }).click()
    await expect(page.getByText('Enter a valid email address.')).toBeVisible()
    const ownerRow = page.locator('.admin-access-list li').filter({ has: page.getByRole('heading', { name: owner, exact: true }) })
    await expect(ownerRow.getByText('Protected owner', { exact: true })).toBeVisible()
    await expect(ownerRow.getByRole('button', { name: /Revoke/ })).toHaveCount(0)
    expect([400, 403, 409]).toContain((await mutate(page, 'DELETE', `/api/admin/access/${encodeURIComponent(owner)}`)).status())
    const email = `delegated+${info.project.name}@example.test`
    await page.getByLabel('Administrator email address', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Authorize administrator', exact: true }).click()
    await expect(page.getByText(`Authorized ${email}. No invitation email was sent. They must sign up or sign in using this exact email address.`, { exact: true })).toBeVisible()
    await expect(page.locator('.admin-access-list li').filter({ has: page.getByRole('heading', { name: email, exact: true }) }).getByText(/Not yet signed up/)).toBeVisible()
    await page.getByLabel('Administrator email address', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Authorize administrator', exact: true }).click()
    await expect(page.getByText('This email already has administrator access.')).toBeVisible()
    await noOverflow(page)

    const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: page.viewportSize() })
    try {
      await otherContext.route('https://accounts.google.com/gsi/client', (route) => route.abort())
      const adminPage = await otherContext.newPage()
      await signUp(adminPage, email, 'Delegated Administrator')
      await expect(adminPage).toHaveURL(/\/admin$/)
      await expect(adminPage.getByRole('button', { name: 'Add event', exact: true })).toBeEnabled()
      await expect(adminPage.getByRole('button', { name: 'Access management', exact: true })).toHaveCount(0)
      await expect(adminPage.getByText('You can manage content and media. Only a site owner can manage administrator access.')).toBeVisible()
      expect((await adminPage.request.get('/api/admin/access')).status()).toBe(403)
      const session = await (await adminPage.request.get('/api/auth/session')).json()
      expect(session.user).toMatchObject({ email, isAdmin: true, isOwner: false })
      await page.getByRole('button', { name: `Revoke access for ${email}`, exact: true }).click()
      await expect(page.getByRole('button', { name: `Revoke access for ${email}`, exact: true })).toHaveCount(0)
      expect((await adminPage.request.get('/api/admin/content')).status()).toBe(401)
      const revoked = await (await adminPage.request.get('/api/auth/session')).json()
      expect(revoked.user).toBeNull()
      await adminPage.reload()
      await expect(adminPage).toHaveURL(/\/signin$/)
      await adminPage.getByLabel('Email address', { exact: true }).fill(email)
      await adminPage.getByRole('button', { name: 'Continue with email', exact: true }).click()
      await adminPage.getByLabel('Password', { exact: true }).fill(password)
      await adminPage.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(adminPage.getByRole('heading', { name: 'For the authorized team.' })).toBeVisible()
      expect((await adminPage.request.get('/api/admin/content')).status()).toBe(403)
      await adminPage.goto('/account')
      await expect(adminPage.getByText('Your account does not have administrator access.')).toBeVisible()
    } finally { await otherContext.close() }
  })
  expect(failures).toEqual([])
})
