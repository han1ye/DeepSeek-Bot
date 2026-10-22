// Run only against an isolated mock-model bench, never a user's DSH profile.
// node dev/companion-ui.mjs <playwright-package-root> <.dsh-test-*/web.log> <port>
// BROWSER_CHANNEL=msedge uses installed Edge; otherwise uses Playwright Chromium.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve, basename } from 'node:path'

const [packageRoot, logPath, port] = process.argv.slice(2)
if (!packageRoot || !logPath || !/^\d+$/.test(port ?? '') || !basename(dirname(resolve(logPath))).startsWith('.dsh-test-')) {
  throw new Error('usage: node dev/companion-ui.mjs <playwright-package-root> <.dsh-test-*/web.log> <port>')
}
const { chromium } = createRequire(join(resolve(packageRoot), 'package.json'))('playwright-core')
const login = readFileSync(logPath, 'utf8').match(new RegExp(`http://127\\.0\\.0\\.1:${port}/\\?token=[^\\s]+`))?.[0]
if (!login) throw new Error('The isolated bench has no login URL')
const out = dirname(resolve(logPath))
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const api = async (endpoint, payload = {}) => {
  const result = await page.evaluate(([e, p]) => fetch('api/bot', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: e, payload: p }),
  }).then(response => response.json()), [endpoint, payload])
  assert.equal(result.ok, true, `${endpoint}: ${result.error?.message ?? 'failed'}`)
  return result.value
}
const send = async text => {
  await page.locator('[data-composer-input]').fill(text)
  await page.locator('[data-composer-input]').press('Enter')
}
const settle = () => page.waitForTimeout(700)
const check = message => console.log(`PASS: ${message}`)
const nativeSidebar = async () => {
  await page.getByRole('button', { name: /^(新建会话|New chat|New session)$/ }).first().waitFor()
  await page.getByRole('button', { name: /^(插件|Plugins)$/ }).waitFor()
  await page.getByRole('button', { name: /^(自动化任务|Scheduled tasks)$/ }).waitFor()
  await page.getByRole('button', { name: /^(账号菜单|Account menu)$/ }).waitFor()
}
const entry = () => page.getByRole('button', { name: '大肥鱼', exact: true }).first()
const team = () => page.getByRole('button', { name: /^(切换伙伴|Switch companion)$/ })
const pick = async id => {
  await team().click()
  await page.locator(`[data-picker-choice="${id}"]`).click()
  await page.locator('.bt-team-picker').waitFor({ state: 'detached' })
}
const noCompanion = async () => {
  await page.locator('.bt-head').waitFor({ state: 'detached' })
  await page.locator('.bt-panel').waitFor({ state: 'detached' })
  await settle()
  assert.equal(await page.locator('style[data-dsh-bot="companion"]').count(), 0)
  assert.equal(await page.locator('[class*="_centerCol"]').evaluate(el => getComputedStyle(el).marginRight), '0px')
}
try {
  await page.goto(login)
  const notice = page.getByRole('dialog').getByRole('button', { name: /^(继续|Continue)$/ })
  await page.addLocatorHandler(notice, () => notice.click())
  await entry().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1800)
  if (await notice.isVisible()) await notice.click()
  await nativeSidebar()
  await entry().click()
  await page.locator('.bt-head').waitFor()
  await page.locator('.bt-panel').waitFor()
  let state = await api('state')
  const mainId = state.mainBotId
  if (!state.bots.find(bot => bot.id === mainId).model) {
    await page.locator('.bt-model-dock .bt-model-chip').first().click({ timeout: 30000 })
    await page.locator('.bt-model-dock').waitFor({ state: 'detached' })
  }
  await send('你好，入口验收')
  await page.getByText('收到：你好，入口验收', { exact: false }).last().waitFor({ timeout: 30000 })
  await settle()
  await nativeSidebar()
  const bounds = await page.evaluate(() => ({
    input: document.querySelector('[data-composer-input]').getBoundingClientRect().right,
    pane: document.querySelector('.bt-panel').getBoundingClientRect().left,
  }))
  assert.ok(bounds.input <= bounds.pane, 'details leave space for the composer')
  check('entry opens a working companion chat beside the original DSH sidebar')
  await page.screenshot({ path: join(out, 'companion.png') })
  await page.setViewportSize({ width: 1024, height: 860 })
  await settle()
  const compact = await page.evaluate(() => ({
    selector: document.querySelector('.bt-companion-team').getBoundingClientRect().right,
    title: document.querySelector('.bt-head .bt-pill').getBoundingClientRect().left,
  }))
  assert.ok(compact.selector <= compact.title, 'team selector does not overlap the title in a narrow window')
  await page.setViewportSize({ width: 1600, height: 1000 })
  await settle()
  check('team controls fit beside the title with the details open at 1024px')

  await page.getByRole('button', { name: /^(关闭详情|Close details)$/ }).click()
  await page.locator('.bt-panel').waitFor({ state: 'detached' })
  await settle()
  assert.equal(await page.locator('[class*="_centerCol"]').evaluate(el => getComputedStyle(el).marginRight), '0px')
  await entry().click()
  await page.locator('.bt-panel').waitFor()
  await page.getByText('收到：你好，入口验收', { exact: false }).last().waitFor()
  assert.equal((await api('state')).mainBotId, mainId)
  check('details collapse and reopening the entry retains the same chat and history')

  await page.getByRole('button', { name: /^(管理团队|Manage team)$/ }).click()
  await page.locator('.bt-settings').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.bt-settings').waitFor({ state: 'detached' })
  if (!state.bots.some(bot => bot.name === 'UI Coder')) await api('create-bot', { name: 'UI Coder', role: 'Engineer' })
  state = await api('state')
  const coder = state.bots.find(bot => bot.name === 'UI Coder')
  const room = state.rooms.find(item => item.name === 'UI Group') ?? await api('create-room', { name: 'UI Group', members: [mainId, coder.id] })
  await team().click()
  await page.locator('.bt-team-picker').waitFor()
  assert.equal(await page.locator('.bt-companion-team select').count(), 0)
  await settle()
  await page.screenshot({ path: join(out, 'team-picker.png') })
  const search = page.getByRole('searchbox', { name: /搜索 Bot 或群聊|Find a Bot or group/ })
  await search.fill('nothing-matches-this')
  await page.locator('.bt-team-empty').waitFor()
  await search.fill('UI Coder')
  assert.equal(await page.locator('[data-picker-choice]').count(), 1)
  await search.press('ArrowDown')
  assert.equal(await page.locator(`[data-picker-choice="${coder.id}"]`).evaluate(el => el === document.activeElement), true)
  await page.keyboard.press('Escape')
  await page.locator('.bt-team-picker').waitFor({ state: 'detached' })
  assert.equal(await team().evaluate(el => el === document.activeElement), true)
  await pick(coder.id)
  await page.locator('.bt-panel').getByText('UI Coder', { exact: true }).first().waitFor()
  await pick(room.id)
  await page.locator('.bt-panel').getByText('UI Group', { exact: true }).first().waitFor()
  await nativeSidebar()
  check('team management, another Bot and a group open inside the companion page')

  await page.getByRole('button', { name: /^(插件|Plugins)$/ }).click()
  await noCompanion()
  await nativeSidebar()
  check('native Plugins page withdraws companion UI and pane spacing')
  await entry().click()
  await page.locator('.bt-panel').waitFor()
  await page.getByRole('button', { name: /^(新建会话|New chat|New session)$/ }).first().click()
  await noCompanion()
  await page.locator('[data-slot="conversation.input.model"] button').first().waitFor()
  await page.locator('[data-slot="conversation.input.permission"] button').first().waitFor()
  await send('普通会话验收')
  // The first native turn includes DSH's tool-change notice, which can trigger
  // the mock's team-list branch. A second turn exercises ordinary text delivery.
  await page.getByText(/现在的班底|收到：普通会话验收/).last().waitFor({ timeout: 30000 })
  await settle()
  await send('继续普通会话验收')
  await page.getByText('收到：继续普通会话验收', { exact: false }).last().waitFor({ timeout: 30000 })
  await noCompanion()
  await page.screenshot({ path: join(out, 'ordinary-chat.png') })
  check('ordinary chat sends a message with native model and permission controls')

  await entry().click()
  await page.locator('.bt-panel').waitFor()
  const main = (await api('state')).bots.find(bot => bot.id === mainId)
  assert.equal(await page.locator(`.bt-ws-browser [data-session-id="${main.sessionId}"]`).count(), 0)
  // The native archive shortcut remains available for a hidden current Bot.
  await page.keyboard.press('Control+Alt+KeyA')
  await noCompanion()
  await page.getByText(/^收到：Generate the session title/).first().click()
  await noCompanion()
  await entry().click()
  await page.locator('.bt-head').waitFor()
  await page.locator('.bt-panel').waitFor()
  await page.locator('.bt-panel').getByRole('button', { name: /^(仅可查看|Read only)$/ }).click()
  await settle()
  await page.locator('.bt-panel').getByRole('button', { name: /^(工作区内修改|Workspace write)$/ }).click()
  await settle()
  await send('归档恢复验收')
  await page.getByText('收到：归档恢复验收', { exact: false }).last().waitFor({ timeout: 30000 })
  await settle()
  assert.equal(await page.locator('.bt-head').count(), 1)
  assert.equal(await page.locator('.bt-panel').count(), 1)
  check('archived Main Bot opens in one click from an ordinary chat, then permissions and sending stay in the Bot view')

  await page.getByRole('button', { name: /^(账号菜单|Account menu)$/ }).click()
  await page.getByRole('menuitem', { name: /^(设置|Settings)$/ }).click()
  await page.screenshot({ path: join(out, 'native-settings.png') })
  assert.equal(await page.locator('.bt-settings').count(), 0)
  assert.ok((await page.locator('body').innerText()).match(/模型|Models/))
  check('native global settings remain accessible from the companion')
  assert.deepEqual(errors, [], 'browser has no unhandled errors')
  console.log('PASS: companion UI smoke test')
} catch (error) {
  await page.screenshot({ path: join(out, 'companion-failure.png') }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
