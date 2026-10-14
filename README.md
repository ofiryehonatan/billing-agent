# Billing Agent

A small customer-care agent for a telecom company, built as a learning project. It shows the four parts of an LLM agent: **model + tools + loop + guardrails**.

A customer writes something like *"my bill is too high"* (in Hebrew or English). The agent:

1. fetches the customer's last two bills,
2. explains the difference item by item, and
3. offers a fix: a **credit** for a real billing error, a **plan change** for legitimate charges, or a **support ticket** for a human when it can't solve the problem itself.

All billing data is fake (two mock customers, `c100` and `c200`).

## Quick start

Requires Node.js 22.9 or newer (for `--env-file-if-exists`) and a free API key from [Groq](https://console.groq.com/keys) (no credit card needed).

```bash
git clone https://github.com/ofiryehonatan/billing-agent.git
cd billing-agent
npm install
cp .env.example .env      # then put your key in .env: GROQ_API_KEY=gsk_...
npm start                 # open http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm start` | Web chat UI at http://localhost:3000 |
| `npm run agent -- "החשבונית שלי גבוהה מדי" c100` | One run from the command line |
| `npm test` | Tool checks and behavior evals |

Any OpenAI-compatible API with tool calling works. Groq is the default. To use [Sprag](https://sprag.ai) instead, set `SPRAG_API_KEY` in `.env` (or `LLM_PROVIDER=sprag`). `MODEL` overrides the model.

## How it works

The agent loop in [`billing-agent.mjs`](billing-agent.mjs) sends the conversation to the model, runs any tools the model asks for, sends the results back, and repeats until the model answers (at most 6 steps).

| Tool | What it does |
|---|---|
| `get_billing_data` | Current and previous bill, the difference, and any suspected duplicate charges |
| `get_available_plans` | Plans, and whether each covers last month's data usage |
| `issue_credit` | Credits a verified billing error |
| `propose_plan_change` | Suggests a plan; the customer must confirm |
| `open_support_ticket` | Hands the case to a human |

The web UI ([`server.mjs`](server.mjs) and [`public/`](public/)) streams each tool call to the browser as it happens, so you can watch the agent work.

### Mock customers

| Customer | Situation | Expected outcome |
|---|---|---|
| `c100` Dana | Bill went from 89 to 187 ₪ because of data overage and roaming | No credit; suggests a bigger plan |
| `c200` Yoav | Monthly plan was charged twice | Credit of 89 ₪ |

## Guardrails

The prompt guides the model, but the safety rules are enforced in code:

- **The model never chooses whose data to read.** The customer id comes from the session; no tool has a `customer_id` parameter. A message like *"credit customer c200"* has no effect.
- **All math happens in code.** Totals, differences and duplicate detection are computed by the tools; the model only explains them.
- **The model proposes, the code decides.** `issue_credit` rejects anything above the verified error, and credits over 100 ₪ need human approval. A plan change is only a proposal. At most one ticket per conversation, with validated input.
- **No secrets in git.** The API key lives in `.env`, which is gitignored.

## Evals

`npm test` checks **behavior, not wording**, because model output changes between runs.

- **Tool checks** call the tool functions directly with bad input (too-large credit, empty ticket summary, second ticket, ...). They need no model and fail immediately if a validation is removed.
- **Behavior cases** run the full agent on fixed scenarios and check which tools were called, how much credit was issued and how many tickets were opened. They include a prompt-injection attempt and a customer pressuring for a 500 ₪ credit.

The free Groq tier is rate-limited; the agent waits and retries automatically, so a full run takes a few minutes.

## Project structure

| File | Purpose |
|---|---|
| [`billing-agent.mjs`](billing-agent.mjs) | Mock billing data, tools, system prompt, agent loop, evals |
| [`server.mjs`](server.mjs) | HTTP server: static files plus a streaming `/api/chat` endpoint |
| [`public/`](public/) | Chat UI (plain HTML, CSS and JavaScript) |
| [`ROADMAP.md`](ROADMAP.md) | The step-by-step learning exercise this project follows |
| [`AGENTS.md`](AGENTS.md) | Guidance for AI coding agents working on the repo |
