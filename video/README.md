# LemonCake Launch Video

30-second launch video built with [Remotion](https://www.remotion.dev/). No external footage — all visuals generated from React + CSS.

## Compositions

| id             | size       | use                              |
| -------------- | ---------- | -------------------------------- |
| `LaunchVideo`  | 1920×1080  | X, YouTube, Product Hunt, README |
| `LaunchShorts` | 1080×1920  | Shorts / Reels / TikTok          |

Both are 30s @ 30fps (900 frames).

## Setup

```bash
cd video
npm install
```

## Preview (live editor)

```bash
npm run dev
```

Opens Remotion Studio at `http://localhost:3000`.

## Render

```bash
npm run render          # → out/launch.mp4        (horizontal)
npm run render:shorts   # → out/launch-shorts.mp4 (vertical)
npm run render:gif      # → out/launch.gif        (for README hero)
```

## Scenes

1. **Hook** (0–3s) — "I gave my AI agent a $2 wallet."
2. **BalanceDrop** (3–15s) — terminal + balance card animating $2.000 → $1.353
3. **KillSwitch** (15–23s) — pulsing REVOKE button → 422 error
4. **Outro** (23–30s) — 🍋 logo, wordmark, CTA

## Editing

- Copy & colors: `src/theme.ts`
- Scenes & timing: `src/LaunchVideo.tsx`
- Durations / dimensions: `src/index.tsx`

Brand colors stay in sync with `dashboard/app/about/page.tsx`.
