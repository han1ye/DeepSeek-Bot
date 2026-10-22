import test from 'node:test'
import assert from 'node:assert/strict'
import { companionSessionIds, ordinaryWorkspaceList, reorderVisible, searchWorkspaceRows, workspaceHierarchy, workspaceRows } from '../src/client/workspace-list.js'

const row = (id, extra = {}) => ({ id, displayTitle: 'Chief', blank: false, updatedAt: 10, retainedBy: {}, ...extra })
const roster = { ready: true, bots: [{ id: 'bot', sessionId: 'current', parts: ['old', 'current'] }], rooms: [{ id: 'group', parts: ['worker', 'past-worker'] }], agents: [{ sessions: ['agent'] }] }
const make = () => {
  const ids = ['bot', 'current', 'old', 'group', 'worker', 'past-worker', 'ordinary', 'agent', 'fork', 'subagent', 'stray', 'blank', 'selected-blank', 'archived']
  const list = { ids, byId: Object.fromEntries(ids.map(id => [id, row(id)])), phase: 'ready' }
  list.byId.subagent.origin = 'subagent'
  list.byId.fork.parentId = 'ordinary'
  list.byId.blank.blank = true
  list.byId['selected-blank'].blank = true
  const workspace = { workspaceId: 'mixed', title: 'DS Bot', path: '/test/team', sessionIds: ids.filter(id => id !== 'stray' && id !== 'worker') }
  const state = { items: [workspace], archivedSessionIds: ['old', 'past-worker', 'archived'], pinnedSessionIds: ['current', 'ordinary'] }
  return { list, state, view: { groupBy: 'workspace', orderBy: 'updated', groupExpansion: {}, sessionOrderByAccount: {} } }
}

test('ownership covers private rollover parts, group relay and member parts, not ordinary agents', () => {
  assert.deepEqual([...companionSessionIds(roster)], ['bot', 'current', 'old', 'group', 'worker', 'past-worker'])
})

test('projection hides owned rows everywhere without mutating membership, archives, pins or catalog', () => {
  const { list, state } = make()
  const before = structuredClone({ list, state, roster })
  const result = ordinaryWorkspaceList(list, state.items, roster)
  assert.deepEqual(result.ids, ['ordinary', 'agent', 'fork', 'stray', 'blank', 'selected-blank', 'archived'])
  assert.equal(result.workspaces[0].title, 'DS Bot')
  assert.ok(result.workspaces[0].sessionIds.includes('ordinary'))
  assert.equal(result.byId.worker, undefined)
  assert.deepEqual({ list, state, roster }, before)
})

test('no unclassified rows appear before initial roster, and empty Bot folders keep ordinary workspace actions', () => {
  const { list, state } = make()
  const pending = ordinaryWorkspaceList(list, state.items, { ready: false })
  assert.equal(pending.ids.length, 0)
  const empty = ordinaryWorkspaceList(list, [{ ...state.items[0], sessionIds: ['bot', 'old'] }], roster)
  assert.equal(empty.workspaces.length, 1)
  assert.deepEqual(empty.workspaces[0].sessionIds, [])
})

test('counts, flat view, ungrouped and archive filters derive from ordinary rows only', () => {
  const { list, state, view } = make()
  const filtered = ordinaryWorkspaceList(list, state.items, roster)
  const result = workspaceRows(filtered, state, view, 'selected-blank')
  assert.deepEqual(result.groups.map(group => [group.key, group.rows.length]), [['mixed', 4], ['', 1]])
  assert.equal(result.flat.length, 5)
  assert.equal(result.flat[0].id, 'selected-blank')
  assert.equal(result.flat[1].id, 'ordinary')
  const only = workspaceRows(filtered, state, { ...view, archivedFilter: 'only' })
  assert.deepEqual(only.flat.map(row => row.id), ['archived'])
  const all = workspaceRows(filtered, state, { ...view, archivedFilter: 'show' })
  assert.equal(all.flat.length, 5)
  assert.ok(all.flat.every(row => !companionSessionIds(roster).has(row.id)))
})

test('search filters title and content matches before deduplication and the result limit', () => {
  const { list, state, view } = make()
  const filtered = ordinaryWorkspaceList(list, state.items, roster)
  const rows = workspaceRows(filtered, state, view).flat
  const remote = { items: ['current', 'worker', 'old', 'group', 'ordinary', 'ordinary', 'archived'].map(sessionId => ({ sessionId, snippet: 'needle' })), hasMore: false }
  assert.deepEqual(searchWorkspaceRows(rows, filtered.workspaces, 'needle', remote, 1).items.map(row => row.id), ['ordinary'])
  assert.equal(searchWorkspaceRows(rows, filtered.workspaces, 'needle', remote, 1).hasMore, false)
  assert.equal(searchWorkspaceRows(rows, filtered.workspaces, 'needle', { ...remote, hasMore: true }).hasMore, true)
  assert.equal(searchWorkspaceRows(rows, filtered.workspaces, 'Chief').items.length, 4)
  assert.equal(searchWorkspaceRows(rows, filtered.workspaces, 'DS Bot').items.length, 3)
})

test('rollover and later group-worker roster updates withdraw newly owned rows', () => {
  const { list, state } = make()
  const next = { ...roster, bots: [{ id: 'bot', sessionId: 'stray', parts: ['old', 'current', 'stray'] }], rooms: [{ id: 'group', parts: ['worker', 'past-worker', 'fork'] }] }
  assert.equal(ordinaryWorkspaceList(list, state.items, next).byId.stray, undefined)
  assert.equal(ordinaryWorkspaceList(list, state.items, next).byId.fork, undefined)
  assert.ok(ordinaryWorkspaceList(list, state.items, next).byId.ordinary)
})

test('reordering ordinary rows preserves hidden parts in saved positions', () => {
  const members = ['ordinary', 'bot', 'agent', 'old', 'fork']
  assert.deepEqual(reorderVisible(members, members, ['ordinary', 'agent', 'fork'], 'fork', 'ordinary'), ['fork', 'bot', 'ordinary', 'old', 'agent'])
  assert.deepEqual(members, ['ordinary', 'bot', 'agent', 'old', 'fork'])
})

test('workspace nesting keeps all groups and does not mistake path prefixes for parents', () => {
  const groups = ['D:\\team', 'D:\\team\\child', 'D:\\teammate'].map((path, key) => ({ key, workspace: { path }, rows: [] }))
  const nested = workspaceHierarchy(groups, true)
  assert.equal(nested.length, 2)
  assert.equal(nested[0].children[0].key, 1)
  assert.equal(workspaceHierarchy(groups, false).length, 3)
})
