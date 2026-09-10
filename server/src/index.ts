import "dotenv/config";
import express from "express";
import cors from "cors";
import stationsRouter from "./routes/stations";
import seatsRouter from "./routes/seats";
import seatPlansRouter from "./routes/seatPlans";
import metricsRouter from "./routes/metrics";
import usageRouter from "./routes/usage";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/stations", stationsRouter);
app.use("/api/seats", seatsRouter);
app.use("/api/seat-plans", seatPlansRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/usage", usageRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : "伺服器發生未預期錯誤";
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`HighSpeed server listening on http://localhost:${port}`);
});
