const $ = (id) => document.getElementById(id);
$("items").value = JSON.stringify(
  [
    {
      sku: "COTTON-TEE-01",
      fabricType: "Organic cotton",
      supplierId: "SUPPLIER-01",
      carbonFootprintScore: 22,
      restockQty: 18,
      evidence:
        "Supplier claims organic cotton. Certificate, issuer, expiry and chain of custody have not been provided.",
    },
  ],
  null,
  2,
);
let token = sessionStorage.getItem("revampai-token"),
  latestReport = "";
async function getToken() {
  if (!token) {
    const r = await fetch("/api/access-token", { method: "POST" });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Unable to issue access token");
    token = d.token;
    sessionStorage.setItem("revampai-token", token);
  }
  return token;
}
async function api(path, body) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getToken()}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (!r.ok)
    throw Error(
      [
        d.error || "Request failed",
        ...(d.details || []).map((i) => `${i.path.join(".")}: ${i.message}`),
      ].join(" · "),
    );
  return d;
}
function node(tag, text, parent) {
  const n = document.createElement(tag);
  n.textContent = text;
  parent.append(n);
  return n;
}
async function health() {
  try {
    const h = await (await fetch("/api/health")).json();
    $("zoo-status").textContent = h.zooWork.configured
      ? "ZooWork · live API configured"
      : "ZooWork · unavailable";
    $("data-status").textContent = h.zooData.configured
      ? "ZooData · configured"
      : "ZooData · key needed";
    $("search").disabled = !h.zooData.configured;
    $("market-query").disabled = !h.zooData.configured;
    $("run").disabled = !h.zooWork.configured;
  } catch {
    $("zoo-status").textContent = "Service unavailable";
  }
}
function render(result) {
  $("empty").hidden = true;
  $("results").hidden = false;
  $("decisions").replaceChildren();
  $("metrics").replaceChildren();
  node("span", `${result.metrics.totalProcessed} reviewed`, $("metrics"));
  node("span", `${result.metrics.held} on hold`, $("metrics"));
  for (const op of result.operations) {
    const card = node("div", "", $("decisions"));
    card.className = "decision";
    node("h3", `${op.sku} · ${op.decision.toUpperCase()}`, card);
    node("p", op.rationale, card);
    const list = node("ul", "", card);
    op.missingEvidence.forEach((e) => node("li", e, list));
  }
  latestReport = result.markdownReport;
  $("report").textContent = latestReport;
  $("provenance").textContent =
    `Real ${result.provider} run · ${result.model} · ${result.runId} · ${result.completedAt}`;
  if (result.market) showMarket(result.market);
}
$("run").onclick = async () => {
  const button = $("run");
  button.disabled = true;
  $("error").textContent = "";
  try {
    const items = JSON.parse($("items").value);
    const query = $("market-query").value.trim();
    let job = await api("/api/run-audit", {
      items,
      ...(query ? { marketQuery: query } : {}),
    });
    $("progress").textContent = job.progress;
    const deadline = Date.now() + 240000;
    while (job.status === "running" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      job = await api(`/api/audits/${job.id}`);
      $("progress").textContent = job.progress;
    }
    if (job.status !== "completed")
      throw Error(
        job.error ||
          "Review is taking longer than expected. Use your audit ID with the agent API to check progress: " +
            job.id,
      );
    render(job.result);
  } catch (e) {
    $("error").textContent = e.message;
    $("progress").textContent = "Review could not complete";
  } finally {
    button.disabled = false;
  }
};
function showMarket(data) {
  $("market-results").replaceChildren();
  node(
    "p",
    `${data.products.length} ZooData listings · ${data.disclaimer}`,
    $("market-results"),
  );
  data.products.forEach((p) => {
    const div = node("div", "", $("market-results"));
    div.className = "product";
    if (p.sourceUrl) {
      const a = node("a", p.title, div);
      a.href = p.sourceUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else node("span", p.title, div);
    node(
      "span",
      ` · ${p.price ?? "Price unavailable"} · ${p.rating ?? "No rating"}`,
      div,
    );
  });
}
$("search").onclick = async () => {
  const b = $("search");
  b.disabled = true;
  $("error").textContent = "";
  try {
    showMarket(
      await api("/api/market-search", {
        keyword: $("market-query").value.trim(),
      }),
    );
  } catch (e) {
    $("error").textContent = e.message;
  } finally {
    b.disabled = false;
  }
};
$("get-token").onclick = async () => {
  try {
    const t = await getToken();
    $("connection").hidden = false;
    $("connection").value = JSON.stringify(
      {
        url: location.origin + "/mcp",
        headers: { Authorization: "Bearer " + t },
      },
      null,
      2,
    );
  } catch (e) {
    $("error").textContent = e.message;
  }
};
$("download").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([latestReport], { type: "text/markdown" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "revampai-review.md";
  a.click();
  URL.revokeObjectURL(url);
};
health();
let conversation = [],
  currentUser = null;
function chatMessage(role, text) {
  const n = node(
    "div",
    `${role === "user" ? "You" : "RevampAI"}\n${text}`,
    $("chat-log"),
  );
  n.className = "chat-message " + role;
  $("chat-log").scrollTop = $("chat-log").scrollHeight;
}
async function pollJob(job, statusNode) {
  const deadline = Date.now() + 240000;
  while (job.status === "running" && Date.now() < deadline) {
    statusNode.textContent = job.progress;
    await new Promise((r) => setTimeout(r, 2000));
    job = await api(`/api/audits/${job.id}`);
  }
  if (job.status !== "completed")
    throw Error(job.error || "Still running. Check your inbox shortly.");
  return job.result;
}
$("send-chat").onclick = async () => {
  if (!currentUser) {
    $("chat-status").textContent =
      "Sign up or sign in to chat with the agent and receive messages.";
    return;
  }
  const question = $("chat-input").value.trim();
  if (!question) return;
  $("send-chat").disabled = true;
  $("chat-status").textContent = "Sending to ZooWork…";
  chatMessage("user", question);
  try {
    const items = JSON.parse($("items").value);
    const result = await pollJob(
      await api("/api/run-audit", {
        items,
        question,
        conversation: conversation.slice(-6),
      }),
      $("chat-status"),
    );
    chatMessage("assistant", result.reply);
    conversation.push(
      { role: "user", content: question },
      { role: "assistant", content: result.reply },
    );
    conversation = conversation.slice(-6);
    $("chat-input").value = "";
    $("chat-status").textContent = "Agent reply received";
    render(result);
    if ($("read-aloud").checked && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(result.reply));
    }
    if (currentUser) await loadInbox();
  } catch (e) {
    $("chat-status").textContent = e.message;
  } finally {
    $("send-chat").disabled = false;
  }
};
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.onresult = (e) => {
    $("chat-input").value = e.results[0][0].transcript;
    $("chat-status").textContent = "Ready to send. Review your words first.";
  };
  recognition.onerror = (e) => {
    $("chat-status").textContent =
      "Voice input unavailable: " + e.error + ". Please type your message.";
  };
  recognition.onend = () => {
    $("voice").textContent = "Speak";
  };
  $("voice").onclick = () => {
    try {
      recognition.start();
      $("voice").textContent = "Listening…";
    } catch {
      $("chat-status").textContent = "Microphone is already listening.";
    }
  };
} else {
  $("voice").disabled = true;
  $("voice").textContent = "Voice unavailable";
}
async function authRequest(action, body) {
  const r = await fetch("/api/auth/" + action, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json();
  if (!r.ok)
    throw Error(
      [
        data.error || "Account request failed",
        ...(data.details || []).map((i) => `${i.path.join(".")}: ${i.message}`),
      ].join(" · "),
    );
  return data;
}
async function accountState() {
  const r = await fetch("/api/auth/me");
  const { user } = await r.json();
  currentUser = user;
  $("auth-form").hidden = !!user;
  $("signed-in").hidden = !user;
  if (user) {
    $("account-name").textContent = "Signed in as " + user.username;
    await loadInbox();
  }
}
for (const action of ["signup", "login"])
  $(action).onclick = async () => {
    const b = $(action);
    b.disabled = true;
    try {
      await authRequest(action, {
        username: $("username").value,
        password: $("password").value,
      });
      $("password").value = "";
      token = null;
      sessionStorage.removeItem("revampai-token");
      await accountState();
      $("account-status").textContent =
        "You can now receive messages in your inbox. Browser notifications are optional.";
    } catch (e) {
      $("account-status").textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
$("logout").onclick = async () => {
  try {
    await authRequest("logout");
    token = null;
    sessionStorage.removeItem("revampai-token");
    conversation = [];
    $("chat-log").replaceChildren();
    $("inbox").replaceChildren();
    $("results").hidden = true;
    $("empty").hidden = false;
    $("connection").hidden = true;
    await accountState();
    $("account-status").textContent = "Signed out.";
  } catch (e) {
    $("account-status").textContent = e.message;
  }
};
async function loadInbox() {
  if (!currentUser) return;
  const data = await api("/api/messages");
  $("inbox").replaceChildren();
  if (!data.messages.length)
    node("p", "Completed reviews and replies will appear here.", $("inbox"));
  for (const m of data.messages) {
    const b = node(
      "button",
      `${m.status === "completed" ? "Reply ready" : "Review failed"} · ${new Date(m.created_at).toLocaleString()}`,
      $("inbox"),
    );
    b.className = "secondary";
    b.onclick = () => {
      if (m.result) {
        render(m.result);
        chatMessage("assistant", m.result.reply);
        $("results").scrollIntoView({ behavior: "smooth" });
      } else
        $("account-status").textContent =
          "This review did not complete. You can submit a new request.";
    };
  }
}
$("refresh-inbox").onclick = () =>
  loadInbox().catch((e) => {
    $("account-status").textContent = e.message;
  });
function decodeKey(key) {
  const bytes = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, (c) => c.charCodeAt(0));
}
$("enable-notifications").onclick = async () => {
  try {
    if (!currentUser) throw Error("Sign up or sign in first.");
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    )
      throw Error(
        "Browser push is unavailable. Your signed-in inbox still works.",
      );
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      throw Error(
        "Notifications were not enabled. You can still use your inbox.",
      );
    const { publicKey } = await api("/api/notifications/key");
    if (!publicKey) throw Error("Push delivery is not configured.");
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      }));
    await api("/api/notifications/subscribe", subscription.toJSON());
    $("account-status").textContent =
      "Browser notifications enabled for completed reviews and agent replies.";
  } catch (e) {
    $("account-status").textContent = e.message;
  }
};
$("disable-notifications").onclick = async () => {
  try {
    const r = await fetch("/api/notifications/subscribe", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await getToken()}` },
    });
    if (!r.ok) throw Error("Could not update notification preferences.");
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
    $("account-status").textContent =
      "Browser notifications turned off. Inbox messages remain available.";
  } catch (e) {
    $("account-status").textContent = e.message;
  }
};
if ("serviceWorker" in navigator)
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "refresh-inbox") loadInbox().catch(() => {});
  });
setInterval(() => {
  if (currentUser && document.visibilityState === "visible")
    loadInbox().catch(() => {});
}, 30000);
document.addEventListener("visibilitychange", () => {
  if (currentUser && document.visibilityState === "visible")
    loadInbox().catch(() => {});
});
accountState().catch(() => {
  $("account-status").textContent =
    "Account service is unavailable. You can still try a guest review.";
});
