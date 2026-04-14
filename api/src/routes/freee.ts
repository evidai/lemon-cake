/**
 * GET /api/freee/callback — freee OAuth コールバック
 *
 * freee が認可コードをここに送ってくる。
 * コードを access_token / refresh_token に交換して環境変数に表示する。
 * （初回セットアップ用 — トークンをRailway環境変数に手動でセットする）
 */

import { Hono } from "hono";
import { exchangeFreeeCode } from "../lib/freee.js";

export const freeeRouter = new Hono();

// ─── OAuth コールバック ──────────────────────────────────────
freeeRouter.get("/callback", async (c) => {
  const code  = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    return c.html(`
      <h2>freee 認証エラー</h2>
      <p>${error}</p>
    `, 400);
  }

  if (!code) {
    return c.html(`<h2>コードが見つかりません</h2>`, 400);
  }

  try {
    const tokens = await exchangeFreeeCode(code);

    // ログ（Railway のログから確認できる）
    console.log("[freee] OAuth tokens obtained:", {
      accessToken:  tokens.accessToken.slice(0, 10) + "...",
      refreshToken: tokens.refreshToken.slice(0, 10) + "...",
    });

    // Railway 環境変数にセットする値をそのまま返す
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>freee OAuth 完了</title>
        <style>
          body { font-family: monospace; padding: 2rem; background: #f5f5f5; }
          .box { background: white; padding: 1.5rem; border-radius: 8px; margin: 1rem 0; border: 1px solid #ddd; }
          .label { font-size: 12px; color: #666; margin-bottom: 4px; }
          .value { font-size: 13px; word-break: break-all; background: #f0f0f0; padding: 8px; border-radius: 4px; }
          h2 { color: #2d7d2d; }
        </style>
      </head>
      <body>
        <h2>✅ freee OAuth 完了</h2>
        <p>以下の値を Railway 環境変数にセットしてください：</p>

        <div class="box">
          <div class="label">FREEE_ACCESS_TOKEN</div>
          <div class="value">${tokens.accessToken}</div>
        </div>

        <div class="box">
          <div class="label">FREEE_REFRESH_TOKEN</div>
          <div class="value">${tokens.refreshToken}</div>
        </div>

        <div class="box">
          <div class="label">FREEE_CLIENT_ID</div>
          <div class="value">${process.env.FREEE_CLIENT_ID ?? "(未設定)"}</div>
        </div>

        <div class="box">
          <div class="label">FREEE_CLIENT_SECRET</div>
          <div class="value">${process.env.FREEE_CLIENT_SECRET ?? "(未設定)"}</div>
        </div>

        <p style="color:#666; font-size:12px;">
          ⚠️ このページを閉じる前に上記のトークンを必ずコピーしてください。
        </p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("[freee] Callback error:", err);
    return c.html(`
      <h2>トークン交換エラー</h2>
      <pre>${err instanceof Error ? err.message : String(err)}</pre>
    `, 500);
  }
});
