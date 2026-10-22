// Use only the isolated mock-model bench, never a user profile.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const [packageRoot, logPath, port] = process.argv.slice(2)
if (!packageRoot || !logPath || !/^\d+$/.test(port ?? '') || !basename(dirname(resolve(logPath))).startsWith('.dsh-test-')) throw new Error('Expected an isolated .dsh-test-* bench')
const { chromium } = createRequire(join(resolve(packageRoot), 'package.json'))('playwright-core')
const login = readFileSync(logPath, 'utf8').match(new RegExp(`http://127\\.0\\.0\\.1:${port}/\\?token=[^\\s]+`))?.[0]
if (!login) throw new Error('The isolated bench has no login URL')
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
// Reproduce a skin that replaces only the native bubble's surface with higher
// specificity. Our tests used to check tokens, missing the browser's cascade.
const skin = `body[data-test-skin][data-test-glass] [class*="_bubble"]:not([role="tooltip"]){background-color:var(--test-surface)!important;background-image:linear-gradient(white,transparent);box-shadow:0 8px 32px #0002}`
const mode = dark => page.evaluate(value => {
  document.body.toggleAttribute('data-ds-dark-theme', value)
  document.body.style.setProperty('--test-surface', value ? '#111111' : '#ffffff')
}, dark)
const colors = locator => locator.evaluateAll(nodes => nodes.map(node => {
  const style = getComputedStyle(node)
  const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number)
  const lum = value => rgb(value).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0)
  const paper = style.backgroundColor
  const ink = style.color
  const a = lum(paper), b = lum(ink)
  return { paper, ink, image: style.backgroundImage, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }
}))
const entry = () => page.getByRole('button', { name: '大肥鱼', exact: true }).first().click()
try {
  await page.goto(login)
  await entry()
  await page.locator('.bt-head').waitFor()
  await page.addStyleTag({ content: skin })
  await page.evaluate(() => {
    document.body.setAttribute('data-test-skin', '')
    document.body.setAttribute('data-test-glass', '')
  })
  for (const order of ['skin-after-companion', 'skin-before-companion']) {
    if (order === 'skin-before-companion') {
      await page.getByRole('button', { name: '插件', exact: true }).click()
      await page.locator('.bt-head').waitFor({ state: 'detached' })
      await entry()
      await page.locator('.bt-head').waitFor()
    }
    const bubbles = page.locator('[data-chat-flow-kind=user] [class*="_userRow"] [class*="_bubble"]:not([role=tooltip]), [data-chat-flow-kind=user] .bt-ubody')
    assert.ok(await bubbles.count(), 'fixture has real user messages')
    for (const dark of [false, true]) {
      await mode(dark)
      await page.waitForTimeout(180)
      const result = await colors(bubbles)
      assert.ok(result.every(c => c.ratio >= 4.5 && c.image === 'none'), `${order} ${dark ? 'dark' : 'light'}: ${JSON.stringify(result)}`)
      await page.screenshot({ path: join(dirname(resolve(logPath)), `bubble-${order}-${dark ? 'dark' : 'light'}.png`) })
    }
    console.log(`PASS: user bubbles remain readable in both modes with ${order}`)
  }
  // Leaving must release the companion rule so ordinary sessions retain the skin.
  await page.getByRole('button', { name: /^(新建会话|New chat|New session)$/ }).first().click()
  await page.locator('.bt-head').waitFor({ state: 'detached' })
  assert.equal(await page.locator('body[data-bt-conversation]').count(), 0)
  await mode(false)
  await page.locator('[data-composer-input]').fill('Ordinary bubble contrast check')
  await page.locator('[data-composer-input]').press('Enter')
  const ordinary = page.locator('[data-chat-flow-kind=user] [class*="_bubble"]').last()
  await ordinary.waitFor()
  const result = await colors(ordinary)
  assert.equal(result[0].paper, 'rgb(255, 255, 255)')
  assert.ok(result[0].ratio >= 4.5, JSON.stringify(result))
  console.log('PASS: ordinary chat retains the skin and native text colors')
} finally {
  await browser.close()
}
