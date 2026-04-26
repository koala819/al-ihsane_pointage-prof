# Pointage Profs - Guide operationnel

Application Astro pour:
- le pointage individuel des profs via lien personnel (`?token=...`)
- l'envoi de campagne email des liens de pointage
- le recapitulatif global par prof

## Variables d'environnement (noms uniquement)

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
MAIL_TO
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
MAIL_CAMPAIGN_TOKEN
RECAP_TOKEN
```

## URLs utiles

- **Fiche de pointage prof**: `/?token=TOKEN_DU_PROF`
- **Page de campagne d'envoi**: `/envoi-mails?token=MAIL_CAMPAIGN_TOKEN`
- **Page recapitulatif profs**: `/recap?token=RECAP_TOKEN`

## Campagne suivante (ex: Ete 2026)

Pour relancer une nouvelle campagne (apres Printemps 2026), il faut preparer la base:

- **Table `paie.periodes`**
  - creer/mettre a jour la ligne de la nouvelle periode (nom + dates)
  - mettre **une seule** periode active: `actif = true` pour la nouvelle, `actif = false` pour les autres

- **Table `paie.profs`**
  - remettre `valid_form = false` pour autoriser un nouveau remplissage de fiche
  - remettre `mail_envoye = false` pour autoriser un nouvel envoi de mail de campagne
  - verifier/regenerer `token` si on veux des liens differents de la campagne precedente

- **Table `paie.pointages`**
  - pas obligatoire de supprimer l'historique
  - les nouveaux pointages seront lies a la nouvelle `periode` (via son `id`)

## Cas de correction d'une fiche deja validee

Si un prof doit modifier sa fiche apres validation:
- mettre `valid_form = false` pour ce prof dans `paie.profs`
- il pourra reouvrir sa fiche via son URL `/?token=...` puis revalider

## Important pour les textes d'email (saison)

Les libelles "printemps 2026" sont actuellement en dur dans le code.
Avant la campagne Ete 2026, mettre a jour ces textes pour la nouvelle saison:

- `src/pages/api/mail-campaign.ts`
- `src/pages/envoi-mails.astro`
