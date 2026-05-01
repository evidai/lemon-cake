import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const all = await p.service.findMany({
    select: {
      id: true, name: true, type: true, pricePerCallUsdc: true,
      endpoint: true, authHeader: true, reviewStatus: true, verified: true,
    },
    orderBy: [{ reviewStatus: "asc" }, { name: "asc" }],
  });

  console.log(`=== Total ${all.length} services ===\n`);
  console.log("status\tendpoint\tauth\tname");
  console.log("------\t--------\t----\t----");

  let ok = 0, no_endpoint = 0, no_auth = 0;
  for (const s of all) {
    const ep = s.endpoint ? "✓" : "✗";
    const au = s.authHeader ? "✓" : "✗";
    const status = s.reviewStatus === "APPROVED" && s.verified ? "OK" : s.reviewStatus;
    console.log(`${status}\t${ep}\t\t${au}\t${s.name}`);
    if (s.reviewStatus === "APPROVED" && s.verified) {
      if (!s.endpoint) no_endpoint++;
      else if (!s.authHeader) no_auth++;
      else ok++;
    }
  }
  console.log(`\nAPPROVED+verified breakdown:`);
  console.log(`  endpoint+auth (likely working): ${ok}`);
  console.log(`  endpoint only (auth=none, may work for free APIs): ${no_auth}`);
  console.log(`  no endpoint (broken, will 501): ${no_endpoint}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
