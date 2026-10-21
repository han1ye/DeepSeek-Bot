import assert from 'node:assert/strict'
import { test } from 'node:test'
import { companionGroups, nextCompanionPart } from '../src/client/companion-navigation.js'
import { indexRoster } from '../src/client/sources.js'

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
