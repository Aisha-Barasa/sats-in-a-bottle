// The whole product through the real UI and API: create, seal, share, wait, open.
// Runs against demo tools (see playwright.config.js), so "skip ahead" stands in for the chain.
import { expect, test } from '@playwright/test';
import { deflateSync } from 'node:zlib';

const LETTER = 'Wangari, by the time you read this you are eighteen. Use it well.';

/** A valid 4x4 PNG, so the photo picker has something real to re-encode. */
function png() {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(4, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, ...Array(4).fill([209, 255, 202]).flat()])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Headless Chromium renders WebGL in software, and two pages animating the bottle starve the
 * main thread. The journey test blocks the 3D module so BottleCanvas shows its SVG fallback
 * (the same path real users get without WebGL); the landing test covers the 3D scene itself.
 */
async function without3d(context) {
  await context.route(/\/src\/lib\/bottleScene\.js/, (route) => route.abort());
  return context;
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // 409s are expected (the demo bottle has no coins to claim); the UI shows them as messages.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/status of 409|net::ERR_FAILED/.test(m.text())) return; // expected 409s; the blocked 3D module
    errors.push(m.text());
  });
  return errors;
}

test('landing page shows the 3D bottle and links into the app', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByText('Not just')).toBeVisible();
  await expect(page.locator('canvas').first()).toBeAttached();
  await page.getByRole('button', { name: 'Skip' }).click().catch(() => {});
  await expect(page.getByRole('link', { name: /I received a bottle/ }).first()).toHaveAttribute('href', '/find');
  expect(errors).toEqual([]);
});

test('sender seals a bottle and the recipient opens it on the day', async ({ browser }) => {
  const senderCtx = await without3d(await browser.newContext());
  const sender = await senderCtx.newPage();
  const senderErrors = collectErrors(sender);

  // Create: who, message (letter + photo + voice), when, amount, seal.
  await sender.goto('/create');
  await sender.getByPlaceholder('Wangari').fill('Wangari');
  await sender.getByPlaceholder('Aunt Njoki').fill('Aunt Njoki');
  await sender.getByRole('button', { name: 'Continue' }).click();
  await sender.getByPlaceholder('Write something').fill(LETTER);
  await sender.locator('input[type=file][accept^="image"]').setInputFiles({ name: 'mint.png', mimeType: 'image/png', buffer: png() });
  await sender.locator('input[type=file][accept="audio/*"]').setInputFiles({ name: 'note.webm', mimeType: 'audio/webm', buffer: Buffer.alloc(2048, 7) });
  await expect(sender.getByRole('img', { name: 'Selected' })).toBeVisible();
  await sender.getByRole('button', { name: 'Continue' }).click();
  await sender.getByRole('button', { name: 'Graduation' }).click();
  await sender.getByRole('button', { name: 'in 15 min (demo)' }).click();
  await sender.getByRole('button', { name: 'Continue' }).click();
  await sender.getByRole('button', { name: '10,000' }).click();
  await sender.getByRole('button', { name: 'Continue' }).click();
  await expect(sender.getByRole('button', { name: 'Seal and fund' })).toBeDisabled();
  await sender.getByRole('checkbox').check();
  await sender.getByRole('button', { name: 'Seal and fund' }).click();

  // Funding page: a real signet timelock address and its QR code.
  await sender.waitForURL(/\/b\//);
  await expect(sender.getByText('Fund the bottle')).toBeVisible();
  await expect(sender.locator('.copybox code').first()).toHaveText(/^tb1q[02-9ac-hj-np-z]{58}$/);
  await expect(sender.locator('.qr img')).toBeVisible();

  const skip = () => sender.getByRole('button', { name: /Demo: skip/ }).click();
  await skip();
  await expect(sender.getByText('Waiting for a confirmation')).toBeVisible();
  await skip();
  await expect(sender.getByText('This bottle opens in')).toBeVisible();

  // The share link carries the message key and the gift key in its #fragment.
  const shareUrl = (await sender.locator('.copybox code').filter({ hasText: '/open/' }).textContent()).trim();
  expect(shareUrl).toMatch(/\/open\/[\w-]{43}#k=[\w-]{43}&g=[\w-]{43}$/);

  // Recipient, on a phone, with no session: finds the bottle by pasting the link.
  const recipientCtx = await without3d(await browser.newContext({ viewport: { width: 390, height: 844 } }));
  const recipient = await recipientCtx.newPage();
  const recipientErrors = collectErrors(recipient);
  await recipient.goto('/find');
  await recipient.getByPlaceholder(/open/).fill(shareUrl);
  await recipient.getByRole('button', { name: 'Find my bottle' }).click();
  await expect(recipient.getByText('Your bottle opens in')).toBeVisible();
  await expect(recipient.getByText('From Aunt Njoki')).toBeVisible();
  await expect(recipient.getByText(LETTER)).toHaveCount(0);

  // The day comes: the message, photo and voice note decrypt in the recipient's browser.
  await skip();
  await expect(sender.getByText('Waiting for Wangari to claim')).toBeVisible();
  await recipient.reload();
  await recipient.getByRole('button', { name: 'Open the bottle' }).click();
  await expect(recipient.getByText(LETTER)).toBeVisible();
  await expect(recipient.getByRole('img', { name: 'Photo from Aunt Njoki' })).toBeVisible();
  await expect(recipient.locator('audio')).toHaveCount(1);

  // Claim is wired end to end; a demo-skipped bottle has no coins, so the server refuses clearly.
  await recipient.getByPlaceholder('tb1q…').fill('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7');
  await recipient.getByRole('button', { name: 'Continue' }).click();
  await expect(recipient.locator('.err')).toHaveText(/nothing to claim/);

  // Both sides see it in their lists.
  await sender.goto('/home');
  await expect(sender.getByText('Graduation for Wangari').first()).toBeVisible();
  await recipient.goto('/bottles?tab=received');
  await expect(recipient.getByText('Graduation for Wangari').first()).toBeVisible();

  // Someone who gets the link with its #key part cut off can't read it, and is told why.
  const strangerCtx = await without3d(await browser.newContext());
  const stranger = await strangerCtx.newPage();
  await stranger.goto(shareUrl.split('#')[0]);
  await expect(stranger.getByText(/missing its key/)).toBeVisible();

  expect(senderErrors).toEqual([]);
  expect(recipientErrors).toEqual([]);
});

test('an unknown bottle link says it was not found', async ({ page }) => {
  await page.goto('/open/' + 'A'.repeat(43));
  await expect(page.getByText('Link not found')).toBeVisible();
});
