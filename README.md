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
   - Delegated scopes: `openid profile email offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite Tasks.ReadWrite Chat.Read ChatMessage.Read Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All OnlineMeetings.Read OnlineMeetingTranscript.Read.All`
   - `MICROSOFT_OAUTH_CLIENT_ID` / `CLIENT_SECRET` / `TENANT` (default `organizations`) in `.env`

4. `MARI_REST_BASE_URL` setzen (oder Default belassen). **Kein** `OPENAI_API_KEY` in `.env`.
   Firmen-KI (OpenAI: Key + Modell, oder Custom inkl. URL) legt der Admin unter
   **Einstellungen → Firmen-KI** ab.
   Optionaler Docker-Override: `COMPANY_AI_API_KEY` / `COMPANY_AI_KIND` /
   `COMPANY_AI_MODEL` / `COMPANY_AI_BASE_URL`.

5. Stack starten:

**Remote / Paperless** (kein Clone, kein `--build` — sonst scheitert Compose ohne Dockerfile):

```bash
mkdir -p data && sudo chown -R 1000:1000 data
docker compose pull && docker compose up -d
```

Nur lokal aus dem Source-Tree bauen:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Image: `ghcr.io/rolfwalker71-commits/workbuddy` (öffentlich, Tag `latest`).

## So verbindet ein User Microsoft + Maringo + OpenAI

1. Als Admin unter **Einstellungen** den User anlegen und Module `microsoft` / `maringo` setzen.
2. User loggt sich ein → **Übersicht** (`/`). Secrets und OAuth unter **Konto**.
3. Eigenen **OpenAI-Key** hinterlegen — oder die Admin-**Firmen-KI** nutzen.
   Ticket-Vision mit Bildern bleibt am zuverlässigsten mit einem persönlichen OpenAI-Key.
4. **Maringo**: REST-Benutzer, Passwort, Personalnummer speichern.
5. **Microsoft 365** verbinden (OAuth) — jeder verbindet sein eigenes Work/School-Konto.
6. Kalenderauswahl, Mail-Signatur und Notification-Prefs nach Bedarf.

Ohne persönlichen Key gilt die Firmen-KI, falls der Admin sie gesetzt hat. `OPENAI_API_KEY` in der `.env` wird weiterhin ignoriert.

## Betrieb

- SQLite WAL unter `./data` (`DATABASE_PATH=/app/data/supportdesk.sqlite`).
- Interner Port 3311 (`PORT=3311`), Host default 3311 (`WORKBUDDY_PORT`).
- Ticket-Poll und Tagesanalyse laufen pro User (dessen MARI-Login / Graph-Token / OpenAI-Key).

## Web Push (VAPID)

Abend-Digest «Tagesabschluss» (Mo–Fr 18:30–19:30 Europe/Zurich) und Live-Events
nutzen Web Push. Keys werden automatisch in der Datenbank erzeugt; `.env`
(`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`) ist nur ein
optionaler Override.

In der App: **Konto → Benachrichtigungen → Push aktivieren**. Details:
[`docs/web-push.md`](docs/web-push.md).
