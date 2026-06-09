#!/usr/bin/env node
/* ===========================================================================
   Pre-recorded voice clip generator for the iPad Arcade games.

   Provider-agnostic: pick a TTS provider + key via env vars, run this once,
   and it writes MP3 clips + a manifest.json that the games load at runtime.
   If you never run it (or no key is set), the games fall back to the browser's
   built-in speechSynthesis, so nothing breaks.

   ---- Usage -----------------------------------------------------------------
     # ElevenLabs (default provider; default voice = "Josh - teacher for kids")
     ELEVENLABS_API_KEY=...  node tools/generate-audio.mjs

     # ...or override the voice explicitly
     ELEVENLABS_API_KEY=...  TTS_VOICE=nzFihrBIvB34imQBuxub \
       node tools/generate-audio.mjs

     # ...or use OpenAI instead
     TTS_PROVIDER=openai  OPENAI_API_KEY=sk-...  node tools/generate-audio.mjs

   ---- Env vars --------------------------------------------------------------
     TTS_PROVIDER       elevenlabs (default) | openai   [google|polly|azure = TODO]
     ELEVENLABS_API_KEY required when TTS_PROVIDER=elevenlabs
     OPENAI_API_KEY     required when TTS_PROVIDER=openai
     TTS_VOICE          optional voice override (provider-specific)
     TTS_MODEL          optional model override (provider-specific)
     TTS_OVERWRITE=1    re-generate clips that already exist (default: skip)

   Idempotent: existing <key>.mp3 files are skipped unless TTS_OVERWRITE=1.
   Requires Node 18+ (uses built-in fetch). No external dependencies.
   =========================================================================== */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Output is split into shared libraries + a game folder:
//   audio/letters/ — shared, game-agnostic letter clips (letter_*/find_*).
//   audio/praise/  — shared positive-reinforcement clips (praise_*).
//   audio/dino/    — clips specific to Dinosaur Racing (win_*/back_to_start).
const AUDIO_DIR = path.join(__dirname, "..", "audio");
const LETTERS_DIR = path.join(AUDIO_DIR, "letters");
const PRAISE_DIR = path.join(AUDIO_DIR, "praise");
const GAME_DIR = path.join(AUDIO_DIR, "dino");

// Reusable letter/prompt and praise clips go to shared libraries; the rest stay
// with the game.
const dirForKey = (key) =>
  /^(letter_|find_)/.test(key)
    ? LETTERS_DIR
    : /^praise_/.test(key)
    ? PRAISE_DIR
    : GAME_DIR;

const PROVIDER = (process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();
const OVERWRITE = process.env.TTS_OVERWRITE === "1";
// A calm, slightly slow, kid-friendly pace where the provider supports it.
const SPEED = 0.9;

// Default ElevenLabs voice: "Josh - teacher for kids" (user-provided Voice ID).
// NOTE: add this voice to your ElevenLabs account (Voice Library -> Add) so your
// API key can use it. Override anytime with TTS_VOICE=<voiceId>.
const ELEVENLABS_VOICE_ID = "nzFihrBIvB34imQBuxub"; // Josh - teacher for kids

/* ---------------------------------------------------------------------------
   Phrase manifest — EXACTLY what dino-racing.html speaks.
   Keep this data-driven so it's easy to extend for other games later.
   --------------------------------------------------------------------------- */
function buildPhrases() {
  const phrases = {};
  const A = "A".charCodeAt(0);
  for (let i = 0; i < 26; i++) {
    const L = String.fromCharCode(A + i);
    phrases["letter_" + L] = L; // standalone letter (sayLetter)
    phrases["find_" + L] = "Find Letter " + L; // round prompt (sayTarget)
  }
  // Must match the dino names in games/dino-racing.html (DINO_STYLES[].name)
  const DINOS = ["Rex", "Sunny", "Fern", "Misty", "Sky", "Violet", "Rosie"];
  DINOS.forEach((n) => {
    phrases["win_" + n.toLowerCase()] = n + " wins the race! Hooray!";
  });
  phrases["back_to_start"] = "Oh no! Back to start!";
  // Shared positive-reinforcement clips, played on a correct answer. Keep
  // PRAISE_KEYS in games/dino-racing.html in sync with these keys.
  const PRAISE = ["Great job!", "Way to go!", "You did it!", "Awesome work!", "Super star!"];
  PRAISE.forEach((line, i) => {
    phrases["praise_" + (i + 1)] = line;
  });
  return phrases;
}

/* ---------------------------------------------------------------------------
   Provider adapters. Each exposes:
     defaultVoice : string
     async synth(text, { voice, model }) -> Buffer (MP3 bytes)
   --------------------------------------------------------------------------- */
const adapters = {
  // ---- OpenAI (default) ----
  openai: {
    keyEnv: "OPENAI_API_KEY",
    defaultVoice: "nova", // friendly; "shimmer" is another nice option
    defaultModel: "gpt-4o-mini-tts", // or "tts-1"
    async synth(text, { voice, model }) {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.OPENAI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          voice,
          input: text,
          response_format: "mp3",
          speed: SPEED, // OpenAI supports a speed param (~0.9 = slightly slow)
        }),
      });
      if (!res.ok) {
        throw new Error("OpenAI TTS " + res.status + ": " + (await res.text()));
      }
      return Buffer.from(await res.arrayBuffer());
    },
  },

  // ---- ElevenLabs (default provider) ----
  elevenlabs: {
    keyEnv: "ELEVENLABS_API_KEY",
    // Default = "Josh - Teacher for Kids" (see ELEVENLABS_VOICE_ID above).
    // Override with TTS_VOICE=<voiceId>.
    defaultVoice: ELEVENLABS_VOICE_ID,
    defaultModel: "eleven_multilingual_v2",
    async synth(text, { voice, model }) {
      const res = await fetch(
        "https://api.elevenlabs.io/v1/text-to-speech/" +
          encodeURIComponent(voice),
        {
          method: "POST",
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: model,
            // ElevenLabs has no simple "speed" param; natural pace is fine.
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }
      );
      if (!res.ok) {
        throw new Error("ElevenLabs TTS " + res.status + ": " + (await res.text()));
      }
      return Buffer.from(await res.arrayBuffer());
    },
  },

  // ---- TODO: scaffold for other providers ----
  // google:  { keyEnv: "GOOGLE_API_KEY",  defaultVoice: "en-US-Neural2-F",
  //   async synth(text,{voice}) { /* POST https://texttospeech.googleapis.com/v1/text:synthesize, base64 audioContent */ } },
  // polly:   { keyEnv: "AWS_*", defaultVoice: "Joanna",
  //   async synth() { /* AWS SigV4 signing required; consider @aws-sdk/client-polly */ } },
  // azure:   { keyEnv: "AZURE_SPEECH_KEY", defaultVoice: "en-US-JennyNeural",
  //   async synth() { /* POST <region>.tts.speech.microsoft.com/cognitiveservices/v1 with SSML */ } },
};

async function main() {
  const adapter = adapters[PROVIDER];
  if (!adapter) {
    console.error(
      `Unknown TTS_PROVIDER="${PROVIDER}". Available: ${Object.keys(adapters).join(", ")} (google/polly/azure are TODO).`
    );
    process.exit(1);
  }
  if (adapter.keyEnv && !process.env[adapter.keyEnv]) {
    console.error(
      `Missing ${adapter.keyEnv}. Set it to generate audio with provider "${PROVIDER}".\n` +
        `Example:  ${adapter.keyEnv}=... node tools/generate-audio.mjs`
    );
    process.exit(1);
  }

  const voice = process.env.TTS_VOICE || adapter.defaultVoice;
  const model = process.env.TTS_MODEL || adapter.defaultModel;

  await mkdir(LETTERS_DIR, { recursive: true });
  await mkdir(PRAISE_DIR, { recursive: true });
  await mkdir(GAME_DIR, { recursive: true });
  const phrases = buildPhrases();
  const entries = Object.entries(phrases);

  console.log(
    `Generating ${entries.length} clips with provider="${PROVIDER}", voice="${voice}", model="${model}".`
  );
  console.log(
    `Output: ${LETTERS_DIR} (letters) + ${PRAISE_DIR} (praise) + ${GAME_DIR} (game)` +
      (OVERWRITE ? " (overwriting)" : " (skipping existing)")
  );

  const generated = [];
  const skipped = [];
  const failed = [];
  let charCount = 0;

  for (const [key, text] of entries) {
    const file = path.join(dirForKey(key), key + ".mp3");
    if (existsSync(file) && !OVERWRITE) {
      skipped.push(key);
      continue;
    }
    try {
      const buf = await adapter.synth(text, { voice, model });
      await writeFile(file, buf);
      generated.push(key);
      charCount += text.length;
      process.stdout.write(".");
    } catch (err) {
      failed.push(key);
      console.error(`\nFailed ${key}: ${err.message}`);
    }
  }
  process.stdout.write("\n");

  // One manifest per folder = every key whose MP3 actually exists there now.
  let totalKeys = 0;
  for (const outDir of [LETTERS_DIR, PRAISE_DIR, GAME_DIR]) {
    const existing = entries
      .map(([key]) => key)
      .filter(
        (key) =>
          dirForKey(key) === outDir &&
          existsSync(path.join(outDir, key + ".mp3"))
      );
    const manifest = { provider: PROVIDER, voice, model, keys: existing };
    await writeFile(
      path.join(outDir, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );
    totalKeys += existing.length;
    console.log(
      `  manifest:  ${path.join(outDir, "manifest.json")} (${existing.length} keys)`
    );
  }

  console.log(`\nDone.`);
  console.log(`  generated: ${generated.length}`);
  console.log(`  skipped:   ${skipped.length}`);
  console.log(`  failed:    ${failed.length}`);
  console.log(`  total:     ${totalKeys} keys across both manifests`);
  console.log(
    `  usage:     ~${charCount} characters billed this run (${PROVIDER}). ` +
      `Tiny — the full set is well under ~1.5k characters, so cost is a few cents at most.`
  );
  if (failed.length) {
    console.log(`  NOTE: ${failed.length} clip(s) failed; re-run to retry just those.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
