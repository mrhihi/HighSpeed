import { Router } from "express";
import { getUsageStats, recordUsageEvent, type UsageEvent } from "../usageStats";

const router = Router();
const validEvents: UsageEvent[] = ["view", "query", "recommendation"];

router.get("/", async (_req, res) => {
  res.json(await getUsageStats());
});

router.post("/events", async (req, res) => {
  const event = req.body?.event as UsageEvent;
  if (!validEvents.includes(event)) {
    res.status(400).json({ error: "無效的統計事件。" });
    return;
  }
  res.json(await recordUsageEvent(event));
});

export default router;
