// Presentation only: never write this projection back to the Session catalog or
// Workspace membership. In particular, hidden parts must keep their saved order.
export function companionSessionIds(roster) {
  const ids = new Set()
  const add = id => { if (typeof id === 'string' && id) ids.add(id) }
  for (const bot of roster.bots ?? []) {
    add(bot.id)
    add(bot.sessionId)
    for (const id of bot.parts ?? []) add(id)
  }
  for (const room of roster.rooms ?? []) {
    add(room.id)
    for (const id of room.parts ?? []) add(id)
  }
  return ids
}

// Host paths can use either separator on Windows; keep POSIX case-sensitive.
const folderKey = path => {
  if (typeof path !== 'string' || !path) return ''
  const key = path.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
  return /^[a-z]:(?:\/|$)/i.test(key) || key.startsWith('//') ? key.toLowerCase() : key
}

export function companionWorkspaceIds(list, workspaces, roster, owned = companionSessionIds(roster)) {
  const folders = new Set([...(roster.bots ?? []), ...(roster.rooms ?? [])].map(item => folderKey(item.workDir)).filter(Boolean))
  // A Bot's effective cwd also identifies its registered folder when its custom
  // directory was cleared, or when the folder came from an earlier companion.
  for (const id of owned) {
    const cwd = folderKey(list.byId[id]?.cwd)
    if (cwd) folders.add(cwd)
  }
  return new Set(workspaces.filter(workspace => workspace.workspaceId === roster.workspaceId
    || folders.has(folderKey(workspace.path)) || workspace.sessionIds.some(id => owned.has(id))).map(workspace => workspace.workspaceId))
}

export function ordinaryWorkspaceList(list, workspaces, roster) {
  const hidden = companionSessionIds(roster)
  const ids = roster.ready ? (list.ids ?? []).filter(id => !hidden.has(id) && list.byId[id]?.origin !== 'subagent') : []
  const visible = new Set(ids)
  return {
    ...list, ids, byId: Object.fromEntries(ids.map(id => [id, list.byId[id]]).filter(([, row]) => row)),
    companionWorkspaceIds: companionWorkspaceIds(list, workspaces, roster, hidden),
    workspaces: workspaces.map(workspace => ({ ...workspace, sessionIds: workspace.sessionIds.filter(id => visible.has(id)) })),
  }
}

export function workspaceRows(list, workspaceState, view, current) {
  const archived = new Set(workspaceState.archivedSessionIds)
  const pinned = new Set(workspaceState.pinnedSessionIds)
  const filter = view.archivedFilter ?? 'default'
  const visible = id => {
    const row = list.byId[id]
    return row && (!row.blank || id === current) && (filter === 'show' || archived.has(id) === (filter === 'only'))
  }
  const order = (ids, key) => {
    const saved = view.sessionOrderByAccount?.[key] ?? []
    const recency = [...ids].sort((a, b) => (list.byId[b]?.updatedAt ?? 0) - (list.byId[a]?.updatedAt ?? 0) || a.localeCompare(b))
    const base = view.orderBy === 'manual' ? [...saved.filter(id => ids.includes(id)), ...recency.filter(id => !saved.includes(id))] : recency
    return base.filter(visible).map(id => ({ ...list.byId[id], archived: archived.has(id), pinned: pinned.has(id) }))
      .sort((a, b) => Number(b.id === current && b.blank) - Number(a.id === current && a.blank) || Number(b.pinned) - Number(a.pinned))
  }
  const accounted = new Set(list.workspaces.flatMap(workspace => workspace.sessionIds))
  const groups = list.workspaces.map(workspace => ({ key: workspace.workspaceId, workspace, rows: order(workspace.sessionIds, workspace.workspaceId) }))
    .filter(group => group.rows.length > 0 || !list.companionWorkspaceIds?.has(group.key))
  const stray = order(list.ids.filter(id => !accounted.has(id)), '')
  if (stray.length) groups.push({ key: '', rows: stray })
  return { groups: filter === 'only' ? groups.filter(group => group.rows.length) : groups, flat: order(list.ids, '__flat_session_order__') }
}

export function searchWorkspaceRows(rows, workspaces, query, remote = { items: [], hasMore: false }, limit = 20) {
  const wanted = query.trim().toLocaleLowerCase()
  const workspaceOf = new Map(workspaces.flatMap(workspace => workspace.sessionIds.map(id => [id, workspace])))
  const byId = new Map(rows.map(row => [row.id, row]))
  const hits = new Map()
  for (const row of [...rows].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const workspace = workspaceOf.get(row.id)
    if (`${row.displayTitle ?? row.title ?? ''} ${workspace?.title ?? ''} ${workspace?.path ?? workspace?.cwd ?? ''}`.toLocaleLowerCase().includes(wanted)) hits.set(row.id, row)
  }
  for (const item of remote.items) {
    const row = byId.get(item.sessionId)
    if (row) hits.set(row.id, { ...row, snippet: item.snippet })
  }
  // The public host search is bounded and has no cursor. Preserve its refine-query
  // hint; do not claim that a filtered page is an exhaustive content search.
  return { items: [...hits.values()].slice(0, limit), hasMore: remote.hasMore || hits.size > limit }
}

export function workspaceHierarchy(groups, nested) {
  if (!nested) return groups.map(group => ({ ...group, children: [] }))
  const nodes = groups.map(group => ({ ...group, children: [] }))
  const pathOf = node => (node.workspace?.path ?? node.workspace?.cwd ?? '').replace(/\\/g, '/').replace(/\/$/, '')
  const roots = []
  for (const node of nodes) {
    const path = pathOf(node)
    const parent = path ? nodes.filter(other => other !== node && pathOf(other) && path.startsWith(`${pathOf(other)}/`)).sort((a, b) => pathOf(b).length - pathOf(a).length)[0] : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

// Keep non-displayed ids in their slots when a visible ordinary row is reordered.
export function reorderVisible(saved, members, visible, from, before) {
  if (!visible.includes(from) || !visible.includes(before) || from === before) return saved
  const order = visible.filter(id => id !== from)
  order.splice(order.indexOf(before), 0, from)
  const base = [...new Set([...saved.filter(id => members.includes(id)), ...members])]
  let cursor = 0
  return base.map(id => visible.includes(id) ? order[cursor++] : id)
}
