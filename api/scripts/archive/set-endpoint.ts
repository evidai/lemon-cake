import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();

  // test-service に echo エンドポイントを設定（動作確認用）
  const updated = await p.service.update({
    where: { id: "test-service" },
    data: { endpoint: "https://httpbin.org/anything" },
  });
  console.log("✅ test-service endpoint:", updated.endpoint);

  // Serper サービスの endpoint も確認・設定
  const serper = await p.service.findFirst({ where: { name: { contains: "erper" } } });
  if (serper) {
    console.log("Serper service:", serper.id, "endpoint:", serper.endpoint, "authHeader:", serper.authHeader);
    if (!serper.endpoint) {
      const updatedSerper = await p.service.update({
        where: { id: serper.id },
        data: { endpoint: "https://google.serper.dev/search" },
      });
      console.log("✅ Serper endpoint set:", updatedSerper.endpoint);
    }
  } else {
    console.log("Serper service not found in DB");
  }

  // 全サービスのエンドポイント一覧
  const all = await p.service.findMany({ select: { id: true, name: true, endpoint: true, authHeader: true, reviewStatus: true } });
  console.log("\nAll services:");
  all.forEach(s => console.log(` ${s.reviewStatus} | ${s.id} | endpoint=${s.endpoint ?? "NONE"} | auth=${s.authHeader ?? "none"}`));

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
