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
      pointages: Pointage[]
    }

const PERIODE = 'fev-paques-2026'
const DATE_DEBUT = '2026-02-14'
const DATE_FIN = '2026-04-05'

type SessionDate = {
  date: string
  jour: 'Samedi' | 'Dimanche'
}

type EtatPointage = Record<string, Statut>
