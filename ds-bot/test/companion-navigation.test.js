import assert from 'node:assert/strict'
import { test } from 'node:test'
import { companionGroups, nextCompanionPart, companionOpener } from '../src/client/companion-navigation.js'
import { indexRoster, createSource } from '../src/client/sources.js'

const bot = { id: 'chief', sessionId: 'part-2', parts: ['chief'] }
const roster = indexRoster({ bots: [bot], rooms: [{ id: 'group' }], agents: [{ id: 'agent', sessions: ['plain'] }] })

test('only a visible owned conversation mounts companion components', () => {
  for (const id of ['chief', 'part-2', 'group']) {
    assert.deepEqual(companionGroups(roster, id, null), { shell: true, conversation: true })
  }
  for (const id of ['plain', 'ordinary', undefined]) {
    assert.deepEqual(companionGroups(roster, id, null), { shell: false, conversation: false })
  }
  assert.equal(companionGroups({ ...roster, ready: false }, 'chief', null).conversation, false)
})

test('Plugins and other main panels never inherit the retained Bot conversation skin', () => {
  for (const panel of ['plugins', 'schedules', 'ds-bot-companion']) {
    assert.deepEqual(companionGroups(roster, 'chief', panel), { shell: false, conversation: false })
  }
  assert.equal(companionGroups(roster, 'chief', null).conversation, true)
})

test('rollover follows the current part only for the same Bot', () => {
  assert.equal(nextCompanionPart(roster, 'chief'), 'part-2')
  for (const id of ['part-2', 'group', 'plain', 'ordinary', undefined]) {
    assert.equal(nextCompanionPart(roster, id), null)
  }
})

const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
function openerRig({ archived = ['chief', 'part-2'], ...options } = {}) {
  const source = createSource(roster)
  const list = createSource({ byId: { 'part-2': {}, group: {} } })
  const spaces = createSource({ phase: 'ready', archivedSessionIds: archived })
  const opened = [], restored = [], details = []
  let navigation = new AbortController()
  const layout = { beginNavigation: () => { navigation.abort(); navigation = new AbortController(); return navigation.signal } }
  const workspaces = { list: spaces, unarchiveSession: async id => {
    restored.push(id)
    spaces.set(value => ({ ...value, archivedSessionIds: value.archivedSessionIds.filter(item => item !== id) }))
  } }
  const sessions = { list, refresh: async () => {} }
  const navigator = companionOpener({ roster: source, sessions, workspaces, layout, open: id => {
    assert.ok(!spaces.getSnapshot().archivedSessionIds.includes(id), 'never retain an archived mainView')
    opened.push(id)
    layout.beginNavigation()
  }, ...options })
  return { navigator, source, sessions, workspaces, spaces, opened, restored, details, layout, options: { onOpened: id => details.push(id) } }
}

test('an explicit visit restores only the current Bot part before opening it once', async () => {
  const rig = openerRig()
  assert.equal(await rig.navigator.open('chief', rig.options), 'part-2')
  assert.deepEqual(rig.restored, ['part-2'])
  assert.deepEqual(rig.opened, ['part-2'])
  assert.deepEqual(rig.details, ['part-2'])
  assert.deepEqual(rig.spaces.getSnapshot().archivedSessionIds, ['chief'])
  await rig.navigator.open('chief')
  assert.deepEqual(rig.restored, ['part-2'], 'a normal revisit does not change archive state')
  rig.navigator.dispose()
})

test('archived groups resume through the same path; rollover never unarchives a chat', async () => {
  const rig = openerRig({ archived: ['group', 'part-2'] })
  assert.equal(await rig.navigator.open('part-2', { restore: false }), null)
  assert.deepEqual(rig.restored, [])
  assert.equal(await rig.navigator.open('group'), 'group')
  assert.deepEqual(rig.restored, ['group'])
  rig.navigator.dispose()
})

test('a native navigation during restoration suppresses the late open and details', async () => {
  const rig = openerRig()
  const gate = deferred()
  const restore = rig.workspaces.unarchiveSession
  rig.workspaces.unarchiveSession = async id => { await gate.promise; await restore(id) }
  const opening = rig.navigator.open('chief', rig.options)
  await Promise.resolve()
  rig.layout.beginNavigation()
  assert.equal(await opening, null)
  gate.resolve()
  await Promise.resolve()
  assert.deepEqual(rig.opened, [])
  assert.deepEqual(rig.details, [])
  rig.navigator.dispose()
})

test('restoration failures remain retryable and never open an archived chat', async () => {
  const rig = openerRig()
  const restore = rig.workspaces.unarchiveSession
  rig.workspaces.unarchiveSession = async () => { throw new Error('offline') }
  await assert.rejects(rig.navigator.open('chief'), /offline/)
  assert.deepEqual(rig.opened, [])
  rig.workspaces.unarchiveSession = restore
  assert.equal(await rig.navigator.open('chief'), 'part-2')
  rig.navigator.dispose()
})

test('a restoration that is superseded synchronously still consumes its late failure', async () => {
  const rig = openerRig()
  rig.workspaces.unarchiveSession = () => {
    rig.layout.beginNavigation()
    return Promise.reject(new Error('superseded restoration failed'))
  }
  assert.equal(await rig.navigator.open('chief'), null)
  assert.deepEqual(rig.opened, [])
  rig.navigator.dispose()
})

test('wait for archive projection readiness and resolve a rollover during that wait', async () => {
  const rig = openerRig()
  rig.spaces.set({ phase: 'pending', archivedSessionIds: [] })
  const opening = rig.navigator.open('chief')
  await Promise.resolve()
  assert.deepEqual(rig.opened, [])
  rig.source.set(indexRoster({ bots: [{ ...bot, sessionId: 'part-3' }], rooms: [] }))
  rig.sessions.list.set({ byId: { 'part-3': {} } })
  rig.spaces.set({ phase: 'ready', archivedSessionIds: ['chief', 'part-2'] })
  assert.equal(await opening, 'part-3')
  assert.deepEqual(rig.restored, [])
  rig.navigator.dispose()
})

test('refresh a new current part and reject missing/deleted or ordinary targets', async () => {
  const rig = openerRig({ archived: [] })
  rig.sessions.list.set({ byId: {} })
  let refreshes = 0
  rig.sessions.refresh = async () => { refreshes++; rig.sessions.list.set({ byId: { 'part-2': {} } }) }
  await rig.navigator.open('chief')
  assert.equal(refreshes, 1)
  await assert.rejects(rig.navigator.open('ordinary'), /unavailable/)
  rig.source.set(indexRoster({ bots: [], rooms: [] }))
  await assert.rejects(rig.navigator.open('chief'), /unavailable/)
  assert.deepEqual(rig.opened, ['part-2'])
  rig.navigator.dispose()
})

test('a stuck baseline times out, and plugin disposal cancels its pending opening', async () => {
  const rig = openerRig({ timeoutMs: 15 })
  rig.spaces.set({ phase: 'pending', archivedSessionIds: [] })
  const hold = setTimeout(() => {}, 100)
  try { await assert.rejects(rig.navigator.open('chief'), /did not become ready/) } finally { clearTimeout(hold) }
  const opening = rig.navigator.open('chief')
  rig.navigator.dispose()
  assert.equal(await opening, null)
  assert.deepEqual(rig.opened, [])
})
