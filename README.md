# iPad Arcade

A tiny framework for building simple HTML games that play great on an iPad. No
build step, no dependencies — just open `index.html`.

## Play now

Hosted on GitHub Pages — open these on your iPad (and use Safari's
**Share → Add to Home Screen** for a fullscreen icon):

- **Launcher (all games):** https://skant.github.io/ipad-games/
- 🦄 **Pony Rainbow Rescue:** https://skant.github.io/ipad-games/games/pony-rainbow.html
- 🐢 **Turtle Numbers:** https://skant.github.io/ipad-games/games/turtle-numbers.html

## Structure

```
ipad-games/
├── index.html            # Launcher / home screen (data-driven)
├── css/common.css        # Shared styles + all the iPad touch tweaks
├── js/common.js          # Shared helpers: Arcade.onTap / onSwipe / buzz / scores / AudioBank
├── js/games.js           # The games manifest (one entry per game)
├── games/
│   └── _template.html    # Copy this to start a new game
├── audio/
│   ├── letters/          # SHARED, reusable letter clips (letter_*/find_*) + manifest.json
│   └── dino/             # Dinosaur Racing-specific clips (win_*/back_to_start) + manifest.json
└── README.md
```

## Add a new game (2 steps)

1. **Copy the template**

   ```sh
   cp games/_template.html games/my-game.html
   ```

   Open it, set `GAME_ID` to a unique value, and build your game inside the
   `#board` element.

2. **Register it** in `js/games.js`:

   ```js
   const GAMES = [
     {
       id: "my-game",            // must match GAME_ID in the html
       title: "My Game",
       desc: "Tap / swipe to play",
       emoji: "🎮",
       glow: "rgba(108,123,255,0.35)",
       path: "games/my-game.html",
     },
   ];
   ```

   It now appears on the home screen automatically.

## What the framework gives you

**Touch optimizations (already applied via `common.css` + viewport meta):**

- No 300ms tap delay and no double-tap zoom (`touch-action: manipulation`)
- No tap highlight flash or long-press callout menu
- No rubber-band / overscroll bounce
- Safe-area padding so content clears the camera/home indicator
- Fullscreen when "Add to Home Screen" is used

**Helpers in `Arcade` (`common.js`):**

| Helper                              | Use                                                        |
| ----------------------------------- | ---------------------------------------------------------- |
| `Arcade.onTap(el, fn)`              | Instant tap, no ghost clicks. Works with mouse on desktop. |
| `Arcade.onSwipe(el, fn)`            | `fn(dir)` with `up` / `down` / `left` / `right`.           |
| `Arcade.bindArrowKeys(fn)`          | Map arrow keys to swipe dirs for desktop testing.          |
| `Arcade.buzz(ms)`                   | Light haptic where supported.                              |
| `Arcade.getHighScore(id)`           | Read a game's best score.                                  |
| `Arcade.setHighScore(id, score)`    | Save if it's a new best; returns `true` on a record.       |
| `Arcade.goHome()`                   | Back to the launcher.                                      |
| `Arcade.AudioBank({dir})` / `({dirs})` | Pre-recorded clip player; merges one or more folders (`load`/`unlock`/`play(key)`). |

## Voice audio (optional, higher quality)

The voice games use the browser's built-in `speechSynthesis` by default (works
everywhere, no setup). For a more natural, consistent voice you can generate
pre-recorded MP3 clips with a TTS provider. **This is optional** — if no clips
exist, the games automatically fall back to built-in speech.

Currently wired up: **Dinosaur Racing** (`games/dino-racing.html`).

Default voice: **"Josh - teacher for kids"** (`nzFihrBIvB34imQBuxub`) — add that
voice to your ElevenLabs account first.

### Shared letter audio library (`audio/letters/`)

The reusable, game-agnostic letter clips live in their own shared library so
multiple games (and future projects) can leverage them:

- `audio/letters/` holds the 52 alphabet clips — `letter_A`…`letter_Z` (the bare
  letter, e.g. "A"; `letter_V` is recorded phonetically as "Vee") and
  `find_A`…`find_Z` ("Find Letter X") — plus a `manifest.json`.
- `audio/praise/` holds 5 shared positive-reinforcement clips `praise_1`…`praise_5`
  ("Great job!", "Way to go!", "You did it!", "Awesome work!", "Super star!") plus
  a `manifest.json`. Dinosaur Racing plays a random one on every correct letter tap.
- Game-specific clips stay with their game. For Dinosaur Racing, `audio/dino/`
  holds the 7 `win_*` lines and `back_to_start`, plus its own `manifest.json`.

Each `manifest.json` has the same shape (the keys array lists exactly the `.mp3`
files in that folder):

```json
{
  "provider": "elevenlabs",
  "voice": "nzFihrBIvB34imQBuxub",
  "model": "eleven_multilingual_v2",
  "keys": ["letter_A", "find_A", "..."]
}
```

**Wiring up a game.** `Arcade.AudioBank` can merge several folders, so a game
loads the shared library plus its own folder. Clip lookups check every loaded
source (and a key present in more than one folder is won by the folder loaded
last). From a file in `games/`, the shared library is `../audio/letters/` and a
game folder is `../audio/<game>/`:

```js
const audioBank = Arcade.AudioBank({
  dirs: ["../audio/letters/", "../audio/praise/", "../audio/dino/"],
});
audioBank.load(); // letters/prompts + praise come from shared libs, win/back from the game
```

A single-folder bank still works (`Arcade.AudioBank({ dir: "../audio/dino/" })`),
and `bank.load("../audio/extra/")` merges an extra folder later. As before, if a
manifest or its clips are missing, `play()` returns `false` and the game falls
back to `speechSynthesis`.

**ElevenLabs → use the Python generator (recommended, works on the free tier).**
ElevenLabs blocks Voice Library voices over the raw REST API on free plans (402),
but the official Python SDK works. One-time setup, then run:

```sh
cd ipad-games
python3 -m venv .venv
./.venv/bin/python -m pip install elevenlabs

# generates clips with the Josh - teacher for kids voice by default
ELEVENLABS_API_KEY=...  ./.venv/bin/python tools/generate_audio.py
# ...or pass the voice ID explicitly
ELEVENLABS_API_KEY=...  TTS_VOICE=nzFihrBIvB34imQBuxub  ./.venv/bin/python tools/generate_audio.py
```

**OpenAI → use the Node generator** (no deps, needs Node 18+):

```sh
cd ipad-games
TTS_PROVIDER=openai  OPENAI_API_KEY=sk-...  node tools/generate-audio.mjs
```

- Python env vars: `ELEVENLABS_API_KEY` (required), optional `TTS_VOICE`,
  `TTS_MODEL`, `TTS_OVERWRITE=1`.
- Node env vars: `TTS_PROVIDER` (default `elevenlabs`), `ELEVENLABS_API_KEY` /
  `OPENAI_API_KEY`, optional `TTS_VOICE`, `TTS_MODEL`, `TTS_OVERWRITE=1`.
- Both generators write to the same split layout: letter/prompt clips go to
  `audio/letters/`, praise clips (`praise_*`) to `audio/praise/`, and the
  game-specific `win_*`/`back_to_start` clips to `audio/dino/`, each with its own
  `manifest.json`, so the game works the same regardless of which you use.
- Existing files are skipped unless `TTS_OVERWRITE=1`.
- The game tries a clip first and only falls back to `speechSynthesis` if a clip
  is missing, so you can generate clips later without touching the game.
- `google` / `polly` / `azure` adapters are scaffolded as TODOs in the script.

## Run it locally

A static server is the easiest way to test (avoids `file://` quirks):

```sh
cd ipad-games
python3 -m http.server 8000
```

Then open `http://localhost:8000` — or, on an iPad on the same Wi-Fi, visit
`http://<your-mac-ip>:8000`.
