import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BotAvatar, RoomAvatar, botState } from './mark.js'
import { CloseIcon, SearchIcon, GearIcon } from './icons.js'
import { isMainOf } from './sources.js'
import { currentPart } from './text.js'
import { useEscape } from './overlay-hooks.js'
import { t } from './i18n.js'

const emptyWork = select => select({})

function BotChoice({ bot, roster, active, choose, pending, useSessionStatus, useActivity, useWork = emptyWork }) {
  const part = currentPart(bot)
  const running = useSessionStatus(map => map.get(part)?.running === true)
  const unread = useSessionStatus(map => map.get(part)?.completionUnread === true)
  const doing = useActivity(map => map[bot.id])
  const approval = useWork(work => (work.approvals ?? []).some(item => item.botId === bot.id))
  const groupWork = useWork(work => Object.values(work.rooms ?? {}).some(entries => entries.some(item => item.botId === bot.id)))
  const state = botState(running || groupWork, doing, approval || roster.questions?.[part] !== undefined)
  const main = isMainOf(roster, bot.id) || roster.mainBotId === bot.id
  const status = approval ? t('Waiting for your approval') : state === 'alert' ? t('Waiting for your answer')
    : running || groupWork ? t('Working') : state === 'waiting' ? t('Waiting for teammates') : bot.role || (main ? t('Main Bot') : t('Bot'))
  return h('button', {
    type: 'button', className: 'bt-team-card', 'data-picker-choice': bot.id,
    'data-main': main || undefined, 'aria-current': active ? 'page' : undefined,
    'aria-label': `${bot.name}, ${status}`, disabled: Boolean(pending), onClick: () => choose(bot.id),
  },
  h(BotAvatar, { bot, size: 38, state, main }),
  h('span', { className: 'bt-team-card-copy' },
    h('span', { className: 'bt-team-card-name' }, bot.name),
    h('span', { className: 'bt-team-card-note' }, status)),
  active ? h('span', { className: 'bt-team-selected', 'aria-hidden': true }, '✓')
    : unread ? h('span', { className: 'bt-unread', role: 'img', 'aria-label': t('Unread activity') }) : null)
}

function GroupChoice({ room, roster, active, choose, pending, useWork = emptyWork }) {
  const working = useWork(work => (work.rooms?.[room.id] ?? []).length > 0)
  const approval = useWork(work => (work.approvals ?? []).some(item => item.roomId === room.id))
  const status = approval ? t('Waiting for your approval') : working ? t('Working') : t('{count} members', { count: room.members.length })
  return h('button', {
    type: 'button', className: 'bt-team-card bt-team-group', 'data-picker-choice': room.id,
    'aria-current': active ? 'page' : undefined, 'aria-label': `${room.name}, ${status}`,
    disabled: Boolean(pending), onClick: () => choose(room.id),
  }, h(RoomAvatar, { room, roster, size: 38 }),
  h('span', { className: 'bt-team-card-copy' },
    h('span', { className: 'bt-team-card-name' }, room.name),
    h('span', { className: 'bt-team-card-note' }, status)),
  active ? h('span', { className: 'bt-team-selected', 'aria-hidden': true }, '✓') : null)
}

// This is a non-modal team browser. It uses DS Bot's characters and work sources;
// it does not retain the conversations merely to display their identities.
export function CompanionPicker({ anchor, roster, value, actions, close, ...hooks }) {
  const panel = useRef(null)
  const search = useRef(null)
  const [query, setQuery] = useState('')
  const [box, setBox] = useState(null)
  const [pending, setPending] = useState(null)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEscape(() => close(true))
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(376, window.innerWidth - 24)
      const top = Math.min(rect.bottom + 10, Math.max(12, window.innerHeight - 240))
      setBox({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top, width, maxHeight: window.innerHeight - top - 12 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor])
  useEffect(() => { if (box) search.current?.focus() }, [Boolean(box)])
  useEffect(() => {
    const outside = event => {
      if (!panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) close(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
    }
  }, [anchor, close])
  const wanted = query.trim().toLocaleLowerCase()
  const matches = item => `${item.name} ${item.role ?? ''}`.toLocaleLowerCase().includes(wanted)
  const bots = roster.bots.filter(matches).sort((a, b) => Number(b.id === roster.mainBotId) - Number(a.id === roster.mainBotId) || Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
  const rooms = roster.rooms.filter(matches)
  const choose = async id => {
    if (pending) return
    setPending(id)
    setError('')
    try {
      const opened = await actions.openCompanion(id)
      if (mounted.current) { setPending(null); if (opened) close(true) }
    } catch (failure) {
      if (mounted.current) { setPending(null); setError(failure?.message ?? String(failure)) }
    }
  }
  const onKeyDown = event => {
    if (event.nativeEvent.isComposing) return
    const choices = [...panel.current.querySelectorAll('[data-picker-choice]:not(:disabled)')]
    const at = choices.indexOf(document.activeElement)
    let next
    if (event.target === search.current && event.key === 'ArrowDown') next = choices[0]
    else if (at >= 0 && ['ArrowDown', 'ArrowRight'].includes(event.key)) next = choices[(at + 1) % choices.length]
    else if (at >= 0 && ['ArrowUp', 'ArrowLeft'].includes(event.key)) next = choices[(at - 1 + choices.length) % choices.length]
    if (next) { event.preventDefault(); next.focus() }
  }
  if (!box) return null
  return createPortal(h('div', { ref: panel, id: 'bt-companion-picker', className: 'bt-team-picker', role: 'dialog', 'aria-label': t('Bot team'), style: box, onKeyDown },
    h('div', { className: 'bt-team-picker-head' }, h('strong', null, t('Bot team')),
      h('button', { type: 'button', className: 'bt-icon-btn', 'aria-label': t('Close'), onClick: () => close(true) }, h(CloseIcon))),
    h('label', { className: 'bt-team-search' }, h(SearchIcon),
      h('input', { ref: search, type: 'search', value: query, placeholder: t('Find a Bot or group'), 'aria-label': t('Find a Bot or group'), onChange: event => setQuery(event.target.value) })),
    h('div', { className: 'bt-team-picker-list', 'aria-busy': Boolean(pending) },
      bots.length ? h('section', { 'aria-label': t('Bots') },
        h('h3', null, t('Bots'), h('span', null, bots.length)),
        h('div', { className: 'bt-team-grid' }, bots.map(bot => h(BotChoice, { key: bot.id, bot, roster, active: value === bot.id, choose, pending, ...hooks })))) : null,
      rooms.length ? h('section', { 'aria-label': t('Group chats') },
        h('h3', null, t('Group chats'), h('span', null, rooms.length)),
        rooms.map(room => h(GroupChoice, { key: room.id, room, roster, active: value === room.id, choose, pending, ...hooks }))) : null,
      !bots.length && !rooms.length ? h('p', { className: 'bt-team-empty', role: 'status' }, t('No results')) : null),
    pending ? h('div', { className: 'bt-team-message', role: 'status' }, t('Opening your companion…')) : null,
    error ? h('div', { className: 'bt-team-message bt-team-error', role: 'alert' }, error) : null,
    h('button', { type: 'button', className: 'bt-team-manage', onClick: () => { close(false); actions.openSettings('bots') } }, h(GearIcon), t('Manage team'))), document.body)
}
