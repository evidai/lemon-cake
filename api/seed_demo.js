const { PrismaClient, Decimal } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const buyerId = "cmnuyqfcb0003a4ee8e9cxurx"; // test@aievid.com

  // 1. Provider upsert
  const provider = await prisma.provider.upsert({
    where: { buyerId },
    update: { name: "AIEVID Labs" },
    create: {
      name: "AIEVID Labs",
      email: "contact@aievid.com",
      walletAddress: "0xTestAievid000000000000000000000000000001",
      buyerId,
      active: true,
    },
  });
  console.log("Provider:", provider.id);

  // 2. Services upsert
  const servicesDefs = [
    { id: "demo_agent_search_api",    name: "Agent Search API",    type: "API", price: "0.0001" },
    { id: "demo_llm_proxy_gateway",   name: "LLM Proxy Gateway",   type: "API", price: "0.002"  },
    { id: "demo_document_parser_api", name: "Document Parser API", type: "API", price: "0.0005" },
    { id: "demo_agent_memory_mcp",    name: "Agent Memory MCP",    type: "MCP", price: "0.0003" },
  ];

  const services = [];
  for (const def of servicesDefs) {
    const s = await prisma.service.upsert({
      where: { id: def.id },
      update: { reviewStatus: "APPROVED", verified: true },
      create: {
        id: def.id,
        providerId: provider.id,
        name: def.name,
        type: def.type,
        pricePerCallUsdc: def.price,
        reviewStatus: "APPROVED",
        verified: true,
      },
    });
    services.push(s);
  }
  console.log("Services:", services.map(s => s.name).join(", "));

  // 3. ダミートークン（課金の参照用）
  const demoToken = await prisma.token.upsert({
    where: { id: "demo_charge_token_001" },
    update: {},
    create: {
      id: "demo_charge_token_001",
      buyerId,
      serviceId: services[0].id,
      limitUsdc: new Decimal("9999"),
      expiresAt: new Date("2030-01-01"),
    },
  });
  console.log("Token:", demoToken.id);

  // 4. 既存デモ課金を削除してから再作成
  await prisma.charge.deleteMany({ where: { idempotencyKey: { startsWith: "demo_" } } });

  // 5. デモ課金生成
  const now = Date.now();
  const patterns = [
    { service: services[0], dailyBase: 120, variance: 40,  price: 0.0001 },
    { service: services[1], dailyBase: 35,  variance: 15,  price: 0.002  },
    { service: services[2], dailyBase: 60,  variance: 20,  price: 0.0005 },
    { service: services[3], dailyBase: 80,  variance: 30,  price: 0.0003 },
  ];

  const charges = [];
  for (const pat of patterns) {
    for (let day = 30; day >= 0; day--) {
      const count = Math.max(1, Math.round(pat.dailyBase + (Math.random() - 0.5) * pat.variance));
      for (let i = 0; i < count; i++) {
        const offsetMs = (day * 86400 + Math.random() * 86400) * 1000;
        const ts = new Date(now - offsetMs);
        charges.push({
          buyerId,
          serviceId: pat.service.id,
          tokenId: demoToken.id,
          amountUsdc: new Decimal(pat.price.toFixed(6)),
          status: "COMPLETED",
          idempotencyKey: `demo_${pat.service.id}_d${day}_i${i}_${Math.random().toString(36).slice(2,8)}`,
          createdAt: ts,
          updatedAt: ts,
        });
      }
    }
  }

  // バッチ挿入
  const BATCH = 300;
  let inserted = 0;
  for (let i = 0; i < charges.length; i += BATCH) {
    await prisma.charge.createMany({ data: charges.slice(i, i + BATCH), skipDuplicates: true });
    inserted += Math.min(BATCH, charges.length - i);
    process.stdout.write(`\r課金データ挿入中: ${inserted}/${charges.length}`);
  }
  console.log("\n完了!");

  // 統計確認
  const stats = await prisma.charge.groupBy({
    by: ["serviceId"],
    _count: { id: true },
    _sum: { amountUsdc: true },
    where: { status: "COMPLETED", serviceId: { in: services.map(s => s.id) } },
  });
  console.log("\n=== 統計 ===");
  for (const s of services) {
    const g = stats.find(x => x.serviceId === s.id);
    console.log(`${s.name}: ${g?._count.id ?? 0}回 / $${g?._sum.amountUsdc ?? 0} USDC`);
  }

  // localStorage 注入用 JSON
  const lsData = services.map(s => ({
    id: s.id,
    name: s.name,
    description: `${s.name} — AI agent infrastructure by AIEVID Labs`,
    serviceType: s.type,
    priceModel: "PER_CALL",
    price: s.pricePerCallUsdc.toString(),
    status: "approved",
    createdAt: s.createdAt.toISOString(),
  }));
  console.log("\n=== localStorage JSON ===");
  console.log(JSON.stringify(lsData));
}

main().catch(console.error).finally(() => prisma.$disconnect());
