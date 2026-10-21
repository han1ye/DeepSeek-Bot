import { createElement as h, useEffect, useRef, useState } from 'react'
import { t } from './i18n.js'

export const COMPANION_PANEL = 'ds-bot-companion'
export const COMPANION_NAME = '大肥鱼'

export function CompanionIcon() {
  return h('span', { 'aria-hidden': true }, '🐳')
}

export function CompanionLanding({ useRoster, actions }) {
  const roster = useRoster(value => value)
  const opened = useRef(false)
  const [error, setError] = useState('')
  const open = () => {
    if (!roster.ready || !roster.mainBotId) return
    opened.current = true
    setError('')
    Promise.resolve().then(() => actions.openCompanion(roster.mainBotId)).catch(failure => {
      opened.current = false
      setError(failure?.message ?? String(failure))
    })
  }
  useEffect(() => { if (!opened.current) open() }, [roster.ready, roster.mainBotId])
  return h('div', { className: 'bt-companion-loading', role: error ? 'alert' : 'status' },
    error || t('Opening your companion…'),
    error ? h('button', { type: 'button', onClick: open }, t('Try again')) : null)
}

export function CompanionTeam({ sessionId, useRoster, actions }) {
  const roster = useRoster(value => value)
  const bot = roster.byId[sessionId]
  const value = bot?.id ?? sessionId
  return h('div', { className: 'bt-companion-team' },
    h('select', {
      'aria-label': t('Bot team'), value,
      onChange: event => actions.openCompanion(event.target.value),
    },
    h('optgroup', { label: t('Bots') }, roster.bots.map(member => h('option', { key: member.id, value: member.id }, member.name))),
    roster.rooms.length ? h('optgroup', { label: t('Group chats') }, roster.rooms.map(room => h('option', { key: room.id, value: room.id }, room.name))) : null),
    h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => actions.openSettings('bots') }, t('Manage team')))
}

export const COMPANION_ENTRY_CSS = `
.bt-companion-loading{display:flex;align-items:center;justify-content:center;gap:12px;height:100%;color:inherit}
`

export const COMPANION_TEAM_CSS = `
.bt-head:has(.bt-companion-team){container-type:inline-size}
.bt-companion-team{position:absolute;left:16px;top:0;display:flex;align-items:center;gap:8px;max-width:min(40%,calc(50% - 90px));pointer-events:auto}
.bt-companion-team select{min-width:0;max-width:160px;height:32px;border:1px solid var(--bt-line);border-radius:8px;padding:0 8px;background:var(--bt-card);color:var(--bt-ink);font:inherit;font-size:13px}
.bt-companion-team button{white-space:nowrap}
@container(max-width:680px){.bt-companion-team{left:8px}.bt-companion-team button{display:none}}
`
