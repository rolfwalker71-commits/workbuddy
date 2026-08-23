# Web Push (VAPID)

WorkBuddy sendet Live-Notify-Events zusätzlich als Web Push, wenn der Nutzer
Push unter **Konto** aktiviert hat.

## Keys

VAPID-Keys werden beim ersten Bedarf automatisch erzeugt und in der SQLite-
Tabelle `settings` gespeichert (`vapid_public_key`, `vapid_private_key`,
`vapid_subject`). Kein Eintrag in `.env` nötig.

Optionaler Override (beide Keys müssen gesetzt sein):

```
VAPID_PUBLIC_KEY=…
VAPID_PRIVATE_KEY=…
VAPID_SUBJECT=mailto:you@example.com
```

`VAPID_SUBJECT` fällt sonst auf `APP_PUBLIC_URL` (`mailto:buddy@<host>`) bzw.
`mailto:buddy@localhost` zurück. `npm run push:vapid` bleibt nur für den
manuellen Override.

## In der App

Konto → Benachrichtigungen → **Push aktivieren**.
Reasons (Tagesabschluss, Mail-Analyse, Tickets, …) nach Modul filtern.

Push-Klick öffnet `/` bzw. den Workspace-Kalender (nicht `/dashboard`).

## Scheduler

Mo–Fr 18:30–19:30 Europe/Zurich sendet der In-Process-Scheduler
`evening_digest` («Tagesabschluss») an User mit Microsoft- und/oder
Google-Modul. Kein Morgen-Briefing, kein Wochenend-Digest.
