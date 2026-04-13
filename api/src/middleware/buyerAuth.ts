import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyBuyerToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

export const requireBuyerAuth = createMiddleware(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing Authorization header" });
  }
  let payload;
  try {
    payload = await verifyBuyerToken(auth.slice(7));
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired buyer token" });
  }
  const buyer = await prisma.buyer.findUnique({ where: { id: payload.buyerId } });
  if (!buyer) throw new HTTPException(401, { message: "Buyer not found" });

  c.set("buyerId", payload.buyerId);
  c.set("buyer",   buyer);
  await next();
});
