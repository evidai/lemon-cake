/**
 * POST /api/auth/login              — 管理者ログイン
 * POST /api/auth/register           — ユーザー登録（Buyer自動作成）
 * POST /api/auth/buyer-login        — ユーザーログイン
 * GET  /api/auth/me                 — 現在のユーザー情報取得
 * GET  /api/auth/google             — Google OAuth リダイレクト URL 取得
 * POST /api/auth/google/callback    — Google OAuth コールバック処理
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { signAdminToken, signBuyerToken, verifyBuyerToken } from "../lib/jwt.js";

export const authRouter = new Hono();

// ─── 管理者ログイン ──────────────────────────────────────────
authRouter.post(
  "/login",
  zValidator("json", z.object({ email: z.string().email(), password: z.string().min(1) })),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const adminEmail    = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      console.error("[Auth] ADMIN_EMAIL or ADMIN_PASSWORD env vars are not set");
      return c.json({ error: "管理者認証が設定されていません" }, 503);
    }
    if (email !== adminEmail || password !== adminPassword) {
      return c.json({ error: "メールアドレスまたはパスワードが正しくありません" }, 401);
    }
    const token = await signAdminToken();
    return c.json({ token, expiresIn: 86400 });
  },
);

// ─── ユーザー登録 ────────────────────────────────────────────
authRouter.post(
  "/register",
  zValidator("json", z.object({
    name:     z.string().min(1).max(50),
    email:    z.string().email(),
    password: z.string().min(8),
  })),
  async (c) => {
    const { name, email, password } = c.req.valid("json");

    // メール重複チェック
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return c.json({ error: "このメールアドレスは既に登録されています" }, 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // User + Buyer を同時作成（トランザクション）
    // Buyer の agent メールは登録メールをそのまま使用（同一エンティティのため）
    const autoEmail = email;
    const result = await prisma.$transaction(async (tx) => {
      const buyer = await tx.buyer.create({
        data: { name, email: autoEmail },
      });
      const user = await tx.user.create({
        data: { name, email, passwordHash, buyerId: buyer.id },
      });
      return { user, buyer };
    });

    const token = await signBuyerToken({
      userId:  result.user.id,
      buyerId: result.buyer.id,
      email:   result.user.email,
      name:    result.user.name,
    });
    return c.json({ token, expiresIn: 60 * 60 * 24 * 30 }, 201);
  },
);

// ─── ユーザーログイン ────────────────────────────────────────
authRouter.post(
  "/buyer-login",
  zValidator("json", z.object({ email: z.string().email(), password: z.string().min(1) })),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const user = await prisma.user.findUnique({ where: { email }, include: { buyer: true } });
    if (!user || !user.passwordHash) {
      return c.json({ error: "メールアドレスまたはパスワードが正しくありません" }, 401);
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return c.json({ error: "メールアドレスまたはパスワードが正しくありません" }, 401);
    }
    if (!user.buyerId || !user.buyer) {
      return c.json({ error: "アカウントデータが見つかりません" }, 404);
    }
    const token = await signBuyerToken({
      userId:  user.id,
      buyerId: user.buyerId,
      email:   user.email,
      name:    user.name,
    });
    return c.json({ token, expiresIn: 60 * 60 * 24 * 30 });
  },
);

// ─── 現在ユーザー情報取得 ────────────────────────────────────
authRouter.get("/me", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  try {
    const payload = await verifyBuyerToken(auth.slice(7));
    const user = await prisma.user.findUnique({
      where:   { id: payload.sub! },
      include: { buyer: true },
    });
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json({
      id:      user.id,
      name:    user.name,
      email:   user.email,
      buyerId: user.buyerId,
      buyer: user.buyer ? {
        id:            user.buyer.id,
        balanceUsdc:   user.buyer.balanceUsdc.toString(),
        kycTier:       user.buyer.kycTier,
        walletAddress: user.buyer.walletAddress,
        suspended:     user.buyer.suspended,
      } : null,
    });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});

// ─── OAuth state ストア（CSRF保護・10分TTL）─────────────────
const oauthStateStore = new Map<string, number>();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10分

function generateOAuthState(): string {
  // crypto.randomUUID() は Node.js 14.17+ / Web Crypto API で利用可能
  const state = crypto.randomUUID();
  oauthStateStore.set(state, Date.now() + OAUTH_STATE_TTL_MS);
  // 期限切れエントリを定期クリーンアップ
  for (const [key, expiry] of oauthStateStore) {
    if (Date.now() > expiry) oauthStateStore.delete(key);
  }
  return state;
}

function consumeOAuthState(state: string): boolean {
  const expiry = oauthStateStore.get(state);
  if (!expiry || Date.now() > expiry) return false;
  oauthStateStore.delete(state);
  return true;
}

// ─── Google OAuth: 認証URL取得 ───────────────────────────────
authRouter.get("/google", (c) => {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3001/auth/callback/google";
  if (!clientId) return c.json({ error: "Google OAuth not configured" }, 500);

  const state = generateOAuthState();

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "openid email profile",
    access_type:   "offline",
    prompt:        "select_account",
    state,
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ─── Google OAuth: コールバック処理 ──────────────────────────
authRouter.post(
  "/google/callback",
  zValidator("json", z.object({ code: z.string().min(1), state: z.string().min(1).optional() })),
  async (c) => {
    const { code, state } = c.req.valid("json");

    // state パラメータが渡された場合は検証（CSRF保護）
    if (state !== undefined && !consumeOAuthState(state)) {
      return c.json({ error: "Invalid or expired OAuth state parameter" }, 400);
    }
    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri  = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3001/auth/callback/google";

    if (!clientId || !clientSecret) {
      return c.json({ error: "Google OAuth not configured" }, 500);
    }

    // 1. code → access_token 交換
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenRes.ok || !tokenData.access_token) {
      return c.json({ error: "Google token exchange failed", detail: tokenData.error }, 400);
    }

    // 2. ユーザー情報取得
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userRes.json() as {
      id: string; email: string; name: string; picture?: string;
    };
    if (!userRes.ok || !googleUser.email) {
      return c.json({ error: "Failed to fetch Google user info" }, 400);
    }

    // 3. User + Buyer を upsert（既存ユーザーはログイン、新規は登録）
    let user = await prisma.user.findUnique({
      where:   { email: googleUser.email },
      include: { buyer: true },
    });

    if (!user) {
      // 新規登録: User + Buyer を同時作成
      const result = await prisma.$transaction(async (tx) => {
        const buyer = await tx.buyer.create({
          data: { name: googleUser.name, email: googleUser.email },
        });
        const newUser = await tx.user.create({
          data: {
            name:       googleUser.name,
            email:      googleUser.email,
            provider:   "google",
            externalId: googleUser.id,
            buyerId:    buyer.id,
          },
        });
        return { user: newUser, buyer };
      });
      user = { ...result.user, buyer: result.buyer };
    } else if (!user.externalId) {
      // 既存メール/パスワードユーザーに Google を紐付け
      await prisma.user.update({
        where: { id: user.id },
        data:  { externalId: googleUser.id, provider: "google" },
      });
    }

    if (!user.buyerId) {
      return c.json({ error: "Buyer account not found" }, 404);
    }

    const token = await signBuyerToken({
      userId:  user.id,
      buyerId: user.buyerId,
      email:   user.email,
      name:    user.name,
    });
    return c.json({ token, expiresIn: 60 * 60 * 24 * 30 });
  },
);

// ─── プロフィール更新 ────────────────────────────────────────
authRouter.patch(
  "/me",
  zValidator("json", z.object({
    name:          z.string().min(1).max(50).optional(),
    walletAddress: z.string().optional(),
  })),
  async (c) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
    try {
      const payload = await verifyBuyerToken(auth.slice(7));
      const body = c.req.valid("json");
      const user = await prisma.user.findUnique({ where: { id: payload.sub! } });
      if (!user) return c.json({ error: "User not found" }, 404);

      await prisma.$transaction(async (tx) => {
        if (body.name) {
          await tx.user.update({ where: { id: user.id }, data: { name: body.name } });
        }
        if (body.walletAddress !== undefined && user.buyerId) {
          await tx.buyer.update({ where: { id: user.buyerId }, data: { walletAddress: body.walletAddress } });
        }
      });
      return c.json({ success: true });
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  },
);
