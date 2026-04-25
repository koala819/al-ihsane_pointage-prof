export type Session = 'matin' | 'apres_midi'
export type Statut = 'non_assigne' | 'present' | 'absent' | 'remplacement'

type DayItem = {
  date: string
  jour: 'Samedi' | 'Dimanche'
}

export type Week = {
  label: string
  days: DayItem[]
}

export type Pointage = {
  date: string
  session: Session
  statut: Statut
}

export type Prof = {
  prenom: string
  nom: string
  niveau?: string | null
  valid_form: boolean
}

export type Periode = {
  nom: string
  date_debut: string
  date_fin: string
}

export type GetDataResponse =
  | {
      error: string
    }
  | {
      prof: Prof
      periode: Periode
      pointages: Pointage[]
    }

export type SessionDate = {
  date: string
  jour: 'Samedi' | 'Dimanche'
}

export type EtatPointage = Record<string, Statut>
