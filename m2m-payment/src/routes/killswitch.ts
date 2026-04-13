import { Router, Request, Response } from "express";

const router = Router();

/** Global halt flag — shared across this module */
let isHalted = false;

/** Exported getter used by other routes */
export function getHaltState(): boolean {
  return isHalted;
}

/**
 * POST /api/killswitch
 * Body: { halt: boolean }
 *
 * Sets the global isHalted flag.
 * When true, POST /api/transfer returns 403.
 */
router.post("/", (req: Request, res: Response) => {
  const { halt } = req.body as { halt?: boolean };

  if (typeof halt !== "boolean") {
    res.status(400).json({ error: '"halt" must be a boolean' });
    return;
  }

  isHalted = halt;
  console.log(`[killswitch] isHalted set to ${isHalted}`);

  res.json({
    isHalted,
    message: isHalted
      ? "System halted. All transfers are blocked."
      : "System resumed. Transfers are allowed.",
  });
});

/**
 * GET /api/killswitch  (convenience — check current state)
 */
router.get("/", (_req: Request, res: Response) => {
  res.json({ isHalted });
});

export default router;
