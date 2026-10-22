import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, DotsIcon, FolderIcon, GearIcon, PlusIcon, SearchIcon } from './icons.js'
import { relativeShort } from './text.js'
import { freePriority } from './surface.js'
import { ordinaryWorkspaceList, reorderVisible, searchWorkspaceRows, workspaceHierarchy, workspaceRows } from './workspace-list.js'
import { t } from './i18n.js'

const titleOf = row => row.blank ? t('New chat') : row.displayTitle || row.title || t('Untitled')
const workspaceTitle = workspace => !workspace ? t('Ungrouped') : workspace.title === 'default-workspace' ? t('Default workspace') : workspace.title

// Keep the original browser's public viewing store and navigation callbacks.
// We own the rendering, not its child slots or any host component implementation.
export function installWorkspaceBrowser(ctx, roster, refreshRoster) {
  const name = 'sidebar.workspaces'
  let source
  let dispose
  let ownInject
  const rowAction = (id, method, ...args) => {
    if (id === 'session-id' && method === 'copySessionId') return navigator.clipboard.writeText(args[0])
    if (id === 'fork' && method === 'forkSession') return ctx.uiWorkspace.forkSession(args[0], undefined, { allowMigration: false })
    if (id === 'pin' && ['pinSession', 'unpinSession'].includes(method)) return ctx.uiWorkspace[method](...args)
    if (id === 'archive' && ['archiveSession', 'unarchiveSession'].includes(method)) return ctx.uiWorkspace[method](...args)
    throw new Error(t('This action is unavailable. Reload DSH and try again.'))
  }
  const workspaceActions = {
    rowAction,
    refresh: refreshRoster,
    pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
    listDirectory: (path, signal) => ctx.uiWorkspace.listDirectory(path, signal),
  }
  const sync = () => {
    const entries = ctx.slots.entries(name).filter(entry => entry.inject !== ownInject)
    const next = entries.find(entry => entry.store && typeof entry.inject === 'function')
    if (next === source && dispose) return
    dispose?.()
    dispose = undefined
    source = next
    if (!source) return
    ownInject = (...args) => {
      const native = source.inject(...args)
      return { ...native, hooks: { ...native.hooks, roster }, workspaceActions }
    }
    dispose = ctx.slots.register({ name, store: source.store, inject: ownInject, priority: freePriority(entries, { priority: -100 }) }, OrdinaryWorkspaceBrowser)
  }
  const unsubscribe = ctx.slots.subscribe(name, sync)
  try { sync() } catch (error) { unsubscribe(); throw error }
  return () => { unsubscribe(); dispose?.() }
}

function Popup({ anchor, close, children, label }) {
  const ref = useRef(null)
  const [place, setPlace] = useState(null)
  useEffect(() => {
    const previous = document.activeElement
    const bounds = anchor.getBoundingClientRect()
    const menu = ref.current
    setPlace({ left: Math.max(8, Math.min(bounds.left, window.innerWidth - 248)), top: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - menu.offsetHeight - 8)) })
    menu.querySelector('button:not(:disabled)')?.focus()
    const outside = event => { if (!menu.contains(event.target) && !anchor.contains(event.target)) close() }
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); previous?.focus() }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const buttons = [...menu.querySelectorAll('button:not(:disabled)')]
        const index = buttons.indexOf(document.activeElement)
        buttons[(index + buttons.length + (event.key === 'ArrowDown' ? 1 : -1)) % buttons.length]?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); document.removeEventListener('keydown', key, true) }
  }, [anchor, close])
  return createPortal(h('div', { className: 'bt-ws-popup', ref, role: 'menu', 'aria-label': label, style: { ...place, visibility: place ? undefined : 'hidden' } }, children), document.body)
}

function WorkspaceDialog({ dialog, close, createWorkspace, renameWorkspace, deleteWorkspace, workspaceActions, startSession }) {
  const ref = useRef(null)
  const [value, setValue] = useState(dialog.workspace?.title ?? '')
  const [listing, setListing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const live = useRef(true)
  const scan = useRef(null)
  useEffect(() => {
    live.current = true
    const previous = document.activeElement
    const node = ref.current
    node.showModal()
    return () => { live.current = false; scan.current?.abort(); node.close(); previous?.focus() }
  }, [])
  const run = async task => {
    if (busy) return
    setBusy(true); setError('')
    try { await task() } catch (failure) { if (live.current) setError(failure.message ?? String(failure)) }
    finally { if (live.current) setBusy(false) }
  }
  const browse = path => run(async () => {
    scan.current?.abort()
    scan.current = new AbortController()
    const result = await workspaceActions.listDirectory(path || undefined, scan.current.signal)
    if (live.current) { setListing(result); setValue(result.path) }
  })
  const save = () => run(async () => {
    if (dialog.kind === 'archive') {
      await workspaceActions.rowAction('archive', 'archiveSession', dialog.row.id, { stopActivity: true })
      if (live.current) close()
    } else if (dialog.kind === 'add') {
      const workspace = await createWorkspace({ path: value.trim() })
      if (live.current) { close(); startSession(workspace.workspaceId) }
    } else {
      if (dialog.kind === 'rename') await renameWorkspace(dialog.workspace.workspaceId, value.trim())
      else await deleteWorkspace(dialog.workspace.workspaceId)
      if (live.current) close()
    }
  })
  const label = t(dialog.kind === 'archive' ? 'Stop and archive' : dialog.kind === 'add' ? 'Add workspace' : dialog.kind === 'rename' ? 'Rename workspace' : 'Remove workspace')
  return createPortal(h('dialog', { ref, className: 'bt-ws-dialog', 'aria-label': label, onCancel: event => { event.preventDefault(); if (!busy) close() } },
    h('h3', null, label),
    dialog.kind === 'archive' ? h('p', null, t('This conversation still has active work. Stop it and archive the conversation?'), ' ', titleOf(dialog.row))
      : dialog.kind === 'delete' ? h('p', null, t('Remove this workspace from the list? Files and conversations are kept.'))
      : h('form', { onSubmit: event => { event.preventDefault(); save() } },
        h('input', { autoFocus: true, 'aria-label': t(dialog.kind === 'add' ? 'Folder path' : 'Name'), value, disabled: busy, placeholder: dialog.kind === 'add' ? t('Full path of a folder') : '', onChange: event => setValue(event.target.value) })),
    dialog.kind === 'add' ? h('div', { className: 'bt-ws-directory' },
      h('div', { className: 'bt-ws-dialog-actions' },
        h('button', { disabled: busy, onClick: () => browse(value) }, t('Browse folders…')),
        h('button', { disabled: busy, onClick: () => run(async () => { const path = await workspaceActions.pickDirectory(); if (path && live.current) setValue(path) }) }, t('Choose a folder…'))),
      listing ? h('div', { className: 'bt-ws-folders' },
        listing.crumbs?.length > 1 ? h('button', { disabled: busy, onClick: () => browse(listing.crumbs.at(-2).path) }, t('Up one level')) : null,
        (listing.entries ?? []).filter(entry => !entry.hidden).map(entry => h('button', { key: entry.path, disabled: busy, onClick: () => browse(entry.path) }, h(FolderIcon), entry.name)),
        listing.truncated ? h('p', null, t('Some folders are not shown.')) : null) : null) : null,
    error ? h('p', { role: 'alert' }, error) : null,
    h('div', { className: 'bt-ws-dialog-actions' },
      h('button', { disabled: busy, onClick: close }, t('Cancel')),
      h('button', { disabled: busy || (['add', 'rename'].includes(dialog.kind) && !value.trim()), onClick: save }, busy ? t('Loading…') : ['delete', 'archive'].includes(dialog.kind) ? label : t('Save')))), document.body)
}

function SessionRow({ row, current, status, open, menu, drag }) {
  const name = titleOf(row)
  const state = status?.pendingInteraction ? t('Waiting for your answer') : status?.running ? t('Working') : status?.completionUnread ? t('Unread activity') : ''
  return h('div', { className: 'bt-ws-row', 'data-session-id': row.id, 'data-row-key': `session:${row.id}`, 'data-active': row.id === current || undefined, 'data-blank': row.blank || undefined, 'data-archived': row.archived || undefined, ...drag,
    onContextMenu: event => { event.preventDefault(); menu(event.currentTarget, row) } },
  h('button', { type: 'button', className: 'bt-ws-session', onClick: () => open(row), 'aria-current': row.id === current ? 'page' : undefined, title: [name, state].filter(Boolean).join(' · ') },
    h('span', { className: 'bt-ws-copy' }, h('span', null, row.pinned ? '⌖ ' : '', name), row.snippet ? h('small', null, row.snippet) : null),
    state ? h('span', { className: 'bt-ws-status', title: state, 'aria-label': state }, status?.running ? '◌' : '●') : h('time', null, relativeShort(row.updatedAt))),
  h('button', { type: 'button', className: 'bt-ws-row-menu', 'aria-label': t('Session actions for {name}', { name }), onClick: event => menu(event.currentTarget, row) }, h(DotsIcon)))
}

export function OrdinaryWorkspaceBrowser(props) {
  const { wide, expandSidebar, useSessions, useWorkspaces, useSessionStatus, useRoster, useStore, usePanelInfo, useWorkspaceShortcuts,
    actions, workspaceActions, startSession, open, searchSessions, searchResultLimit, requestSearch, requestAddWorkspace, closeAddWorkspace,
    notifyArchivedNotOpenable, insertWorkspaceBefore } = props
  const raw = useSessions(state => state)
  const workspaces = useWorkspaces(state => state)
  const roster = useRoster(state => state)
  const view = useStore(state => state)
  const statuses = useSessionStatus(state => state)
  const panel = usePanelInfo(state => state.activePanelId)
  const shortcuts = useWorkspaceShortcuts(state => state)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [remote, setRemote] = useState({ query: '', items: [], hasMore: false })
  const [menu, setMenu] = useState(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [dialog, setDialog] = useState(null)
  const [error, setError] = useState('')
  const [more, setMore] = useState({})
  const [delayed, setDelayed] = useState(false)
  const search = useRef(null)
  const request = useRef(shortcuts.searchRequest)
  const dragging = useRef(null)
  const current = panel === null ? Object.values(raw.byId).find(row => row.retainedBy?.mainView > 0)?.id : undefined
  const list = useMemo(() => ordinaryWorkspaceList(raw, workspaces.items, roster), [raw, workspaces.items, roster])
  const rows = useMemo(() => workspaceRows(list, workspaces, view, current), [list, workspaces, view, current])
  const wanted = query.trim()
  const results = searchWorkspaceRows(rows.flat, list.workspaces, wanted, remote.query === wanted ? remote : undefined, searchResultLimit)
  useEffect(() => { const timer = setTimeout(() => setDelayed(true), 8000); return () => clearTimeout(timer) }, [])
  useEffect(() => {
    if (shortcuts.searchRequest !== request.current) { request.current = shortcuts.searchRequest; expandSidebar(); setSearching(true) }
  }, [shortcuts.searchRequest])
  useEffect(() => { if (searching && wide) search.current?.focus() }, [searching, wide])
  useEffect(() => { if (shortcuts.addRequested) { expandSidebar(); setDialog({ kind: 'add' }); closeAddWorkspace() } }, [shortcuts.addRequested])
  useEffect(() => {
    if (!wanted) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const page = await searchSessions(wanted, controller.signal)
        if (!controller.signal.aborted) setRemote({ ...page, query: wanted })
      } catch (failure) {
        if (!controller.signal.aborted) setRemote({ query: wanted, items: [], hasMore: false, error: failure.message })
      }
    }, 200)
    return () => { clearTimeout(timer); controller.abort() }
  }, [wanted, searchSessions])
  // Navigation opens its group without changing the expansion of other folders.
  useEffect(() => {
    const group = rows.groups.find(item => item.rows.some(row => row.id === current))
    if (group) {
      actions.setGroupExpanded(group.key, true)
      setMore(previous => ({ ...previous, [group.key]: Math.max(previous[group.key] ?? 5, group.rows.findIndex(row => row.id === current) + 1) }))
    }
  }, [current])
  const run = task => { setError(''); void Promise.resolve().then(task).catch(failure => setError(failure.message ?? String(failure))) }
  const openRow = row => row.archived ? notifyArchivedNotOpenable() : open(row.id)
  const sessionMenu = (anchor, row) => setMenu({ anchor, row })
  const item = (label, task, disabled = false) => h('button', { key: label, type: 'button', role: 'menuitem', disabled, onClick: () => { setMenu(null); run(task) } }, label)
  const rowAction = (id, method) => workspaceActions.rowAction(id, method, menu.row.id)
  const initialOrders = Object.fromEntries([...workspaces.items.map(workspace => [workspace.workspaceId, workspace.sessionIds]), ['', raw.ids.filter(id => !workspaces.items.some(workspace => workspace.sessionIds.includes(id)))], ['__flat_session_order__', raw.ids]])
  const renderRows = (entries, key) => entries.map(row => h(SessionRow, { key: row.id, row, current, status: statuses.get(row.id), open: openRow, menu: sessionMenu,
    drag: wanted ? {} : {
      draggable: true,
      onDragStart: event => { dragging.current = { kind: 'session', key, id: row.id }; event.dataTransfer.setData('text/plain', row.id); event.dataTransfer.effectAllowed = 'move' },
      onDragEnd: () => { dragging.current = null },
      onDragOver: event => { if (dragging.current?.kind === 'session' && dragging.current.key === key) event.preventDefault() },
      onDrop: event => {
        event.preventDefault(); event.stopPropagation()
        const from = dragging.current
        dragging.current = null
        if (from?.kind !== 'session' || from.key !== key) return
        const all = key === '__flat_session_order__' ? rows.flat : rows.groups.find(group => group.key === key)?.rows ?? []
        if (all.find(candidate => candidate.id === from.id)?.pinned !== row.pinned) return
        const order = reorderVisible(view.sessionOrderByAccount?.[key] ?? initialOrders[key], initialOrders[key], all.map(candidate => candidate.id), from.id, row.id)
        actions.setSessionOrder(key, order, initialOrders)
      },
    } }))
  const renderGroup = group => {
    const label = workspaceTitle(group.workspace)
    const expanded = view.groupExpansion[group.key] !== false
    const count = more[group.key] ?? 5
    return h('section', { key: group.key, className: 'bt-ws-group', 'data-workspace-id': group.key },
      h('div', { className: 'bt-ws-folder', 'data-row-key': `workspace:${group.key}`,
        draggable: Boolean(group.workspace),
        onDragStart: event => { dragging.current = { kind: 'workspace', id: group.key }; event.dataTransfer.setData('text/plain', group.key) },
        onDragEnd: () => { dragging.current = null },
        onDragOver: event => { if (group.workspace && dragging.current?.kind === 'workspace') event.preventDefault() },
        onDrop: event => { event.preventDefault(); const from = dragging.current; dragging.current = null; if (group.workspace && from?.kind === 'workspace' && from.id !== group.key) run(() => insertWorkspaceBefore(from.id, group.key)) } },
      h('button', { className: 'bt-ws-folder-title', type: 'button', 'aria-expanded': expanded, title: group.workspace?.path, onClick: () => actions.setGroupExpanded(group.key, !expanded) },
        h(FolderIcon), h('span', null, label), h('small', { 'aria-label': t('{count} conversations', { count: group.rows.length }) }, group.rows.length || '')),
      group.workspace ? h('button', { className: 'bt-ws-row-menu', type: 'button', 'aria-label': t('Workspace actions for {name}', { name: label }), onClick: event => setMenu({ anchor: event.currentTarget, workspace: group.workspace }) }, h(DotsIcon)) : null),
      expanded ? h('div', null, renderRows(group.rows.slice(0, count), group.key),
        group.rows.length > count ? h('button', { type: 'button', className: 'bt-ws-more', onClick: () => setMore(previous => ({ ...previous, [group.key]: count + 20 })) }, t('Show {count} more', { count: group.rows.length - count })) : null,
        group.rows.length === 0 && !group.children.length ? h('p', { className: 'bt-ws-note' }, t('No conversations')) : null,
        group.children.length ? h('div', { className: 'bt-ws-nested' }, group.children.map(renderGroup)) : null) : null)
  }
  let menuItems
  if (menu?.row) {
    menuItems = menu.row.archived ? [item(t('Unarchive'), () => rowAction('archive', 'unarchiveSession'))] : [
      item(t(menu.row.pinned ? 'Unpin' : 'Pin'), () => rowAction('pin', menu.row.pinned ? 'unpinSession' : 'pinSession')),
      item(t('Rename'), () => props.requestSessionRename(menu.row.id, titleOf(menu.row))),
      item(t('Fork conversation'), () => rowAction('fork', 'forkSession')),
      item(t('Archive session'), async () => {
        try { await rowAction('archive', 'archiveSession') } catch (failure) {
          if (failure.rpcError?.code === 'workspace/session-active') setDialog({ kind: 'archive', row: menu.row })
          else throw failure
        }
      }),
    ]
    menuItems.push(item(t('Copy session ID'), () => rowAction('session-id', 'copySessionId')))
  } else if (menu?.workspace) {
    menuItems = [item(t('New chat'), () => { actions.setArchivedFilter('default'); startSession(menu.workspace.workspaceId) }),
      item(t('Rename workspace'), () => setDialog({ kind: 'rename', workspace: menu.workspace })), item(t('Remove workspace'), () => setDialog({ kind: 'delete', workspace: menu.workspace }))]
  } else if (menu) {
    const option = (key, label, selected, action) => h('button', { key, role: 'menuitemradio', 'aria-checked': selected, onClick: () => { action(); setMenu(null) } }, h('span', null, label), selected ? '✓' : '')
    menuItems = [
      ...[['workspace', 'Group by workspace'], ['workspace-tree', 'Workspace tree'], ['flat', 'All conversations']].map(([key, label]) => option(key, t(label), view.groupBy === key, () => actions.setGroupBy(key))),
      h('hr', { key: 'order' }),
      ...[['updated', 'Most recent first'], ['manual', 'Manual order']].map(([key, label]) => option(key, t(label), view.orderBy === key, () => actions.setOrderBy(key, initialOrders))),
      h('hr', { key: 'archive' }),
      ...[['default', 'Hide archived'], ['show', 'Show archived'], ['only', 'Archived only']].map(([key, label]) => option(key, t(label), (view.archivedFilter ?? 'default') === key, () => actions.setArchivedFilter(key))),
    ]
  }
  return h('div', { className: 'bt-ws-browser', 'data-wide': wide, 'aria-label': t('Ordinary conversations') },
    h('header', null,
      wide && !searching ? h('span', { className: 'bt-ws-heading' }, t('Workspaces')) : null,
      wide && searching ? h('input', { ref: search, type: 'search', 'aria-label': t('Search ordinary conversations'), placeholder: t('Search conversations'), value: query, onChange: event => setQuery(event.target.value), onKeyDown: event => { if (event.key === 'Escape') { setQuery(''); setSearching(false) } } }) : null,
      h('button', { type: 'button', 'aria-label': t(searching ? 'Close search' : 'Search conversations'), onClick: () => { if (searching) { setQuery(''); setSearching(false) } else requestSearch() } }, h(searching ? CloseIcon : SearchIcon)),
      !searching ? h('button', { type: 'button', 'aria-label': t('Workspace view options'), onClick: event => { if (!wide) expandSidebar(); setMenu({ anchor: event.currentTarget }) } }, h(GearIcon)) : null,
      !searching ? h('button', { type: 'button', 'aria-label': t('Add workspace'), onClick: requestAddWorkspace }, h(PlusIcon)) : null),
    wide ? h('div', { className: 'bt-ws-list' },
      !roster.ready || raw.phase !== 'ready' || workspaces.phase !== 'ready' ? h('div', { className: 'bt-ws-note', role: 'status' }, t('Loading…'), delayed ? h('button', { onClick: () => run(workspaceActions.refresh) }, t('Retry')) : null)
        : wanted ? h('div', { 'data-workspace-search': true }, renderRows(results.items, ''),
          results.items.length === 0 ? h('p', { className: 'bt-ws-note' }, t(remote.query !== wanted ? 'Searching…' : 'No matching conversations')) : null,
          results.hasMore ? h('p', { className: 'bt-ws-note' }, t('Content search is limited. Refine your query for more results.')) : null,
          remote.query === wanted && remote.error ? h('p', { className: 'bt-ws-note', role: 'alert' }, t('Content search failed; showing title matches.'), ' ', remote.error) : null)
          : view.groupBy === 'flat' ? renderRows(rows.flat.slice(0, more.flat ?? 40), '__flat_session_order__').concat(rows.flat.length > (more.flat ?? 40) ? h('button', { key: 'more', className: 'bt-ws-more', onClick: () => setMore(previous => ({ ...previous, flat: (previous.flat ?? 40) + 40 })) }, t('Show {count} more', { count: rows.flat.length - (more.flat ?? 40) })) : [])
            : workspaceHierarchy(rows.groups, view.groupBy === 'workspace-tree').map(renderGroup),
      error ? h('p', { className: 'bt-ws-note', role: 'alert' }, error) : null) : null,
    menu ? h(Popup, { anchor: menu.anchor, close: closeMenu, label: t('Workspace actions') }, menuItems) : null,
    dialog ? h(WorkspaceDialog, { key: `${dialog.kind}:${dialog.workspace?.workspaceId ?? ''}`, ...props, dialog, close: () => setDialog(null) }) : null)
}

export const WORKSPACE_BROWSER_CSS = `
.bt-ws-browser{display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);font-size:14px}
.bt-ws-browser button,.bt-ws-popup button,.bt-ws-dialog button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer}
.bt-ws-browser button:focus-visible,.bt-ws-popup button:focus-visible,.bt-ws-dialog :focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:-2px}
.bt-ws-browser header{display:flex;align-items:center;gap:3px;padding:18px 16px 12px;flex-shrink:0;color:var(--dsw-alias-label-tertiary)}
.bt-ws-browser header>button{display:grid;place-items:center;width:29px;height:30px;border-radius:8px;flex-shrink:0}
.bt-ws-heading{flex:1}.bt-ws-browser input{min-width:0;width:100%;border:1px solid var(--dsw-alias-border-l4);border-radius:8px;padding:7px;background:transparent;color:inherit;font:inherit}
.bt-ws-list{flex:1;overflow:auto;min-height:0;padding:0 10px 20px;scrollbar-width:thin}.bt-ws-group{margin:8px 0}.bt-ws-folder{display:flex;align-items:center;min-height:38px}
.bt-ws-folder-title{display:flex;align-items:center;gap:8px;text-align:left;min-width:0;flex:1;padding:8px 10px}.bt-ws-folder-title>span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-ws-folder-title small{font-size:11px;opacity:.5}
.bt-ws-row{position:relative;border-radius:10px;display:flex;align-items:center;min-height:36px;margin:2px 0}.bt-ws-row[data-active]{background:var(--dsw-alias-interactive-bg-hover)}
.bt-ws-row:hover,.bt-ws-folder:hover,.bt-ws-browser header>button:hover,.bt-ws-popup button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.bt-ws-session{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:9px 12px 9px 30px;text-align:left}.bt-ws-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}.bt-ws-copy>span,.bt-ws-copy>small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-ws-copy>small{opacity:.6;font-size:11px}
.bt-ws-row time{font-size:11px;opacity:.5;white-space:nowrap}.bt-ws-row[data-archived]{opacity:.6}.bt-ws-status{color:var(--dsw-alias-state-business-primary);font-size:12px}
.bt-ws-row-menu{width:28px;height:28px;display:grid;place-items:center;flex-shrink:0;border-radius:6px!important}.bt-ws-row>.bt-ws-row-menu{position:absolute;right:6px;opacity:0;background:var(--dsw-alias-button-elevated-fill)}
.bt-ws-row:hover>.bt-ws-row-menu,.bt-ws-row:focus-within>.bt-ws-row-menu{opacity:1}.bt-ws-row:hover time,.bt-ws-row:focus-within time{visibility:hidden}
.bt-ws-nested{margin-left:12px;border-left:1px solid var(--dsw-alias-border-l4)}.bt-ws-more{font-size:12px!important;opacity:.6;padding:8px 30px}.bt-ws-note{font-size:12px;opacity:.65;padding:5px 26px;line-height:1.6}.bt-ws-note button{margin-left:8px;text-decoration:underline}
.bt-ws-browser[data-wide=false] header{flex-direction:column;padding:12px 0}.bt-ws-popup{position:fixed;z-index:600;width:240px;padding:6px;border-radius:12px;border:1px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);box-shadow:0 8px 32px rgba(0,0,0,.12);font:13px/1.5 system-ui}
.bt-ws-popup button{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;padding:8px 12px;width:100%;border-radius:6px}.bt-ws-popup hr{border:0;border-top:1px solid var(--dsw-alias-border-l4);margin:5px}
.bt-ws-dialog{width:min(460px,calc(100vw - 40px));padding:24px;border:1px solid var(--dsw-alias-border-l4);border-radius:16px;background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);font:14px/1.6 system-ui}.bt-ws-dialog::backdrop{background:rgba(0,0,0,.25)}.bt-ws-dialog h3{margin:0 0 16px}.bt-ws-dialog input{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l4);background:transparent;color:inherit;border-radius:8px;padding:9px;font:inherit}.bt-ws-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.bt-ws-dialog button{padding:7px 12px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover)}.bt-ws-dialog button:disabled{opacity:.4;cursor:wait}.bt-ws-folders{max-height:240px;overflow:auto;display:flex;flex-direction:column;gap:4px;margin-top:12px}.bt-ws-folders button{display:flex;gap:8px;align-items:center;text-align:left}.bt-ws-dialog [role=alert]{color:var(--dsw-alias-state-error-primary)}
`
