import { currentPart } from './text.js'
import { t } from './i18n.js'

// Main panels retain the last conversation behind them; that does not make it
// visible or authorize its UI to replace the panel's native controls.
export function companionGroups(roster, sessionId, panelId) {
  const active = panelId === null && roster.ready === true
    && Boolean(roster.byId[sessionId] || roster.roomsById[sessionId])
  return { shell: active, conversation: active }
}

export function nextCompanionPart(roster, sessionId) {
  const bot = roster.byId[sessionId]
  const next = bot && currentPart(bot)
  return next && next !== sessionId ? next : null
}

function cancellable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason) }
    Promise.resolve(promise).then(value => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) reject(signal.reason)
      else resolve(value)
    }, error => { signal.removeEventListener('abort', abort); reject(error) })
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

function waitFor(source, ready, signal) {
  return new Promise((resolve, reject) => {
    let off = () => {}
    const finish = (error) => {
      off()
      signal.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve()
    }
    const abort = () => finish(signal.reason)
    const check = () => { if (ready(source.getSnapshot())) finish() }
    if (signal.aborted) { abort(); return }
    off = source.subscribe(check)
    signal.addEventListener('abort', abort, { once: true })
    check()
  })
}

// DSH refuses to keep an archived Session as mainView. Resolve the identity first,
// restore only its current part on an explicit visit, then commit navigation once.
// The layout's signal lets a later native navigation win even during restoration.
export function companionOpener({ roster, sessions, workspaces, layout, open, timeoutMs = 15000 }) {
  const lifetime = new AbortController()
  return {
    dispose: () => lifetime.abort(),
    async open(id, { restore = true, onOpened } = {}) {
      const navigation = layout.beginNavigation()
      const deadline = AbortSignal.timeout(timeoutMs)
      const signal = AbortSignal.any([lifetime.signal, navigation, deadline])
      try {
        await waitFor(workspaces.list, snapshot => snapshot.phase === 'ready', signal)
        // A rollover may arrive while the catalog or archive echo is in flight.
        for (;;) {
          signal.throwIfAborted()
          const snapshot = roster.getSnapshot()
          const bot = snapshot.byId[id]
          const target = bot ? currentPart(bot) : snapshot.roomsById[id]?.id
          if (!target) throw new Error(t('This conversation is unavailable. Refresh the team and try again.'))
          if (!sessions.list.getSnapshot().byId?.[target]) {
            await cancellable(sessions.refresh(), signal)
            if (!sessions.list.getSnapshot().byId?.[target]) throw new Error(t('This conversation is unavailable. Refresh the team and try again.'))
          }
          const archived = () => workspaces.list.getSnapshot().archivedSessionIds.includes(target)
          if (archived()) {
            if (!restore) return null
            await cancellable(workspaces.unarchiveSession(target), signal)
            await waitFor(workspaces.list, () => !archived(), signal)
          }
          signal.throwIfAborted()
          const latest = roster.getSnapshot()
          const current = latest.byId[id] ? currentPart(latest.byId[id]) : latest.roomsById[id]?.id
          if (current !== target) continue
          open(target)
          // openSession itself completes (and aborts) the pending navigation.
          onOpened?.(target)
          return target
        }
      } catch (error) {
        if (lifetime.signal.aborted || navigation.aborted) return null
        if (deadline.aborted) throw new Error(t('The conversation did not become ready. Please try again.'))
        throw error
      }
    },
  }
}
