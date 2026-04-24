import Link from "next/link";

export const metadata = {
  title: "LemonCake Dify Plugin — Privacy Policy",
  description:
    "Privacy policy for the LemonCake plugin on the Dify Marketplace: what data is transmitted, where it is stored, and how it is deleted.",
};

export default function DifyPluginPrivacyPage() {
  return (
    <main className="min-h-screen bg-[#fffd43] text-[#1a0f00]">
      <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <nav className="mb-10 text-sm font-medium">
          <Link href="/" className="hover:underline">← Home</Link>
          <span className="mx-2 opacity-40">/</span>
          <Link href="/about" className="hover:underline">About</Link>
          <span className="mx-2 opacity-40">/</span>
          <span className="opacity-60">Legal — Dify Plugin</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
          LemonCake Dify Plugin — Privacy Policy
        </h1>
        <p className="text-sm opacity-60 mb-10">Last updated: 2026-04-20</p>

        <p className="text-base leading-relaxed mb-8">
          This policy describes what data the <strong>LemonCake for Dify</strong> plugin transmits,
          where it is processed, and how long it is retained. The plugin is distributed by{" "}
          <strong>evidai / LemonCake</strong> (contact@aievid.com). The canonical version of this
          document lives at <code className="bg-black/10 px-1 rounded">lemoncake.xyz/legal/dify-plugin</code>{" "}
          and must match the copy shipped inside the plugin package on GitHub.
        </p>

        <Section title="1. What the plugin does">
          <p>
            The plugin is a thin HTTP client that calls the LemonCake API
            (<code>https://api.lemoncake.xyz</code> by default) using the Buyer JWT that the
            plugin user supplies during setup. It exposes four tools:{" "}
            <code>issue_pay_token</code>, <code>check_balance</code>, <code>revoke_token</code>,
            and <code>list_charges</code>.
          </p>
          <p>
            The plugin itself does not maintain a database, does not write to disk, and does
            not call any third-party service other than the LemonCake API endpoint configured
            in its credentials.
          </p>
        </Section>

        <Section title="2. Data the plugin sends to LemonCake">
          <table className="w-full text-sm mt-4 border-collapse">
            <thead>
              <tr className="border-b-2 border-black/20">
                <th className="text-left py-2 pr-4">Context</th>
                <th className="text-left py-2">Data transmitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              <tr>
                <td className="py-2 pr-4 font-mono">_validate_credentials</td>
                <td className="py-2"><code>Authorization: Bearer &lt;buyer-jwt&gt;</code> only</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono">issue_pay_token</td>
                <td className="py-2">serviceId, limitUsdc, expiresInSeconds, sandbox</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono">check_balance</td>
                <td className="py-2">None (JWT only)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono">revoke_token</td>
                <td className="py-2">tokenId</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono">list_charges</td>
                <td className="py-2">limit</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-4">
            The plugin does <strong>not</strong> read Dify conversation content, user
            messages, file uploads, or any other tool outputs. It only sends the exact
            parameters enumerated above.
          </p>
        </Section>

        <Section title="3. Data LemonCake returns">
          <ul className="list-disc pl-6 space-y-1">
            <li>Pay Token metadata (id, expiry, limit, status)</li>
            <li>Buyer profile summary (id, balance, KYA tier, daily limit)</li>
            <li>Charge records (serviceId, amountUsdc, timestamp, sandbox flag)</li>
          </ul>
        </Section>

        <Section title="4. Where data is stored">
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Buyer JWT</strong> — stored in Dify&rsquo;s encrypted credential store (owned by the
              Dify instance operator). The plugin never writes it anywhere else.
            </li>
            <li>
              <strong>Charges, tokens, audit logs</strong> — stored by LemonCake in a managed
              Postgres database (ap-northeast-1 by default). Retention: 2 years for audit logs,
              7 years for charge records (Japanese electronic bookkeeping law), or until the
              buyer account is closed.
            </li>
            <li>
              <strong>Request logs at api.lemoncake.xyz</strong> — 30-day rolling retention.
              Contains path, status, buyer ID; does <em>not</em> contain Pay Token secrets or
              Dify conversation content.
            </li>
          </ul>
        </Section>

        <Section title="5. Third parties">
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Railway</strong> — infrastructure host for the LemonCake API.</li>
            <li>
              <strong>Polygon network</strong> — settlement layer for USDC/JPYC transfers.
              On-chain data is public by design.
            </li>
            <li>
              <strong>freee / QuickBooks / Xero / Zoho / Sage / NetSuite</strong> — only
              called if the buyer has explicitly connected their own accounting account via
              LemonCake&rsquo;s OAuth flow. Never called from this plugin directly.
            </li>
          </ul>
          <p className="mt-3">
            The plugin does <strong>not</strong> send data to any analytics, advertising,
            or tracking third party.
          </p>
        </Section>

        <Section title="6. User rights">
          <ul className="list-disc pl-6 space-y-1">
            <li>Request a copy of all tokens and charges tied to a Buyer ID.</li>
            <li>Revoke any or all Pay Tokens immediately via <code>revoke_token</code> or the dashboard.</li>
            <li>
              Delete a Buyer account, which permanently removes tokens, charges, and audit
              logs after a 30-day grace window.
            </li>
          </ul>
          <p className="mt-3">All requests: contact@aievid.com.</p>
        </Section>

        <Section title="7. Security">
          <ul className="list-disc pl-6 space-y-1">
            <li>TLS 1.2+ enforced for every request.</li>
            <li>Buyer JWTs are HMAC-SHA256 (HS256) signed on LemonCake&rsquo;s side; migration to Ed25519 asymmetric keys is planned for v0.1.0.</li>
            <li>
              The upstream LemonCake API enforces rate limits, idempotency keys, and atomic
              revoke for race-safe kill-switch operation.
            </li>
            <li>
              Source code of the plugin is public under{" "}
              <a
                href="https://github.com/evidai/lemon-cake/tree/main/integrations/dify/lemoncake"
                className="underline font-medium"
              >
                /integrations/dify/lemoncake
              </a>{" "}
              for independent review.
            </li>
          </ul>
        </Section>

        <Section title="8. Changes to this policy">
          <p>
            Material changes are published at this URL and surfaced in the plugin&rsquo;s README.
            The <em>Last updated</em> date at the top is authoritative.
          </p>
        </Section>

        <Section title="9. Contact">
          <ul className="list-disc pl-6 space-y-1">
            <li>Email: contact@aievid.com</li>
            <li>
              Issues:{" "}
              <a href="https://github.com/evidai/lemon-cake/issues" className="underline">
                github.com/evidai/lemon-cake/issues
              </a>
            </li>
          </ul>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-2xl font-bold mb-3">{title}</h2>
      <div className="text-base leading-relaxed space-y-3">{children}</div>
    </section>
  );
}
