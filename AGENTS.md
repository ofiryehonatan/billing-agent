# Billing Agent

A learning project: a customer-care LLM agent (model + tools + loop + guardrails).
For "my bill is too high" it fetches billing data, explains the difference between
two bills, and offers a solution: a credit for a billing error, a plan change, or a
support ticket for a human. All billing data is fake (mock customers c100, c200).

## Commands
- `npm start` - web UI at http://localhost:3000
- `npm run agent -- "<message>" c100` - one CLI run
- `npm test` - tool checks + behavior evals (calls the LLM; free tier is rate-limited, retries are automatic)

The API key is read from `.env` (see `.env.example`). Default provider is Groq (`GROQ_API_KEY`).

## Project map
| File | Purpose |
|---|---|
| `billing-agent.mjs` | Mock billing system, tools, system prompt, agent loop, evals (`TOOL_CHECKS`, `CASES`) |
| `server.mjs` + `public/` | Small web UI; `/api/chat` streams tool calls as NDJSON |
| `package.json` | Scripts; they load `.env` via `--env-file-if-exists` |
| `ROADMAP.md` | The step-by-step learning exercise |

## Ground rules (never break these)
1. The customer id comes from the session (`ctx`), never from the model. No tool has a `customer_id` parameter.
2. All arithmetic and anomaly detection happens in code. The model only explains results.
3. The model proposes, the code decides. Credits are validated against verified billing errors and `AUTO_CREDIT_LIMIT`; a plan change is only a proposal until the customer confirms.
4. Never commit secrets. API keys live in environment variables / `.env` only (gitignored).
5. Every behavior change gets an eval: add or update a case in `CASES` (model behavior) or `TOOL_CHECKS` (validation in code).

## Workflow
- Small, specific changes. Review every diff and be able to explain it.
- Run `npm test` after every change and report the result.
- Commit small and often.
