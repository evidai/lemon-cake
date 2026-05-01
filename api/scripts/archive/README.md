# Archived Scripts

これらは一度だけ本番 DB に対して実行された one-shot 修正スクリプトです。
保存目的は監査・将来の参考用。**もう一度実行する必要はないはず** (実行すると重複処理になる可能性あり)。

| Script | 何をしたか | いつ |
|--------|-----------|-----|
| `bump-low-prices.ts` | 全サービスの単価を最低 $0.005 に引き上げ (採算ガード対応) | 2026-05-01 |
| `cleanup-test-buyers.ts` | テスト用 buyer の削除 | — |
| `clear-test-balance.ts` | test@aievid.com の USDC 残高を 0 に | 2026-05-01 |
| `credit-stripe-payment.ts` | Webhook 不達の Stripe 決済 ¥786 を手動クレジット | 2026-05-01 |
| `fix-serper-endpoint.ts` | Serper の endpoint を `/search` 含む形から base URL に修正 | 2026-05-01 |
| `fix-stripe-webhook.ts` | 旧 Railway URL → `api.lemoncake.xyz` + checkout.session.completed イベント追加 | 2026-05-01 |
| `hide-aftership.ts` | AfterShip サービスを PENDING に (auth 未設定) | 2026-05-01 |
| `hide-broken-services.ts` / `-v2.ts` | endpoint 未設定の 15 サービスを PENDING に | 2026-05-01 |
| `sandbox-token.ts` | デモトークンを sandbox=true に設定 (テスト用) | 2026-05-01 |
| `set-endpoint.ts` | test-service と Serper の endpoint を初回設定 | 2026-05-01 |
| `set-serper-auth.ts` | Serper の `X-API-Key` を authHeader に設定 | 2026-05-01 |
| `unsandbox-demo-token.ts` | デモトークンを sandbox=false に切替 (本番化) | 2026-05-01 |

## 再実行が必要な場合

DB を再 seed したり、復旧作業で同じ操作が必要なら、これらをコピーして使う。
ID やアドレスは hard-coded されているので、現環境に合わせて書き換えること。
