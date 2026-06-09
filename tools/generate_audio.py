#!/usr/bin/env python3
"""Pre-recorded voice clip generator (ElevenLabs, Python SDK).

This mirrors the validated ElevenLabs Python SDK call, which works on the free
tier with Voice Library voices (e.g. "Josh - teacher for kids") where the raw
REST endpoint returns 402. It produces the SAME phrase set / output layout as
tools/generate-audio.mjs, so the game's runtime manifest keys match either way.

If you never run this (or no clips exist), the games fall back to the browser's
built-in speechSynthesis, so nothing breaks.

----- Usage ------------------------------------------------------------------
    # from ipad-games/, using the project venv that has the SDK installed:
    ELEVENLABS_API_KEY=...  ./.venv/bin/python tools/generate_audio.py

    # optional overrides
    ELEVENLABS_API_KEY=...  TTS_VOICE=nzFihrBIvB34imQBuxub  \
        ./.venv/bin/python tools/generate_audio.py

----- Env vars ---------------------------------------------------------------
    ELEVENLABS_API_KEY   required
    TTS_VOICE            default "nzFihrBIvB34imQBuxub" (Josh - teacher for kids)
    TTS_MODEL            default "eleven_multilingual_v2"
    TTS_OVERWRITE        "1" to re-generate clips that already exist (else skip)

Idempotent: existing <key>.mp3 files are skipped unless TTS_OVERWRITE=1.
Requires the `elevenlabs` package (pip install elevenlabs).
"""

import json
import os
import sys
from pathlib import Path

# Output is split into shared + game folders:
#   audio/letters/ — shared, game-agnostic letter clips (letter_*/find_*),
#                    reusable across games and future projects.
#   audio/praise/  — shared positive-reinforcement clips (praise_*), reusable
#                    across games (played on a correct answer).
#   audio/dino/    — clips specific to Dinosaur Racing (win_*/back_to_start).
_AUDIO_DIR = Path(__file__).resolve().parent.parent / "audio"
LETTERS_DIR = _AUDIO_DIR / "letters"
PRAISE_DIR = _AUDIO_DIR / "praise"
GAME_DIR = _AUDIO_DIR / "dino"


def dir_for_key(key):
    """Reusable letter/prompt and praise clips go to shared libraries; the
    rest stay with the game."""
    if key.startswith(("letter_", "find_")):
        return LETTERS_DIR
    if key.startswith("praise_"):
        return PRAISE_DIR
    return GAME_DIR

# Default = "Josh - teacher for kids" (user-confirmed Voice ID). Override with
# TTS_VOICE. The voice must be added to your ElevenLabs account to be usable.
DEFAULT_VOICE = "nzFihrBIvB34imQBuxub"
DEFAULT_MODEL = "eleven_multilingual_v2"
OUTPUT_FORMAT = "mp3_44100_128"
# Playback speed for the voice. ElevenLabs accepts 0.7-1.2; <1.0 = slower/
# clearer for a toddler. Override with TTS_SPEED.
DEFAULT_SPEED = 0.9

VOICE = os.getenv("TTS_VOICE", DEFAULT_VOICE)
MODEL = os.getenv("TTS_MODEL", DEFAULT_MODEL)
SPEED = float(os.getenv("TTS_SPEED", DEFAULT_SPEED))
OVERWRITE = os.getenv("TTS_OVERWRITE") == "1"


# Some bare letters are mis-pronounced by TTS (e.g. "V" comes out like "Y").
# Spell them phonetically; the file key stays "letter_V"/"find_V" so the game
# is unaffected. Add more entries here if other letters sound wrong.
PHONETIC = {
    "V": "Vee",
}


def build_phrases():
    """EXACTLY what dino-racing.html speaks (keep in sync with the Node script)."""
    phrases = {}
    for i in range(26):
        letter = chr(ord("A") + i)
        spoken = PHONETIC.get(letter, letter)
        phrases[f"letter_{letter}"] = spoken            # standalone letter
        phrases[f"find_{letter}"] = f"Find Letter {spoken}"  # round prompt
    # Must match the dino names in games/dino-racing.html (DINO_STYLES[].name)
    for name in ["Rex", "Sunny", "Fern", "Misty", "Sky", "Violet", "Rosie"]:
        phrases[f"win_{name.lower()}"] = f"{name} wins the race! Hooray!"
    phrases["back_to_start"] = "Oh no! Back to start!"
    # Shared positive-reinforcement clips, played on a correct answer. Keep
    # PRAISE_KEYS in games/dino-racing.html in sync with these keys.
    praise = [
        "Great job!",
        "Way to go!",
        "You did it!",
        "Awesome work!",
        "Super star!",
    ]
    for i, line in enumerate(praise, start=1):
        phrases[f"praise_{i}"] = line
    return phrases


def main():
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print(
            "Missing ELEVENLABS_API_KEY. Set it to generate audio.\n"
            "Example:  ELEVENLABS_API_KEY=... ./.venv/bin/python tools/generate_audio.py",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        from elevenlabs.client import ElevenLabs
        from elevenlabs import VoiceSettings
    except ImportError:
        print(
            "The 'elevenlabs' package is not installed for this interpreter.\n"
            "Install it, e.g.:  python3 -m venv .venv && ./.venv/bin/python -m pip install elevenlabs",
            file=sys.stderr,
        )
        sys.exit(1)

    client = ElevenLabs(api_key=api_key)

    LETTERS_DIR.mkdir(parents=True, exist_ok=True)
    PRAISE_DIR.mkdir(parents=True, exist_ok=True)
    GAME_DIR.mkdir(parents=True, exist_ok=True)
    phrases = build_phrases()
    print(
        f"Generating {len(phrases)} clips with provider=elevenlabs, "
        f"voice={VOICE}, model={MODEL}, speed={SPEED}."
    )
    print(
        f"Output: {LETTERS_DIR} (shared letters) + {GAME_DIR} (game)"
        + (" (overwriting)" if OVERWRITE else " (skipping existing)")
    )

    generated, skipped, failed = [], [], []
    char_count = 0

    for key, text in phrases.items():
        out_file = dir_for_key(key) / f"{key}.mp3"
        if out_file.exists() and not OVERWRITE:
            skipped.append(key)
            continue
        try:
            # Mirrors the validated SDK snippet. convert() returns an iterator
            # of byte chunks, so join them before writing.
            audio = client.text_to_speech.convert(
                text=text,
                voice_id=VOICE,
                model_id=MODEL,
                output_format=OUTPUT_FORMAT,
                voice_settings=VoiceSettings(speed=SPEED),
            )
            data = b"".join(audio)
            out_file.write_bytes(data)
            generated.append(key)
            char_count += len(text)
            print(f"  ok   {key}  ({len(data)} bytes)")
        except Exception as err:  # keep going on per-clip failures
            failed.append(key)
            print(f"  FAIL {key}: {err}", file=sys.stderr)

    # One manifest per folder = every key whose MP3 actually exists there now.
    # Shape matches what js/common.js Arcade.AudioBank expects
    # ({ ..., "keys": [...] }).
    total_keys = 0
    for out_dir in (LETTERS_DIR, PRAISE_DIR, GAME_DIR):
        existing = [
            k
            for k in phrases
            if dir_for_key(k) == out_dir and (out_dir / f"{k}.mp3").exists()
        ]
        manifest = {
            "provider": "elevenlabs",
            "voice": VOICE,
            "model": MODEL,
            "keys": existing,
        }
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
        total_keys += len(existing)
        print(f"  manifest:  {out_dir / 'manifest.json'} ({len(existing)} keys)")

    print("\nDone.")
    print(f"  generated: {len(generated)}")
    print(f"  skipped:   {len(skipped)}")
    print(f"  failed:    {len(failed)}")
    print(f"  total:     {total_keys} keys across both manifests")
    print(f"  usage:     ~{char_count} characters this run.")
    if failed:
        print(f"  NOTE: {len(failed)} clip(s) failed; re-run to retry just those.")


if __name__ == "__main__":
    main()
