type Session = 'matin' | 'apres_midi'
type Statut = 'non_assigne' | 'present' | 'absent' | 'remplacement'

type Pointage = {
  date: string
  session: Session
  statut: Statut
}

type Prof = {
  prenom: string
  nom: string
  niveau?: string | null
  valid_form: boolean
}

type GetDataResponse =
  | {
      error: string
    }
  | {
      prof: Prof
      periode: {
        nom: string
        date_debut: string
        date_fin: string
      }
      pointages: Pointage[]
    }

type SessionDate = {
  date: string
  jour: 'Samedi' | 'Dimanche'
}

type EtatPointage = Record<string, Statut>

const cycleStatuts: Statut[] = ['non_assigne', 'present', 'absent', 'remplacement']
const etat: EtatPointage = {}

function getById<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Element introuvable: #${id}`)
  return el as T
}

function getSessionDates(debut: string, fin: string): SessionDate[] {
  const dates: SessionDate[] = []
  const current = new Date(`${debut}T00:00:00`)
  const end = new Date(`${fin}T00:00:00`)
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
  return etat[`${date}_${session}`] ?? 'non_assigne'
}

function setStatut(date: string, session: Session, statut: Statut): void {
  etat[`${date}_${session}`] = statut
  updateSummary()
}

function labelSession(session: Session, statut: Statut): string {
  const base = session === 'matin' ? 'Matin' : 'Apres-midi'
  if (statut === 'non_assigne') return base
  if (statut === 'present') return `${base} ✓`
  if (statut === 'absent') return `${base} ✗`
  return `${base} ↔`
}

function updateSummary(): void {
  const vals = Object.values(etat)
  getById<HTMLElement>('cnt-p').textContent = String(vals.filter((v) => v === 'present').length)
  getById<HTMLElement>('cnt-a').textContent = String(vals.filter((v) => v === 'absent').length)
  getById<HTMLElement>('cnt-r').textContent = String(vals.filter((v) => v === 'remplacement').length)
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short'
  })
}

function formatWeekLabel(dates: SessionDate[]): string {
  const first = new Date(`${dates[0].date}T00:00:00`)
  return `Semaine du ${first.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
}

function cycleStatut(date: string, session: Session): void {
  const cur = getStatut(date, session)
  const idx = cycleStatuts.indexOf(cur)
  const next = cycleStatuts[(idx + 1) % cycleStatuts.length]
  setStatut(date, session, next)
  const btn = document.querySelector<HTMLElement>(`[data-date="${date}"][data-session="${session}"]`)
  if (btn) {
    btn.dataset.statut = next
    btn.textContent = labelSession(session, next)
  }
}

async function sauvegarder(token: string): Promise<void> {
  const btn = getById<HTMLButtonElement>('btn-save')
  btn.disabled = true
  btn.textContent = 'Enregistrement...'

  const pointages: Pointage[] = Object.entries(etat).map(([key, statut]) => {
    const [date, session] = key.split('_')
    return { date, session: session as Session, statut: statut as Statut }
  })

  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, pointages })
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

function renderApp(prof: Prof, periode: { nom: string; date_debut: string; date_fin: string }): void {
  const initiales = `${prof.prenom[0]}${prof.nom[0]}`.toUpperCase()
  const dates = getSessionDates(periode.date_debut, periode.date_fin)
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
        <div class="header"><h1>Pointage valide</h1><p>Periode ${periode.nom}</p></div>
        <div class="deja-valide">
          Tu as deja valide ton pointage pour cette periode.<br>
          Contacte l'administrateur si tu dois le modifier.
        </div>
      </div>`
    return
  }

  getById<HTMLElement>('app').innerHTML = `
    <div class="card">
      <div class="header">
        <h1>Pointage des sessions</h1>
        <p>Periode ${periode.nom}</p>
      </div>
      <div class="prof-badge">
        <div class="avatar">${initiales}</div>
        <div>
          <div style="font-size:14px;font-weight:500">${prof.prenom} ${prof.nom}</div>
          <div style="font-size:12px;color:#888">${prof.niveau ?? ''}</div>
        </div>
      </div>
      <div class="legend">
        <div class="leg-item"><div class="leg-dot" style="background:#1D9E75"></div> Present</div>
        <div class="leg-item"><div class="leg-dot" style="background:#E24B4A"></div> Absent</div>
        <div class="leg-item"><div class="leg-dot" style="background:#EF9F27"></div> Remplacement</div>
      </div>
      ${weeksHtml}
      <div class="summary">
        <div class="sum-card"><div class="sum-n" style="color:#0F6E56" id="cnt-p">0</div><div style="font-size:11px;color:#888;margin-top:2px">Presences</div></div>
        <div class="sum-card"><div class="sum-n" style="color:#A32D2D" id="cnt-a">0</div><div style="font-size:11px;color:#888;margin-top:2px">Absences</div></div>
        <div class="sum-card"><div class="sum-n" style="color:#854F0B" id="cnt-r">0</div><div style="font-size:11px;color:#888;margin-top:2px">Remplacements</div></div>
      </div>
      <div id="msg-erreur">Une erreur est survenue, reessaie.</div>
      <div id="msg-succes">Pointage enregistre ! Un mail de confirmation t'a ete envoye.</div>
      <button class="save-btn" id="btn-save">Valider mon pointage</button>
    </div>`

  updateSummary()
}

export async function initPointageApp(): Promise<void> {
  const loading = getById<HTMLElement>('loading')
  const app = getById<HTMLElement>('app')

  const token = new URLSearchParams(window.location.search).get('token')
  if (!token) {
    loading.textContent = 'Lien invalide.'
    return
  }

  const res = await fetch(`/api/get-data?token=${encodeURIComponent(token)}`)
  const data = (await res.json()) as GetDataResponse

  if ('error' in data) {
    loading.textContent = 'Lien invalide ou expire.'
    return
  }

  data.pointages.forEach((p) => {
    etat[`${p.date}_${p.session}`] = p.statut
  })

  loading.style.display = 'none'
  app.style.display = 'block'

  renderApp(data.prof, data.periode)

  app.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (!target) return

    const sessBtn = target.closest('.js-sess') as HTMLElement | null
    if (sessBtn) {
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
