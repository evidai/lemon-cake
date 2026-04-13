/**
 * Google Cloud Secret Manager — シークレット取得ユーティリティ
 *
 * - 本番環境 (NODE_ENV=production) のみ GCP から取得
 * - 開発環境では .env をそのまま使用（何もしない）
 * - サーバー起動前に loadSecretsFromGCP() を await すること
 *
 * 必要な環境変数（本番のみ）:
 *   GCP_PROJECT_ID  — Google Cloud プロジェクト ID
 *   GOOGLE_APPLICATION_CREDENTIALS — サービスアカウントキー JSON パス
 *                                    (Cloud Run 上では不要: 自動認証)
 */

import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

// ─── GCP に登録するシークレット名の一覧 ──────────────────────
const SECRET_NAMES = [
  "HOT_WALLET_PRIVATE_KEY",
  "JWT_SECRET",
  "ADMIN_JWT_SECRET",
  "POLYGON_RPC_URL",
  "DATABASE_URL",
  "REDIS_URL",
] as const;

type SecretName = (typeof SECRET_NAMES)[number];

// ─── クライアントをシングルトンで保持 ────────────────────────
let _client: SecretManagerServiceClient | null = null;

function getClient(): SecretManagerServiceClient {
  if (!_client) _client = new SecretManagerServiceClient();
  return _client;
}

// ─── 単一シークレット取得 ─────────────────────────────────────
async function fetchSecret(
  projectId: string,
  name: SecretName,
): Promise<string> {
  const resourceName = `projects/${projectId}/secrets/${name}/versions/latest`;

  const [version] = await getClient().accessSecretVersion({
    name: resourceName,
  });

  const payload = version.payload?.data;
  if (!payload) throw new Error(`Secret ${name} has no payload`);

  return Buffer.isBuffer(payload)
    ? payload.toString("utf8")
    : payload.toString();
}

// ─── 起動時に全シークレットを一括取得して環境変数にセット ────
export async function loadSecretsFromGCP(): Promise<void> {
  // 開発・テスト環境はスキップ（.env をそのまま使用）
  if (process.env.NODE_ENV !== "production") {
    console.log("[Secrets] NODE_ENV !== production — using .env file");
    return;
  }

  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error("GCP_PROJECT_ID is not set (required in production)");
  }

  console.log(`[Secrets] Loading secrets from GCP project: ${projectId}`);

  // 並列取得（失敗したシークレットのみエラー）
  const results = await Promise.allSettled(
    SECRET_NAMES.map(async (name) => {
      const value = await fetchSecret(projectId, name);
      process.env[name] = value;
      return name;
    }),
  );

  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r, i) => `${SECRET_NAMES[i]}: ${r.reason}`);

  // 必須シークレットが取れなければ起動失敗
  // HOT_WALLET_PRIVATE_KEY は Phase 2（USDC送金）で必要になるまで任意
  const required: SecretName[] = [
    "JWT_SECRET",
    "DATABASE_URL",
  ];

  const missingRequired = results
    .map((r, i) => ({ r, name: SECRET_NAMES[i] }))
    .filter(({ r, name }) => r.status === "rejected" && required.includes(name))
    .map(({ name }) => name);

  if (missingRequired.length > 0) {
    throw new Error(
      `[Secrets] Required secrets missing: ${missingRequired.join(", ")}`,
    );
  }

  if (failed.length > 0) {
    console.warn("[Secrets] Some optional secrets could not be loaded:", failed);
  }

  console.log(
    "[Secrets] ✅ Loaded:",
    results
      .map((r, i) => (r.status === "fulfilled" ? SECRET_NAMES[i] : null))
      .filter(Boolean)
      .join(", "),
  );
}
