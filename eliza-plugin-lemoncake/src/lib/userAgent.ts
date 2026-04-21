/**
 * LemonCake Plugin User-Agent
 *
 * 全ての LemonCake API リクエストに付与して、バックエンド側で
 * 「どのプラグイン経由での呼び出しか」を集計できるようにする。
 *
 * 送信される情報は匿名（プラグイン名・バージョン・Node.js バージョン・
 * プラットフォームのみ）で、ユーザーを特定する情報は含まない。
 */

// tsc が import attributes / json import を拒否するので __PACKAGE_VERSION__ で埋める
// package.json は files に含めないため、build 時にこの定数を更新する。
const PLUGIN_NAME    = "eliza-plugin-lemoncake";
const PLUGIN_VERSION = "0.3.0";

/** `eliza-plugin-lemoncake/0.2.0 (node/23.x; darwin arm64)` のような形式 */
export function buildUserAgent(): string {
  const nodeVersion = typeof process !== "undefined" && process.versions?.node
    ? process.versions.node
    : "unknown";
  const platform = typeof process !== "undefined" && process.platform
    ? process.platform
    : "unknown";
  const arch = typeof process !== "undefined" && process.arch
    ? process.arch
    : "unknown";

  return `${PLUGIN_NAME}/${PLUGIN_VERSION} (node/${nodeVersion}; ${platform} ${arch})`;
}

export const LEMONCAKE_USER_AGENT = buildUserAgent();
