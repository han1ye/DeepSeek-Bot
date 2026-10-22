// Synthetic data only; reuse the configured mock bench from companion-ui.mjs.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const [packageRoot, logPath, port] = process.argv.slice(2)
if (!packageRoot || !logPath || !/^\d+$/.test(port ?? '') || !basename(dirname(resolve(logPath))).startsWith('.dsh-test-')) throw new Error('Expected an isolated .dsh-test-* bench')
const { chromium } = createRequire(join(resolve(packageRoot), 'package.json'))('playwright-core')
const login = readFileSync(logPath, 'utf8').match(new RegExp(`http://127\\.0\\.0\\.1:${port}/\\?token=[^\\s]+`))?.[0]
if (!login) throw new Error('The isolated bench has no login URL')
const out = dirname(resolve(logPath))
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) })
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const api = async (endpoint, payload = {}) => {
  const result = await page.evaluate(([endpoint, payload]) => fetch('api/bot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }) }).then(response => response.json()), [endpoint, payload])
  assert.equal(result.ok, true, `${endpoint} failed`)
  return result.value
}
const entry = () => page.getByRole('button', { name: '大肥鱼', exact: true }).first()
const group = label => page.locator('.bt-ws-group').filter({ has: page.locator('.bt-ws-folder-title', { hasText: label }) })
const add = async path => {
  mkdirSync(path, { recursive: true })
  await page.getByRole('button', { name: '添加工作区', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '添加工作区', exact: true })
  await dialog.locator('input').fill(path)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.waitForTimeout(600)
}
let originalTeam
let main
try {
  await page.goto(login)
  const notice = page.getByRole('dialog').getByRole('button', { name: /^(继续|Continue)$/ })
  await page.addLocatorHandler(notice, () => notice.click())
  await page.locator('.bt-ws-browser').waitFor({ timeout: 30000 })
  const state = await api('state')
  main = state.bots.find(bot => bot.id === state.mainBotId)
  originalTeam = (await api('folders')).team
  const stamp = Date.now()
  const teamName = `empty-team-${stamp}`
  const legacyName = `empty-companion-${stamp}`
  const ordinaryName = `empty-ordinary-${stamp}`
  const teamPath = join(out, teamName)
  const legacyPath = join(out, legacyName)
  await add(teamPath)
  await add(legacyPath)
  await add(join(out, ordinaryName))
  await api('team-workspace', { path: teamPath })
  await api('update-bot', { id: main.id, workDir: legacyPath })
  await entry().click()
  await page.locator('.bt-head').waitFor()
  await group(teamName).waitFor({ state: 'detached' })
  await group(legacyName).waitFor({ state: 'detached' })
  assert.ok(await group(ordinaryName).isVisible(), 'unrelated empty workspace remains available')
  const registered = await api('folders')
  assert.equal(registered.team, teamPath)
  assert.ok(registered.folders.some(folder => folder.path === legacyPath), 'hidden workspace stays registered')
  await page.screenshot({ path: join(out, 'empty-companion-workspaces-hidden.png') })
  console.log('PASS: both empty companion workspaces hidden; unrelated empty workspace and companion chat preserved')

  // Registering the existing folder opens a native blank ordinary conversation.
  await add(legacyPath)
  await group(legacyName).waitFor()
  const row = group(legacyName).locator('.bt-ws-row').first()
  const id = await row.getAttribute('data-session-id')
  await page.locator('[data-composer-input]').fill('空工作区普通会话验收')
  await page.locator('[data-composer-input]').press('Enter')
  await page.getByText(/现在的班底|收到：空工作区普通会话验收/).last().waitFor({ timeout: 30000 })
  await entry().click()
  await page.locator('.bt-head').waitFor()
  assert.ok(await group(legacyName).isVisible(), 'a real ordinary conversation brings the workspace back')
  await row.hover()
  await row.locator('.bt-ws-row-menu').click()
  await page.getByRole('menuitem', { name: '归档会话', exact: true }).click()
  await group(legacyName).waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '工作区视图选项', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '显示已归档', exact: true }).click()
  await page.locator(`[data-session-id="${id}"]`).waitFor()
  await page.getByRole('button', { name: '工作区视图选项', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '隐藏已归档', exact: true }).click()
  await group(legacyName).waitFor({ state: 'detached' })
  console.log('PASS: selected blank, ordinary messages and archive views restore the needed folder without exposing Bot rows')
  assert.deepEqual(errors, [])
} catch (error) {
  await page.screenshot({ path: join(out, 'empty-workspace-failure.png') }).catch(() => {})
  throw error
} finally {
  if (main && originalTeam) {
    await api('update-bot', { id: main.id, workDir: main.workDir ?? '' }).catch(() => {})
    await api('team-workspace', { path: originalTeam }).catch(() => {})
  }
  await browser.close()
}
