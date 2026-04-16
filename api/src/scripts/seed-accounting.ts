/**
 * seed-accounting.ts
 *
 * グローバル会計 SaaS の Provider + Service をDBに登録するスクリプト
 *
 * 実行:
 *   npx tsx src/scripts/seed-accounting.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Platform wallet addresses for each provider
// (実際のウォレットアドレスに差し替えてください)
const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";

const PROVIDERS = [
  {
    name:          "QuickBooks Online (Intuit)",
    email:         "quickbooks@platform.lemoncake.xyz",
    walletAddress: process.env.QB_PROVIDER_WALLET        ?? `${PLATFORM_WALLET.slice(0, -2)}01`,
    services: [
      {
        name:            "QuickBooks — Accounts",
        type:            "API" as const,
        pricePerCallUsdc: "0.001",
        endpoint:        `https://quickbooks.api.intuit.com/v3/company/${process.env.QB_REALM_ID ?? "REALM_ID"}/`,
        authHeader:      "QB_OAUTH2",
      },
      {
        name:            "QuickBooks — Reports",
        type:            "API" as const,
        pricePerCallUsdc: "0.002",
        endpoint:        `https://quickbooks.api.intuit.com/v3/company/${process.env.QB_REALM_ID ?? "REALM_ID"}/reports/`,
        authHeader:      "QB_OAUTH2",
      },
    ],
  },
  {
    name:          "Xero",
    email:         "xero@platform.lemoncake.xyz",
    walletAddress: process.env.XERO_PROVIDER_WALLET      ?? `${PLATFORM_WALLET.slice(0, -2)}02`,
    services: [
      {
        name:            "Xero — Accounts & Invoices",
        type:            "API" as const,
        pricePerCallUsdc: "0.001",
        endpoint:        "https://api.xero.com/api.xro/2.0/",
        authHeader:      "XERO_OAUTH2",
      },
      {
        name:            "Xero — Payroll (AU)",
        type:            "API" as const,
        pricePerCallUsdc: "0.001",
        endpoint:        "https://api.xero.com/payroll.xro/1.0/",
        authHeader:      "XERO_OAUTH2",
      },
    ],
  },
  {
    name:          "Zoho Books",
    email:         "zoho@platform.lemoncake.xyz",
    walletAddress: process.env.ZOHO_PROVIDER_WALLET      ?? `${PLATFORM_WALLET.slice(0, -2)}03`,
    services: [
      {
        name:            "Zoho Books — Invoices & Expenses",
        type:            "API" as const,
        pricePerCallUsdc: "0.001",
        endpoint:        `https://www.zohoapis.${process.env.ZOHO_REGION ?? "com"}/books/v3/`,
        authHeader:      "ZOHO_OAUTH2",
      },
    ],
  },
  {
    name:          "Sage",
    email:         "sage@platform.lemoncake.xyz",
    walletAddress: process.env.SAGE_PROVIDER_WALLET      ?? `${PLATFORM_WALLET.slice(0, -2)}04`,
    services: [
      {
        name:            "Sage Accounting — Ledger Accounts",
        type:            "API" as const,
        pricePerCallUsdc: "0.001",
        endpoint:        "https://api.accounting.sage.com/v3.1/",
        authHeader:      "SAGE_OAUTH2",
      },
    ],
  },
  {
    name:          "Oracle NetSuite",
    email:         "netsuite@platform.lemoncake.xyz",
    walletAddress: process.env.NETSUITE_PROVIDER_WALLET  ?? `${PLATFORM_WALLET.slice(0, -2)}05`,
    services: [
      {
        name:            "NetSuite — REST Record API",
        type:            "API" as const,
        pricePerCallUsdc: "0.003",
        endpoint: process.env.NETSUITE_ACCOUNT_ID
          ? `https://${process.env.NETSUITE_ACCOUNT_ID.toLowerCase().replace(/_/g, "-")}.suitetalk.api.netsuite.com/services/rest/record/v1/`
          : "https://ACCOUNT_ID.suitetalk.api.netsuite.com/services/rest/record/v1/",
        authHeader: "NETSUITE_OAUTH1",
      },
      {
        name:            "NetSuite — SuiteQL",
        type:            "API" as const,
        pricePerCallUsdc: "0.005",
        endpoint: process.env.NETSUITE_ACCOUNT_ID
          ? `https://${process.env.NETSUITE_ACCOUNT_ID.toLowerCase().replace(/_/g, "-")}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`
          : "https://ACCOUNT_ID.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql",
        authHeader: "NETSUITE_OAUTH1",
      },
    ],
  },
];

async function main() {
  console.log("🌱 Seeding global accounting providers...\n");

  for (const providerDef of PROVIDERS) {
    const { services, ...providerData } = providerDef;

    // Upsert Provider
    const provider = await prisma.provider.upsert({
      where:  { email: providerData.email },
      update: { name: providerData.name },
      create: {
        ...providerData,
        active: true,
      },
    });

    console.log(`✅ Provider: ${provider.name} (${provider.id})`);

    for (const svcDef of services) {
      const existing = await prisma.service.findFirst({
        where: { providerId: provider.id, name: svcDef.name },
      });

      if (existing) {
        await prisma.service.update({
          where: { id: existing.id },
          data: {
            endpoint:         svcDef.endpoint,
            authHeader:       svcDef.authHeader,
            pricePerCallUsdc: svcDef.pricePerCallUsdc,
          },
        });
        console.log(`  ↻ Service updated: ${svcDef.name} (${existing.id})`);
      } else {
        const svc = await prisma.service.create({
          data: {
            providerId:       provider.id,
            name:             svcDef.name,
            type:             svcDef.type,
            pricePerCallUsdc: svcDef.pricePerCallUsdc,
            endpoint:         svcDef.endpoint,
            authHeader:       svcDef.authHeader,
            reviewStatus:     "APPROVED",
            verified:         true,
          },
        });
        console.log(`  ✚ Service created: ${svc.name} (${svc.id})`);
      }
    }
  }

  console.log("\n🎉 Done.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
