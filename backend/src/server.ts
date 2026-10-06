import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { analyzePortfolio } from "./agents/analyst.js";
import { executionSummary } from "./agents/execution.js";
import { reviewRisk } from "./agents/risk.js";
import { generateStrategy } from "./agents/strategy.js";
import { OpenAiProvider } from "./llm.js";
import {
  assertAnalyzeRequest,
  assertExecutionSummaryRequest,
  assertGenerateStrategyRequest,
  assertReviewRiskRequest,
  strategyJsonSchema,
  ValidationError
} from "./validation.js";

export function createApp() {
  const app = express();
  const llm = new OpenAiProvider();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "assetpilot-backend-orchestrator" });
  });

  app.get("/api/strategy-schema", (_req, res) => {
    res.json(strategyJsonSchema);
  });

  app.post("/api/analyze", async (req, res, next) => {
    try {
      res.json(await analyzePortfolio(assertAnalyzeRequest(req.body), llm));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/generate-strategy", async (req, res, next) => {
    try {
      res.json(await generateStrategy(assertGenerateStrategyRequest(req.body), llm));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/review-risk", async (req, res, next) => {
    try {
      res.json(await reviewRisk(assertReviewRiskRequest(req.body), llm));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/execution-summary", (req, res, next) => {
    try {
      res.json(executionSummary(assertExecutionSummaryRequest(req.body)));
    } catch (error) {
      next(error);
    }
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ValidationError) {
      res.status(error.statusCode).json({ error: "VALIDATION_ERROR", details: error.details });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  });

  return app;
}

const port = Number(process.env.PORT ?? 8787);

if (process.env.NODE_ENV !== "test") {
  createApp().listen(port, () => {
    console.log(`AssetPilot backend orchestrator listening on http://localhost:${port}`);
  });
}
