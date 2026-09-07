# SMRUTI

A life memory for every Indian. Your health records, read once and remembered — so the pattern
across ten years is visible to you, not locked inside five different hospitals.

Built for Smart India Hackathon. React Native (Expo) app, Node extraction server, NVIDIA NIM models.

---

## What it does

You sign in, then pick a medical report from your phone — a PDF or a photo. SMRUTI reads it,
pulls out the numbers that matter, and forgets the file. Once several reports are in, it shows
you the shape of the years — and raises the warning that no single report could.

| Screen | What it does |
|---|---|
| **Memory** | Add a report from your phone. See every report you have added, on a timeline. |
| **Patterns** | Charts each measurement across years. Raises an early warning when a series drifts. |
| **Ask** | Ask anything about your own reports, in English, Hindi or Telugu. |
| **Yours** | What is stored, where, who you are signed in as, and a button that erases all of it. |

---

## Quick start

Runs on WSL (Ubuntu). You need the **Expo Go** app on your phone, with the phone
on the same Wi-Fi as this machine.

### 1. Server

```bash
cd ~/smruti/server
npm install
cp .env.example .env      # then put your NVIDIA key in it
npm start
```

Check it: `curl http://localhost:8787/api/health`

### 2. App

```bash
cd ~/smruti/mobile
npm install
npm run start:lan
```

Scan the QR code with Expo Go.

Use `start:lan`, not `expo start`. Under WSL, Expo advertises `localhost`, which
your phone cannot dial — and the app works out the server address from that same
host, so the wrong value breaks the bundle download *and* every server call.
`start:lan` pins both to this machine's LAN address.

### 3. Try it

Create an account on the sign-in screen, then tap **+** and choose a file from
`samples/` (copy one onto the phone first, or just photograph a report).

---

## WSL networking

WSL2 normally sits behind NAT, so nothing inside it is reachable from your phone.
This project relies on **mirrored networking**, set once in `%USERPROFILE%\.wslconfig`
on the Windows side:

```ini
[wsl2]
networkingMode=mirrored
dnsTunneling=true
autoProxy=true
```

Apply it with `wsl --shutdown`, then reopen WSL. Check it worked — `hostname -I`
inside WSL should return the same address as your Windows Wi-Fi adapter, not a
`172.23.x` NAT address. To undo, delete the file and run `wsl --shutdown`.

**If your phone still cannot connect,** the Wi-Fi itself is likely blocking it.
Office and campus networks often enable client isolation, which stops phones from
reaching laptops regardless of any of this. Two ways round it:

```bash
npm run start:lan -- --tunnel   # routes through Expo's relay, needs internet
```

or put both devices on your phone's hotspot.

The server binds to all interfaces, so once Metro is reachable the API is too.

---

## Getting the NVIDIA key

1. Go to <https://build.nvidia.com> and sign in (free).
2. Open any model, e.g. [nemotron-parse](https://build.nvidia.com/nvidia/nemotron-parse).
3. Click **Get API Key**. It starts with `nvapi-`.
4. Put it in `server/.env` as `NVIDIA_API_KEY=`.

One key covers every model. Verify yours reaches all three:

```bash
cd server && npx tsx src/probe.ts
```

That runs a real report through both extraction stages and prints the facts it found.

---

## Troubleshooting on WSL

**`libasound.so.2: cannot open shared object file`**

React Native DevTools is an Electron app, and a bare Ubuntu image is missing one
of its libraries. Install it:

```bash
sudo apt install -y libasound2t64
```

On Ubuntu 24.04 the package is `libasound2t64`, not `libasound2` — it was renamed
in the 64-bit time_t transition. Everything else Electron needs (GTK, NSS, GBM,
ATK, X11) is already in the default image.

This error is **not fatal**. It only affects the DevTools debugger window; Metro
serves the bundle normally and the app runs on your phone either way. Ignore it if
you are not using the debugger.

**A GUI window will not open**

Check WSLg is on: `echo $DISPLAY` should print `:0` and `/mnt/wslg` should exist.

**Metro starts but the phone cannot load the bundle**

See the WSL networking section above. In order: confirm `hostname -I` matches your
Windows Wi-Fi address, confirm you used `npm run start:lan`, then suspect Wi-Fi
client isolation.

---

## The models, and why each one

| Stage | Model | Why |
|---|---|---|
| Read the document | `nvidia/nemotron-parse` | A document VLM. Keeps table structure and reading order, which is what a lab report *is*. Generic OCR flattens it into word soup. |
| Structure the facts | `nvidia/nemotron-3-super-120b-a12b` | Turns messy markdown into typed rows while preserving the measurement names printed in the report. |
| Answer in English / Hindi | `nvidia/nemotron-3-super-120b-a12b` | Fluent, grounded answers over the user's own facts. |
| Answer in Telugu | `nvidia/nemotron-3-ultra-550b-a55b` | See below. |

### Two findings worth knowing

**Telugu needs Ultra, not Super.** Measured against the live endpoints: `nemotron-3-super-120b`
produced Telugu contaminated with Devanagari and romanised words, collapsed into token repetition,
and rendered a *rising* trend as **"improving"** — inverting the clinical meaning. Ultra produced
correct, clean Telugu. Telugu is routed to Ultra in `server/src/config.ts`.

**`riva-translate` cannot do Telugu.** It supports 37 languages; Telugu is not among them. Asked
for Telugu it silently answers in Hindi, with no error. It is used for Hindi only.

### How nemotron-parse actually behaves

Its API differs from every other chat model here, and the differences are load-bearing:

- It **rejects text input**. A `{"type":"text"}` part returns `400 does not support text input`.
  The documented control tokens for the self-hosted container are not accepted on the hosted
  endpoint. Send the image and nothing else.
- It accepts **exactly one message**. A system message returns `400 Expected exactly one message`.
- It returns **nothing in `message.content`**. The result arrives as a tool call named
  `markdown_bbox` whose arguments are a JSON array of `{bbox, text, type}` blocks.
- Inline base64 must stay under ~180 KB or the request hangs rather than erroring. Pages are
  downscaled to JPEG first (`server/src/util/image.ts`).

---

## Where the API key lives

```
server/.env  →  server/src/config.ts  →  server/src/nim/client.ts  →  Authorization header
```

That is the only path. The key is never in the app, never in source, never in git. The phone
talks only to your server. If the app called NVIDIA directly, anyone could unzip the APK and
take the key.

---

## Where your data lives

```
your phone            the original scan, untouched, still yours
    ↓
server                bytes held in memory for two model calls, then dropped
    ↓                 (never written to disk, no bucket, nothing to leak)
Supabase (Postgres)   the results, under your account, guarded by row-level
    ↓                 security so no one else's query can return them
phone (SQLite)        a mirror, so the app works with no network.
                      Erased on sign-out.
```

The server writes nothing to disk and keeps no database. A 4 MB scan becomes a handful of rows
like `2024-03-11 | HbA1c | 6.4 | % | Dr. Rao`.

**Honest limit:** the phone database is not encrypted at rest. Expo Go cannot load SQLCipher;
that needs a development build. A per-install key in the hardware keystore signs each row so
stored values cannot be silently altered, but that is integrity, not confidentiality. The
Privacy screen says so in the app rather than implying protection that is not there.

---

## The warning is computed, not generated

`server/src/health/trends.ts` is plain TypeScript. It groups facts by the report's measurement
name and unit, requires at least three dates, fits a least-squares slope, and compares each value
only with the reference range printed on that report. It does not contain disease aliases or
universal clinical thresholds.

**No model is asked whether the user is at risk.** A model is only asked to restate, in the
user's language, a finding the code already proved. This matters twice: a judge asking "what if
it hallucinated that?" gets a real answer, and an invented medical warning is the one bug in this
product that could actually hurt somebody.

It is covered by tests, including the exact scenario from the pitch:

```bash
cd server && npm test
```

---

## Offline demo mode

Set `SMRUTI_MOCK=1` in `server/.env`. The server returns the five-year series from fixtures and
never calls NVIDIA. The demo then survives dead venue Wi-Fi or an expired key.

---

## Sample data

`samples/` holds five generated lab reports — 2021 to 2025, five different Hyderabad hospitals.
Every value sits inside its own printed reference range, so no single report looks abnormal. Only
the series gives it away:

```
HbA1c   2021: 5.6   2022: 5.8   2023: 6.0   2024: 6.2   2025: 6.4   (%)
```

Regenerate with `python samples/make_reports.py`. The data is synthetic.

---

## Layout

```
server/
  src/
    config.ts          all credentials and model ids
    schema.ts          the fact shape and formatting-only normalization
    pipeline.ts        an uploaded file in, facts out
    auth.ts            verifies the caller's Supabase token
    mock.ts            offline fixtures
    nim/
      client.ts        the only place the key is attached to a request
      parse.ts         stage 1, nemotron-parse
      extract.ts       stage 2, markdown to typed JSON
      answer.ts        multilingual answering
    health/trends.ts   the deterministic trend detector
    util/image.ts      downscaling for the inline size limit
  test/                26 tests, no network needed
mobile/
  src/
    theme.ts           palette and type scale
    api.ts             server client, finds the dev machine automatically
    db.ts              on-device SQLite
    components/        the thread, the chart, the warning
    screens/           Memory, Patterns, Ask, Yours
samples/               five generated lab reports
```

---

## Not a medical device

SMRUTI surfaces patterns in documents you already own. It does not diagnose, and it is not a
substitute for a doctor. Every warning it shows says so.
