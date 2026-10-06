# AssetPilot Backend AI Orchestrator

Express + TypeScript service for the four AssetPilot agents:

- Analyst Agent: portfolio risk analysis.
- Strategy Agent: structured strategy generation.
- Risk Agent: policy and safety review.
- Execution Agent: frontend-ready contract execution payloads.

The service can call OpenAI when `OPENAI_API_KEY` is configured. Without a key, all endpoints use deterministic fallbacks so the local demo remains runnable.

## Run

```bash
npm install
npm run dev
```

Default URL: `http://localhost:8787`.

## Endpoints

```text
POST /api/analyze
POST /api/generate-strategy
POST /api/review-risk
POST /api/execution-summary
```
