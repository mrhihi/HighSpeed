import { Router } from "express";
import { getTdxMetrics, waitForTdxMetricsChange } from "../tdxClient";

const router = Router();

router.get("/tdx", async (_req, res) => {
  res.json(await getTdxMetrics());
});

// Comet long polling：統計有變化才回應，逾時則回傳目前狀態讓前端續接。
router.get("/tdx/stream", async (req, res) => {
  const sinceValue = Number(req.query.since);
  const since = Number.isInteger(sinceValue) && sinceValue >= 0 ? sinceValue : -1;
  await waitForTdxMetricsChange(since);
  res.json(await getTdxMetrics());
});

export default router;
