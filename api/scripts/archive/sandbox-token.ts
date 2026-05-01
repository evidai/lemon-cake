import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  // デモ用トークン (jti = cmomhvs4u0003tf4ku6qxxn2t)
  const TOKEN_ID = "cmomhvs4u0003tf4ku6qxxn2t";
  
  const token = await p.token.findUnique({ where: { id: TOKEN_ID } });
  console.log("Current token:", token?.id, "sandbox:", token?.sandbox);
  
  const updated = await p.token.update({
    where: { id: TOKEN_ID },
    data: { sandbox: true },
  });
  console.log("✅ Token sandbox:", updated.sandbox);
  
  // 既存の FAILED チャージも COMPLETED に修正
  const result = await p.charge.updateMany({
    where: { tokenId: TOKEN_ID, status: "FAILED" },
    data: { status: "COMPLETED" },
  });
  console.log(`✅ Fixed ${result.count} FAILED charges → COMPLETED`);
  
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
