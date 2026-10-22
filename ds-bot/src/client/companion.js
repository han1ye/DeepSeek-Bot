import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { t } from './i18n.js'
import { BotAvatar, RoomAvatar } from './mark.js'
import { CompanionPicker } from './companion-picker.js'

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

export function CompanionTeam({ sessionId, useRoster, actions, ...hooks }) {
  const roster = useRoster(value => value)
  const bot = roster.byId[sessionId]
  const room = roster.roomsById[sessionId]
  const value = bot?.id ?? sessionId
  const anchor = useRef(null)
  const [open, setOpen] = useState(false)
  const close = useCallback((restoreFocus) => {
    setOpen(false)
    if (restoreFocus) anchor.current?.focus()
  }, [])
  useEffect(() => { setOpen(false) }, [sessionId])
  return h('div', { className: 'bt-companion-team' },
    h('button', {
      ref: anchor, type: 'button', className: 'bt-team-trigger',
      'aria-label': t('Switch companion'), title: t('Switch companion'),
      'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-controls': open ? 'bt-companion-picker' : undefined,
      onClick: () => setOpen(value => !value),
    },
    bot ? h(BotAvatar, { bot, size: 24, badge: false }) : room ? h(RoomAvatar, { room, roster, size: 24 }) : null,
    h('span', { className: 'bt-team-trigger-label' }, t('Companions')),
    h('span', { className: 'bt-team-count', 'aria-hidden': true }, roster.bots.length + roster.rooms.length)),
    h('button', { type: 'button', className: 'bt-soft bt-soft-sm bt-team-manage-inline', onClick: () => { close(false); actions.openSettings('bots') } }, t('Manage team')),
    open ? h(CompanionPicker, { anchor, roster, value, actions, close, ...hooks }) : null)
}

export const COMPANION_ENTRY_CSS = `
.bt-companion-loading{display:flex;align-items:center;justify-content:center;gap:12px;height:100%;color:inherit}
`

export const COMPANION_TEAM_CSS = `
.bt-head:has(.bt-companion-team){container-type:inline-size}
.bt-companion-team{position:absolute;left:16px;top:0;display:flex;align-items:center;gap:8px;max-width:min(40%,calc(50% - 90px));pointer-events:auto}
.bt-companion-team button{white-space:nowrap}
.bt-team-trigger{display:flex;align-items:center;gap:7px;height:36px;padding:0 10px 0 6px;border:1px solid var(--bt-line);border-radius:12px;background:var(--bt-card);color:var(--bt-ink);font:inherit;font-size:13px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:background .15s ease}
.bt-team-trigger:hover,.bt-team-trigger[aria-expanded=true]{background:var(--bt-hover)}
.bt-team-count{font-size:11px;color:var(--bt-ink-3);font-variant-numeric:tabular-nums}
.bt-team-picker{position:fixed;z-index:80;display:flex;flex-direction:column;box-sizing:border-box;padding:14px;border:1px solid var(--bt-line-2);border-radius:20px;background:var(--bt-card);color:var(--bt-ink);box-shadow:0 18px 60px rgba(0,0,0,.14),0 2px 8px rgba(0,0,0,.05);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;animation:bt-team-in .16s ease-out}
.bt-team-picker-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px 4px;font-size:15px}
.bt-team-picker-head .bt-icon-btn{width:28px;height:28px}
.bt-team-search{display:flex;align-items:center;gap:8px;flex:none;padding:9px 11px;border-radius:10px;background:var(--bt-hover);color:var(--bt-ink-3)}
.bt-team-search svg{width:15px;height:15px;flex:none}
.bt-team-search input{width:100%;min-width:0;border:0;outline:0;background:none;color:var(--bt-ink);font:inherit;font-size:13px}
.bt-team-search:focus-within{box-shadow:0 0 0 2px color-mix(in srgb,var(--bt-accent) 40%,transparent)}
.bt-team-picker-list{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;max-height:390px;padding:0 2px 2px}
.bt-team-picker h3{display:flex;align-items:center;gap:7px;margin:17px 3px 9px;font-size:12px;font-weight:500;color:var(--bt-ink-2)}
.bt-team-picker h3 span{font-size:11px;color:var(--bt-ink-3)}
.bt-team-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.bt-team-card{position:relative;display:flex;align-items:center;gap:10px;width:100%;min-width:0;min-height:76px;box-sizing:border-box;padding:12px 9px;border:1px solid transparent;border-radius:12px;background:var(--bt-hover);color:var(--bt-ink);text-align:left;font:inherit;cursor:pointer;transition:background .12s ease,border-color .12s ease}
.bt-team-card:hover{background:var(--bt-active)}
.bt-team-card[aria-current=page]{background:color-mix(in srgb,var(--bt-accent) 8%,var(--bt-card));border-color:color-mix(in srgb,var(--bt-accent) 25%,transparent)}
.bt-team-card[data-main],.bt-team-group{grid-column:1/-1}
.bt-team-group+.bt-team-group{margin-top:6px}
.bt-team-card-copy{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.bt-team-card-name,.bt-team-card-note{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-team-card-name{font-size:13px;font-weight:500;line-height:19px}
.bt-team-card-note{font-size:11px;color:var(--bt-ink-2);line-height:16px}
.bt-team-selected{position:absolute;right:7px;top:4px;color:var(--bt-accent);font-size:11px}
.bt-team-card:disabled{cursor:wait;opacity:.65}
.bt-team-manage{display:flex;align-items:center;justify-content:center;gap:7px;flex:none;margin-top:13px;padding:10px;border:0;border-top:1px solid var(--bt-line);border-radius:0 0 8px 8px;background:none;color:var(--bt-ink-2);font:inherit;font-size:12px;cursor:pointer}
.bt-team-manage svg{width:15px;height:15px}
.bt-team-manage:hover{color:var(--bt-ink);background:var(--bt-hover)}
.bt-team-picker button:focus-visible,.bt-team-trigger:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
.bt-team-empty{margin:24px 8px;text-align:center;color:var(--bt-ink-3);font-size:13px}
.bt-team-message{padding:8px 4px 0;font-size:12px;color:var(--bt-ink-2);overflow-wrap:anywhere}
.bt-team-error{color:var(--bt-danger)}
@keyframes bt-team-in{from{opacity:0;transform:translateY(-4px)}}
@container(max-width:680px){.bt-companion-team{left:8px}.bt-companion-team .bt-team-manage-inline{display:none}}
@container(max-width:440px){.bt-team-trigger-label,.bt-team-count{display:none}.bt-team-trigger{padding:0 6px}}
@media(prefers-reduced-motion:reduce){.bt-team-picker{animation:none}.bt-team-card,.bt-team-trigger{transition:none}}
`
