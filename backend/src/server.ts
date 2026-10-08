import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { runWorkflow } from "./agents/orchestrator.js";
import { OpenAiProvider } from "./llm.js";
import {
  assertOrchestratorRequest,
  strategyJsonSchema,
  strategyJsonV2Schema,
  ValidationError
} from "./validation.js";

const legacyEndpointRemoved = {
  error: "LEGACY_ENDPOINT_REMOVED",
  message: "This legacy endpoint has been removed. Use POST /api/workflow/run."
};

export function createApp() {
  const app = express();
  const llm = new OpenAiProvider();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "assetpilot-backend-orchestrator" });
  });

  app.get("/api/strategy-schema", (_req, res) => {
    res.json({ legacy: strategyJsonSchema, v2: strategyJsonV2Schema });
  });

  // Legacy MVP endpoints are intentionally removed from the public API.
  app.post("/api/analyze", (_req, res) => res.status(410).json(legacyEndpointRemoved));
  app.post("/api/generate-strategy", (_req, res) => res.status(410).json(legacyEndpointRemoved));
  app.post("/api/review-risk", (_req, res) => res.status(410).json(legacyEndpointRemoved));
  app.post("/api/execution-summary", (_req, res) => res.status(410).json(legacyEndpointRemoved));

  // V2 typed workflow endpoint.
  app.post("/api/workflow/run", async (req, res, next) => {
    try {
      res.json(await runWorkflow(assertOrchestratorRequest(req.body), llm));
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
