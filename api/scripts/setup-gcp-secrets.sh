#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# KYAPay — GCP Secret Manager 初期セットアップスクリプト
#
# 使い方:
#   1. .env に値を設定する
#   2. gcloud auth login 済みであること
#   3. bash scripts/setup-gcp-secrets.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# ─── 設定 ────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-kyapay-prod}"
REGION="asia-northeast1"  # 東京

echo "📦 Project: $PROJECT_ID"

# ─── プロジェクト & API 有効化 ────────────────────────────────
gcloud config set project "$PROJECT_ID"
gcloud services enable secretmanager.googleapis.com --project="$PROJECT_ID"

echo "✅ Secret Manager API enabled"

# ─── .env から値を読み込む関数 ───────────────────────────────
load_env() {
  local key=$1
  # .env ファイルから KEY=VALUE 形式で読み込む（コメント・空行スキップ）
  grep -E "^${key}=" .env 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"'
}

# ─── シークレット登録関数 ────────────────────────────────────
register_secret() {
  local name=$1
  local value=$2

  if [[ -z "$value" ]]; then
    echo "⚠️  SKIP: $name (empty value — set it in .env first)"
    return
  fi

  # シークレットが存在しなければ作成
  if ! gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    gcloud secrets create "$name" \
      --replication-policy=automatic \
      --project="$PROJECT_ID"
    echo "🆕 Created secret: $name"
  else
    echo "🔄 Updating secret: $name"
  fi

  # 新バージョンを追加
  echo -n "$value" | gcloud secrets versions add "$name" \
    --data-file=- \
    --project="$PROJECT_ID"

  echo "✅ $name registered"
}

# ─── 各シークレットを登録 ────────────────────────────────────
echo ""
echo "🔐 Registering secrets..."

register_secret "JWT_SECRET"              "$(load_env JWT_SECRET)"
register_secret "ADMIN_JWT_SECRET"        "$(load_env ADMIN_JWT_SECRET)"
register_secret "DATABASE_URL"            "$(load_env DATABASE_URL)"
register_secret "REDIS_URL"               "$(load_env REDIS_URL)"
register_secret "POLYGON_RPC_URL"         "$(load_env POLYGON_RPC_URL)"
register_secret "HOT_WALLET_PRIVATE_KEY"  "$(load_env HOT_WALLET_PRIVATE_KEY)"

echo ""
echo "🎉 Done! All secrets registered to GCP Secret Manager."
echo ""
echo "次のステップ:"
echo "  1. Cloud Run サービスアカウントに roles/secretmanager.secretAccessor を付与"
echo "     gcloud projects add-iam-policy-binding $PROJECT_ID \\"
echo "       --member='serviceAccount:YOUR_SA@$PROJECT_ID.iam.gserviceaccount.com' \\"
echo "       --role='roles/secretmanager.secretAccessor'"
echo ""
echo "  2. Cloud Run にデプロイ:"
echo "     gcloud run deploy kyapay-api \\"
echo "       --source . \\"
echo "       --region $REGION \\"
echo "       --set-env-vars GCP_PROJECT_ID=$PROJECT_ID,NODE_ENV=production"
