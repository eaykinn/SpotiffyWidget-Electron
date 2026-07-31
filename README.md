# Spotiffy Widget (Electron)

Electron + React port of the WPF [SpotiffyWidget](../SpotiffyWidget) desktop Spotify companion.

Frameless always-on-top widget with full / mini player, library tabs, queue, lyrics, tray, and the same Spotify PKCE + Web API flow as the original app.

## Stack

- **Electron** + **electron-vite**
- **React** + TypeScript
- Spotify Authorization Code with **PKCE** (no client secret)
- Playback via Spotify Web API polling (`/me/player`) instead of Windows NPSMLib

## Setup

1. Copy env file and set your Spotify Client ID:

```bash
cp .env.example .env
```

2. In [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), add redirect URI:

```
http://127.0.0.1:5000/callback/
```

3. Install and run:

```bash
npm install
npm run dev
```

Optional: set `GENIUS_ACCESS_TOKEN` for lyrics.

## Scripts

| Command        | Description              |
|----------------|--------------------------|
| `npm run dev`  | Dev server + Electron    |
| `npm run build`| Production build         |
| `npm run dist` | Windows installer        |

## Feature parity

| Feature                         | Status |
|---------------------------------|--------|
| PKCE login / token refresh      | Yes    |
| Play / pause / seek / volume    | Yes    |
| Shuffle / repeat / like / queue | Yes    |
| Liked / top / search tracks     | Yes    |
| Artists + playlists             | Yes    |
| Mini player                     | Yes    |
| Tray (close hides)              | Yes    |
| Always on top / prevent sleep   | Yes    |
| Pause on lock                   | Yes    |
| Theme + accent                  | Yes    |
| Genius lyrics                   | Yes (env token) |
| Windows Mica / desktop pin      | Not ported |
| NPSMLib now-playing             | Replaced by API poll |

## Notes

- Spotify desktop (or another active device) must be available for playback control.
- Original WPF repo is left untouched; this project lives alongside it.
