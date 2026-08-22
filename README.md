# WorkBuddy

Multi-User-PWA für **Microsoft 365** und **Maringo Support**.  
Herkunft: Slim-Port der Microsoft- und Maringo-Module aus FamilyBrain — eigenständiges Produkt, ohne Dokumenten-Hub.

Start-URL der PWA: `/` (schlanke Übersicht: Microsoft 365 + Maringo, je nach Modulrechten).

## First install

1. `.env` aus `.env.example` kopieren.
2. Secrets erzeugen:

```bash
npm run auth:secrets -- 'dein-sicheres-passwort'
```

`WORKBUDDY_PASSWORD_HASH` und `WORKBUDDY_SESSION_SECRET` (≥ 32 Zeichen) in `.env` eintragen.

3. Entra-App (eine Registration für alle User):
   - Redirect URI: `{APP_PUBLIC_URL}/api/microsoft/oauth/callback`
   - Delegated scopes: `openid profile email offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite Tasks.ReadWrite`
   - `MICROSOFT_OAUTH_CLIENT_ID` / `CLIENT_SECRET` / `TENANT` (default `organizations`) in `.env`

4. `MARI_REST_BASE_URL` setzen (oder Default belassen). **Kein** `OPENAI_API_KEY` in `.env`.

5. Stack starten:

```bash
mkdir -p data && sudo chown -R 1000:1000 data
docker compose up -d --build
```

Image-Referenz: `ghcr.io/rolfwalker71-commits/workbuddy` (lokal via `build:`).

## So verbindet ein User Microsoft + Maringo + OpenAI

1. Als Admin unter **Einstellungen** den User anlegen und Module `microsoft` / `maringo` setzen.
2. User loggt sich ein → **Übersicht** (`/`). Secrets und OAuth unter **Konto**.
3. Eigenen **OpenAI-Key** hinterlegen (Pflicht für KI; Ticket-Vision nur mit offiziellem OpenAI-Key).
4. **Maringo**: REST-Benutzer, Passwort, Personalnummer speichern.
5. **Microsoft 365** verbinden (OAuth) — jeder verbindet sein eigenes Work/School-Konto.
6. Kalenderauswahl, Mail-Signatur und Notification-Prefs nach Bedarf.

Ohne OpenAI-Key zeigt die UI: «Hinterlege deinen OpenAI-Key unter Konto». Es gibt keinen Server-Fallback.

## Betrieb

- SQLite WAL unter `./data` (`DATABASE_PATH=/app/data/supportdesk.sqlite`).
- Interner Port 3000, Host default 3200.
- Ticket-Poll und Tagesanalyse laufen pro User (dessen MARI-Login / Graph-Token / OpenAI-Key).
