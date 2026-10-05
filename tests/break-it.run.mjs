/**
 * Automated break-it run against the deployed app: a host test account scans a
 * generated receipt, adds a pay handle and shares; a friend test account joins
 * and claims; then the console script from tests/break-it.md runs as each.
 *
 *   npx deepspace test accounts create --email splitsnap-host@deepspace.test --name Hana --password-stdin
 *   npx deepspace test accounts create --email splitsnap-friend@deepspace.test --name Felix --password-stdin
 *   node tests/break-it.run.mjs            # uses one of Hana's 10 daily scans
 *
 * Passwords live only in ~/.deepspace/test-accounts.json (written by the CLI).
 */
import { chromium, devices } from '@playwright/test'
import { findTestAccountByName, newSignedInContext } from 'deepspace/testing'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = 'https://splitsnap.app.space'
const md = readFileSync('tests/break-it.md', 'utf8')
const script = md.slice(md.indexOf('```js') + 5, md.indexOf('```', md.indexOf('```js') + 5))
  .replace("console.table(results)", "console.table(results); return results")
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)


// A plain, legible test receipt: 3 items, subtotal $28.00, tax $2.52, total $30.52.
const receiptPath = join(tmpdir(), 'splitsnap-break-it-receipt.jpg')
{
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 420, height: 640 } })
  const row = (l, r, bold) => `<div style="display:flex;justify-content:space-between${bold ? ';font-weight:bold' : ''}"><span>${l}</span><span>${r}</span></div>`
  await p.setContent(`<body style="margin:0;background:#ddd;display:flex;justify-content:center;padding:20px">
    <div style="width:340px;background:#fff;padding:24px;font:18px/1.6 'Courier New',monospace;color:#111">
    <div style="text-align:center;font-weight:bold">BREAK-IT DINER</div><div style="text-align:center">123 Test St</div>
    <div>Check #4417 &nbsp; 10/04/2026 7:30 PM</div><hr>
    ${row('Cheeseburger', '15.00')}${row('Truffle Fries', '6.00')}${row('Vanilla Shake', '7.00')}<hr>
    ${row('Subtotal', '28.00')}${row('Tax', '2.52')}${row('TOTAL', '30.52', true)}</div></body>`)
  await p.screenshot({ path: receiptPath, type: 'jpeg', quality: 90 })
  await b.close()
}

const browser = await chromium.launch()
const phone = { ...devices['iPhone 13'] }
const hostCtx = await newSignedInContext(browser, findTestAccountByName('Hana'), BASE)
const friendCtx = await newSignedInContext(browser, findTestAccountByName('Felix'), BASE)
const host = await hostCtx.newPage({ viewport: phone.viewport })
const friend = await friendCtx.newPage({ viewport: phone.viewport })
for (const [n, p] of [['host', host], ['friend', friend]]) p.on('pageerror', (e) => log(n, 'PAGE ERROR', e.message))

// 1. Hana scans the receipt.
await host.goto(BASE + '/home')
await host.getByText('Snap the receipt').waitFor({ timeout: 20000 })
await host.locator('input[type=file]:not([capture])').setInputFiles(receiptPath)
log('host: scanning…')
// Re-running scans the same test receipt, so expect the duplicate prompt; keep both to continue.
const review = host.getByRole('button', { name: /^Review \d+ items?/ })
const keepBoth = host.getByRole('button', { name: /keep both/ })
await Promise.race([review.waitFor({ timeout: 60000 }), keepBoth.waitFor({ timeout: 60000 })])
if (await keepBoth.isVisible()) {
  log('host: scan done -> duplicate detected:', (await host.getByRole('alert').innerText()).replace(/\s+/g, ' ').slice(0, 90))
  await keepBoth.click()
} else {
  log('host: scan done ->', await review.innerText())
  await review.click()
}
await host.waitForURL(/\/b\/[0-9a-f-]{36}/, { timeout: 15000 })
const billId = host.url().match(/\/b\/([0-9a-f-]{36})/)[1]
log('bill', billId)

// 2. Review: add a Venmo handle, then share (headless has no share sheet, so the invite sheet opens).
await host.getByText('Check what we read').waitFor({ timeout: 15000 })
const venmo = host.getByLabel('Venmo handle')
await venmo.fill('hana-test'); await venmo.press('Enter')
const share = host.getByRole('button', { name: 'Share with the table' })
await share.waitFor({ timeout: 10000 })
await host.waitForFunction(() => !document.querySelector('button[disabled]')?.textContent?.includes('Share with the table'), null, { timeout: 10000 }).catch(() => {})
log('host: share enabled =', await share.isEnabled())
await share.click()
await host.getByRole('dialog', { name: 'Invite friends' }).waitFor({ timeout: 15000 })
log('host: invite sheet open')
await host.getByRole('dialog', { name: 'Invite friends' }).getByRole('button', { name: 'Close' }).click()

// 3. Felix opens the link, joins, claims the SECOND item (so check 1 can try to forge the first).
await friend.goto(BASE + '/b/' + billId)
await friend.getByRole('button', { name: /Join the table/ }).click({ timeout: 20000 })
log('friend: joined')
const cards = friend.locator('ul li button[aria-pressed]')
await cards.nth(1).waitFor({ timeout: 15000 })
await friend.waitForTimeout(800)
await cards.nth(1).click()
await friend.waitForFunction(() => document.querySelectorAll('ul li button[aria-pressed="true"]').length > 0, null, { timeout: 10000 })
log('friend: claimed item 2')

// 4. Break-it, as each of them.
for (const [who, page] of [['FRIEND', friend], ['HOST', host]]) {
  await page.goto(BASE + '/b/' + billId)
  await page.waitForTimeout(1500)
  const results = await page.evaluate(script)
  console.log('\n=== ' + who + ' ===')
  console.table(results)
}
// 5. Guests + lock, end to end: Hana adds Gina, assigns the Shake to her and the Cheeseburger to herself
//    (Felix has the Fries), locks, and the server's shares must match computeShares by hand.
const actionAs = (page, name, params) =>
  page.evaluate(async ([name, params]) => {
    const { token } = await (await fetch('/api/auth/token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })).json()
    return (await fetch('/api/actions/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(params) })).json()
  }, [name, params])
await host.goto(BASE + '/b/' + billId)
await host.waitForTimeout(1500)
const items = await host.evaluate(() => [...document.querySelectorAll('ul li button[aria-pressed]')].map((b) => b.innerText))
const guest = await actionAs(host, 'addGuest', { billId, displayName: 'Gina' })
log('host: addGuest ->', JSON.stringify(guest))
const lines = await host.evaluate(async (billId) => {
  // Read item ids the same way the break-it script does.
  const { token } = await (await fetch('/api/auth/token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })).json()
  const ws = await new Promise((ok) => { const w = new WebSocket('wss://' + location.host + '/ws/bill:' + billId + '?token=' + encodeURIComponent(token)); w.onopen = () => ok(w) })
  const recs = await new Promise((ok) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.type === 'core.query_result') ok(d.payload.records) }; ws.send(JSON.stringify({ type: 'core.subscribe', payload: { subscriptionId: 's1', query: { collection: 'items', orderBy: 'createdAt', orderDir: 'asc' } } })) })
  ws.close()
  return recs.filter((r) => r.data.kind === 'item').map((r) => ({ id: r.recordId, name: r.data.name }))
}, billId)
const hana = findTestAccountByName('Hana').userId
const byName = (n) => lines.find((l) => l.name.toLowerCase().includes(n)).id
log('host: assign burger ->', JSON.stringify(await actionAs(host, 'assignItem', { billId, itemId: byName('burger'), assignments: [{ userId: hana }] })))
log('host: assign shake to Gina ->', JSON.stringify(await actionAs(host, 'assignItem', { billId, itemId: byName('shake'), assignments: [{ userId: 'guest:' + guest.data.guestId }] })))
log('host: lockBill ->', JSON.stringify(await actionAs(host, 'lockBill', { billId })))
await host.goto(BASE + '/b/' + billId)
await host.getByText('totals are final').waitFor({ timeout: 15000 })
const settle = (await host.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
const expect = { Felix: '$6.54', Gina: '$7.63', Hana: '$16.35' }
for (const [who, amount] of Object.entries(expect)) {
  const ok = new RegExp(who + '[^$]*' + amount.replace('$', '\\$')).test(settle)
  console.log((ok ? 'PASS' : 'FAIL') + ' settle shows ' + who + ' ' + amount)
}
console.log((settle.includes('Shares add up to the bill total, $30.52') ? 'PASS' : 'FAIL') + ' shares add up to $30.52')

// 6. Clean up: the host deletes the test bill; it must be gone for everyone.
log('host: deleteBill ->', JSON.stringify(await actionAs(host, 'deleteBill', { billId })))
const gone = await host.evaluate(async (id) => (await fetch('/api/public/bills/' + id)).status, billId)
console.log((gone === 404 ? 'PASS' : 'FAIL') + ' deleted bill is gone (public preview ' + gone + ')')
await browser.close()
