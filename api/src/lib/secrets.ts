// Railway 環境変数を直接使用するため GCP Secret Manager は不要
export async function loadSecretsFromGCP(): Promise<void> {
  console.log("[Secrets] Using Railway environment variables directly");
}
