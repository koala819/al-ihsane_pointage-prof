import type { Pointage, Session, Statut } from './types'

const cycle: Statut[] = ['non_assigne', 'present', 'absent', 'remplacement']
const etat: Record<string, Statut> = {}

const ui = {
  cntP: 'cnt-p',
  cntA: 'cnt-a',
  cntR: 'cnt-r',
  msgErreur: 'msg-erreur',
  msgSucces: 'msg-succes',
  btnSave: 'btn-save'
} as const

type UiKey = keyof typeof ui
const domCache = new Map<UiKey, HTMLElement>()

function getById<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Element introuvable: #${id}`)
  return el as T
}

function el<T extends HTMLElement>(key: UiKey): T {
  const cached = domCache.get(key)
  if (cached) return cached as T
  const found = getById<T>(ui[key])
  domCache.set(key, found)
  return found
}

function setText(key: UiKey, value: string): void {
  el<HTMLElement>(key).textContent = value
}

function getStatut(date: string, session: Session): Statut {
  return etat[`${date}_${session}`] || 'non_assigne'
}

function setStatut(date: string, session: Session, statut: Statut): void {
  etat[`${date}_${session}`] = statut
  updateSummary()
}

function cycleStatut(date: string, session: Session): void {
  const cur = getStatut(date, session)
  const idx = cycle.indexOf(cur)
  const next = cycle[(idx + 1) % cycle.length]
  setStatut(date, session, next)
  const btn = document.querySelector<HTMLElement>(`[data-date="${date}"][data-session="${session}"]`)
  if (btn) {
    btn.dataset.statut = next
    btn.textContent = labelSession(session, next)
  }
}

function labelSession(session: Session, statut: Statut): string {
  const s = session === 'matin' ? 'Matin' : 'Après-midi'
  if (statut === 'non_assigne') return s
  if (statut === 'present') return `${s} ✓`
  if (statut === 'absent') return `${s} ✗`
  return `${s} ↔`
}

function updateSummary(): void {
  const vals = Object.values(etat)
  setText('cntP', String(vals.filter((v) => v === 'present').length))
  setText('cntA', String(vals.filter((v) => v === 'absent').length))
  setText('cntR', String(vals.filter((v) => v === 'remplacement').length))
}

function pointagesFromEtat(): Pointage[] {
  return Object.entries(etat).map(([key, statut]) => {
    const idx = key.indexOf('_')
    const date = key.slice(0, idx)
    const session = key.slice(idx + 1)
    return { date, session: session as Session, statut: statut as Statut }
  })
}

async function sauvegarder(token: string): Promise<void> {
  const btn = el<HTMLButtonElement>('btnSave')
  btn.disabled = true
  btn.textContent = 'Enregistrement...'

  const res = await fetch('/api/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, pointages: pointagesFromEtat() })
  })
  const data = (await res.json()) as { ok?: boolean }

  if (data.ok) {
    el<HTMLElement>('msgSucces').style.display = 'block'
    btn.style.display = 'none'
    return
  }

  el<HTMLElement>('msgErreur').style.display = 'block'
  btn.disabled = false
  btn.textContent = 'Enregistrer ↗'
}

export async function initPointageController(): Promise<void> {
  const mainCard = document.getElementById('main-card')
  if (!(mainCard instanceof HTMLElement)) {
    return
  }

  const token = mainCard.dataset.token?.trim()
  if (!token) return

  document.querySelectorAll<HTMLElement>('.js-sess').forEach((btn) => {
    const date = btn.dataset.date
    const session = btn.dataset.session as Session | undefined
    const statut = btn.dataset.statut as Statut | undefined
    if (date && session && statut) {
      etat[`${date}_${session}`] = statut
    }
  })

  updateSummary()

  mainCard.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const sessBtn = target.closest('.js-sess')
    if (sessBtn instanceof HTMLElement) {
      const date = sessBtn.dataset.date
      const session = sessBtn.dataset.session as Session | undefined
      if (date && session) cycleStatut(date, session)
      return
    }

    if (target.id === ui.btnSave) {
      void sauvegarder(token)
    }
  })
}

void initPointageController()
