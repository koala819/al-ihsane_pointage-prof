import type { GetDataResponse, Pointage, Session, SessionDate, Statut } from './types'

export function getWeekendDates(dateDebut: string, dateFin: string): SessionDate[] {
  const dates: SessionDate[] = []
  const current = new Date(`${dateDebut}T00:00:00`)
  const end = new Date(`${dateFin}T00:00:00`)

  while (current <= end) {
    const day = current.getDay()
    if (day === 6 || day === 0) {
      dates.push({
        date: current.toISOString().split('T')[0],
        jour: day === 6 ? 'Samedi' : 'Dimanche'
      })
    }
    current.setDate(current.getDate() + 1)
  }

  return dates
}

const cycle: Statut[] = ['non_assigne', 'present', 'absent', 'remplacement']
const etat: Record<string, Statut> = {}

function getById<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Element introuvable: #${id}`)
  return el as T
}

function renderMessage(title: string, message: string): void {
  const loading = getById<HTMLElement>('loading')
  const app = getById<HTMLElement>('app')
  loading.style.display = 'none'
  app.style.display = 'block'
  app.innerHTML = `
    <div class="card">
      <div class="header">
        <h1>${title}</h1>
        <p>Pointage des cours</p>
      </div>
      <div class="deja-valide">${message}</div>
    </div>`
}

function groupByWeek(dates: SessionDate[]): SessionDate[][] {
  const weeks: SessionDate[][] = []
  let currentWeek: SessionDate[] = []
  let currentMonday: string | null = null
  dates.forEach((d) => {
    const dt = new Date(`${d.date}T00:00:00`)
    const monday = new Date(dt)
    monday.setDate(dt.getDate() - (dt.getDay() === 0 ? 6 : dt.getDay() - 1))
    const mondayStr = monday.toISOString().split('T')[0]
    if (mondayStr !== currentMonday) {
      if (currentWeek.length) weeks.push(currentWeek)
      currentWeek = []
      currentMonday = mondayStr
    }
    currentWeek.push(d)
  })
  if (currentWeek.length) weeks.push(currentWeek)
  return weeks
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
  getById<HTMLElement>('cnt-p').textContent = String(vals.filter((v) => v === 'present').length)
  getById<HTMLElement>('cnt-a').textContent = String(vals.filter((v) => v === 'absent').length)
  getById<HTMLElement>('cnt-r').textContent = String(vals.filter((v) => v === 'remplacement').length)
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatWeekLabel(dates: SessionDate[]): string {
  const first = new Date(`${dates[0].date}T00:00:00`)
  return `Semaine du ${first.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
}

function formatPeriodeLabel(dateDebut: string, dateFin: string): string {
  const debut = new Date(`${dateDebut}T00:00:00`)
  const fin = new Date(`${dateFin}T00:00:00`)
  const debutTxt = debut.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
  const finTxt = fin.toLocaleDateString('fr-FR', { month: 'long' })
  return `Vacances ${debutTxt}. - ${finTxt} ${fin.getFullYear()}`
}

function pointagesFromEtat(): Pointage[] {
  return Object.entries(etat).map(([key, statut]) => {
    const [date, session] = key.split('_')
    return { date, session: session as Session, statut: statut as Statut }
  })
}

async function sauvegarder(token: string): Promise<void> {
  const btn = getById<HTMLButtonElement>('btn-save')
  btn.disabled = true
  btn.textContent = 'Enregistrement...'

  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, pointages: pointagesFromEtat() })
  })
  const data = (await res.json()) as { ok?: boolean }

  if (data.ok) {
    getById<HTMLElement>('msg-succes').style.display = 'block'
    btn.style.display = 'none'
    return
  }

  getById<HTMLElement>('msg-erreur').style.display = 'block'
  btn.disabled = false
  btn.textContent = 'Valider mon pointage'
}

function render(prof: { prenom: string; nom: string; niveau?: string | null; valid_form: boolean }, periode: { nom: string; date_debut: string; date_fin: string }): void {
  const initiales = (prof.prenom[0] + prof.nom[0]).toUpperCase()
  const periodeLabel = formatPeriodeLabel(periode.date_debut, periode.date_fin)
  const dates = getWeekendDates(periode.date_debut, periode.date_fin)
  const weeks = groupByWeek(dates)

  let weeksHtml = ''
  weeks.forEach((week) => {
    let daysHtml = ''
    week.forEach((d) => {
      const statMatin = getStatut(d.date, 'matin')
      const statApm = getStatut(d.date, 'apres_midi')
      daysHtml += `
        <div class="day-row">
          <div class="day-name">${d.jour} ${formatDate(d.date)}</div>
          <div class="sessions">
            <div class="sess js-sess" data-date="${d.date}" data-session="matin" data-statut="${statMatin}">
              ${labelSession('matin', statMatin)}
            </div>
            <div class="sess js-sess" data-date="${d.date}" data-session="apres_midi" data-statut="${statApm}">
              ${labelSession('apres_midi', statApm)}
            </div>
          </div>
        </div>`
    })
    weeksHtml += `
      <div class="week-block">
        <div class="week-label">${formatWeekLabel(week)}</div>
        ${daysHtml}
      </div>`
  })

  if (prof.valid_form) {
    getById<HTMLElement>('app').innerHTML = `
      <div class="card">
        <div class="header"><h1>Pointage validé</h1><p>Période ${periode.nom}</p></div>
        <div class="deja-valide">
          Tu as déjà validé ton pointage pour cette période.<br>
          Contacte l'administrateur si tu dois le modifier.
        </div>
      </div>`
    return
  }

  getById<HTMLElement>('app').innerHTML = `
    <div class="card">
      <div class="header">
        <h1>Pointage des cours</h1>
        <p>${periode.date_debut} - ${periode.date_fin}</p>
      </div>
      <div class="prof-badge">
        <div class="avatar">${initiales}</div>
        <div>
          <div style="font-size:14px;font-weight:500">${prof.prenom} ${prof.nom}</div>
          <div style="font-size:12px;color:#888">niveau ${prof.niveau || ''}</div>
        </div>
      </div>
      <div class="legend">
        <div class="leg-item"><div class="leg-dot" style="background:#1D9E75"></div> Présent</div>
        <div class="leg-item"><div class="leg-dot" style="background:#E24B4A"></div> Absent</div>
        <div class="leg-item"><div class="leg-dot" style="background:#EF9F27"></div> Remplacement</div>
        <div class="leg-item"><div class="leg-dot" style="background:#CFCFCB"></div> Non assigné</div>
      </div>
      ${weeksHtml}
      <div class="summary">
        <div class="sum-card"><div class="sum-n" style="color:#0F6E56" id="cnt-p">0</div><div style="font-size:11px;color:#888;margin-top:2px">Présences</div></div>
        <div class="sum-card"><div class="sum-n" style="color:#A32D2D" id="cnt-a">0</div><div style="font-size:11px;color:#888;margin-top:2px">Absences</div></div>
        <div class="sum-card"><div class="sum-n" style="color:#854F0B" id="cnt-r">0</div><div style="font-size:11px;color:#888;margin-top:2px">Remplacements</div></div>
      </div>
      <div id="msg-erreur">Une erreur est survenue, réessaie.</div>
      <div id="msg-succes">Pointage enregistré ! Un mail de confirmation t'a été envoyé.</div>
      <div class="help-text">Appuie sur une session pour changer son statut</div>
      <button class="save-btn" id="btn-save">Enregistrer ↗</button>
    </div>`

  updateSummary()
}

export async function initUI(): Promise<void> {
  const token = new URLSearchParams(window.location.search).get('token')
  const loading = getById<HTMLElement>('loading')
  const app = getById<HTMLElement>('app')

  if (!token) {
    renderMessage('Lien invalide', 'Le token est absent. Vérifie le lien reçu.')
    return
  }

  const res = await fetch(`/api/get-data?token=${encodeURIComponent(token)}`)
  const data = (await res.json()) as GetDataResponse

  if ('error' in data) {
    renderMessage('Erreur', data.error)
    return
  }

  data.pointages.forEach((p) => {
    etat[`${p.date}_${p.session}`] = p.statut
  })

  loading.style.display = 'none'
  app.style.display = 'block'

  render(data.prof, data.periode)

  app.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const sessBtn = target.closest('.js-sess')
    if (sessBtn instanceof HTMLElement) {
      const date = sessBtn.dataset.date
      const session = sessBtn.dataset.session as Session | undefined
      if (date && session) cycleStatut(date, session)
      return
    }

    if (target.id === 'btn-save') {
      void sauvegarder(token)
    }
  })
}
