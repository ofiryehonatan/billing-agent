const customersEl = document.getElementById("customers");
const threadEl = document.getElementById("thread");
const form = document.getElementById("composer");
const messageEl = document.getElementById("message");
const sendBtn = document.getElementById("send");
const statusEl = document.getElementById("status");
const subtitleEl = document.getElementById("subtitle");

// Shown in the "Thinking…" line after each tool call.
const TOOL_PROGRESS = {
  get_billing_data: "Checking your bill…",
  get_available_plans: "Looking at plans…",
  issue_credit: "Processing a credit…",
  propose_plan_change: "Preparing a plan suggestion…",
  open_support_ticket: "Opening a support ticket…",
};

let customerId = "c100";
let busy = false;

function addBubble(kind, text) {
  const el = document.createElement("div");
  el.className = `bubble ${kind}`;
  if (kind !== "tool") el.dir = "auto"; // Hebrew replies render right-to-left
  el.textContent = text;
  threadEl.appendChild(el);
  threadEl.scrollTop = threadEl.scrollHeight;
  return el;
}

function setBusy(next) {
  busy = next;
  sendBtn.disabled = next;
  statusEl.textContent = next ? "Working" : "Idle";
  statusEl.classList.toggle("busy", next);
}

async function loadCustomers() {
  let data;
  try {
    const res = await fetch("/api/customers");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    addBubble("error", `Could not load customers: ${e.message}`);
    return;
  }
  customersEl.replaceChildren();
  for (const c of data.customers) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `customer${c.id === customerId ? " active" : ""}`;
    btn.dataset.id = c.id;
    const name = document.createElement("strong");
    name.textContent = c.name;
    const meta = document.createElement("small");
    meta.textContent = `${c.id} · ${c.plan} · last bill ${c.lastTotal} ILS`;
    btn.append(name, meta);
    btn.addEventListener("click", () => {
      customerId = c.id;
      for (const node of customersEl.children) node.classList.toggle("active", node.dataset.id === c.id);
      subtitleEl.textContent = `Signed in as ${c.name} (${c.id}).`;
    });
    customersEl.appendChild(btn);
    if (c.id === customerId) subtitleEl.textContent = `Signed in as ${c.name} (${c.id}).`;
  }
}

async function sendMessage(text) {
  if (busy || !text.trim()) return;
  addBubble("user", text);
  messageEl.value = "";
  setBusy(true);
  const working = addBubble("working", "Thinking…");
  let finished = false;
  const handle = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event.type === "tool") {
      // Tool calls stay out of the conversation; only update the progress line.
      working.textContent = TOOL_PROGRESS[event.name] || "Working on it…";
    } else if (event.type === "done") {
      finished = true;
      addBubble("agent", event.text || "(empty reply)");
      for (const t of event.tickets ?? []) {
        addBubble("tool", `🎫 Ticket ${t.id} opened (${t.priority}): ${t.summary}`);
      }
    } else if (event.type === "error" || event.error) {
      finished = true;
      addBubble("error", event.error);
    }
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, customerId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      lines.forEach(handle);
    }
    handle(buf + decoder.decode());
    if (!finished) addBubble("error", "Connection closed before the agent replied.");
  } catch (e) {
    // fetch/stream failures surface as a bare TypeError ("network error", "Failed to fetch").
    const lost = e instanceof TypeError;
    addBubble(
      "error",
      lost ? "Lost connection to the server. Check the terminal running npm start, then try again." : e.message
    );
  } finally {
    working.remove();
    setBusy(false);
    messageEl.focus();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(messageEl.value);
});

messageEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(messageEl.value);
  }
});

document.querySelectorAll("[data-prompt]").forEach((btn) => {
  btn.addEventListener("click", () => sendMessage(btn.dataset.prompt));
});

loadCustomers();
