import { currentPart } from './text.js'

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
