// super mom dashboard. polls /api/state every 2s and renders.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const lc = (s) => String(s).toLowerCase();
  const short = (name) => lc(name).split(" ").pop();
  const OBJECT = { vacuum: "the vacuuming", dog: "dog duty" };
  const choreObject = (name) => OBJECT[short(name)] || `the ${short(name)}`;
  const COLORS = ["var(--clay)", "var(--sage)", "var(--latte)", "#d9c27e"];

  let S = null;
  let lastJson = "";
  let view = "after";
  let first = true;
  const seenMsgs = new Set();
  const doneBefore = new Set();
  const typing = new Set();

  // ---------- static bits ----------
  $("#brand-heart").innerHTML = doodle("heart");
  $$(".title .sq").forEach((el) => (el.outerHTML = doodle("squiggle", "squiggle")));

  // ---------- api ----------
  async function api(path, body) {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `request failed (${r.status})`);
    return data;
  }
  async function refresh() {
    try {
      const txt = await (await fetch("/api/state", { cache: "no-store" })).text();
      if (txt === lastJson) return;
      lastJson = txt;
      S = JSON.parse(txt);
      render();
    } catch (e) {
      console.warn("state fetch failed", e);
    }
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- helpers ----------
  const color = (kidId) => COLORS[Math.max(0, S.kids.findIndex((k) => k.id === kidId)) % COLORS.length];
  const kidById = (id) => S.kids.find((k) => k.id === id);
  const circled = (html) => `<span class="circled">${html}${doodle("circle")}</span>`;
  function animatePencils(root) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => $$(".pencil .fill", root).forEach((p) => (p.style.strokeDashoffset = p.dataset.to))),
    );
  }
  function check(choreId, done) {
    if (!done) return `<span></span>`;
    const fresh = !first && !doneBefore.has(choreId);
    return doodle("check", `check ${fresh ? "draw" : "drawn"}`);
  }

  // ---------- render ----------
  function render() {
    $("#badge-claude").textContent = S.mode.claude ? "claude on" : "claude demo";
    $("#badge-claude").classList.toggle("on", S.mode.claude);
    $("#badge-claude").title = S.mode.claude ? "replies are read by claude" : "no api key: replies are read by keyword rules";
    $("#badge-sms").textContent = S.mode.sms ? "sms live" : "sms simulated";
    $("#badge-sms").classList.toggle("on", S.mode.sms);
    $("#assign").textContent = S.assigned ? "reassign & text kids" : "assign & text kids";

    renderFairness();
    renderPhones();
    renderBoard();
    renderChores();

    doneBefore.clear();
    S.chores.forEach((c) => c.done && doneBefore.add(c.id));
    first = false;
  }

  function fairData() {
    if (view === "before") {
      const b = S.baseline;
      const kids = S.kids.map((k) => ({ ...k, points: b.points[k.name] ?? 0 }));
      const total = kids.reduce((n, k) => n + k.points, 0) || 1;
      const vals = kids.map((k) => k.points);
      return { kids, total, gap: Math.round(((Math.max(...vals) - Math.min(...vals)) / total) * 100), done: b.done, count: b.total, reminders: b.reminders };
    }
    return { kids: S.kids, total: S.stats.total || 1, gap: S.stats.gapPct, done: S.stats.done, count: S.stats.count, reminders: S.stats.reminders };
  }

  function renderFairness() {
    $$(".toggle button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
    const d = fairData();
    const body = $("#load-body");
    const note = $("#load-note");

    if (view === "after" && !S.assigned) {
      body.innerHTML = `<div class="empty rise">${doodle("family")}
        <h3>this week's chores aren't out yet</h3>
        <p class="muted small">one tap splits them fairly by effort and texts each kid their list.</p>
        <button class="pill" data-assign>assign &amp; text kids</button></div>`;
      note.textContent = "";
    } else {
      body.innerHTML = d.kids
        .map((k) => {
          const share = Math.round((k.points / d.total) * 100);
          const done = view === "before" ? "" : `${k.done} of ${k.count} done`;
          return `<div class="kid-row rise" style="--kid:${color(k.id)}">
            <div class="kid-name"><span class="dot"></span>${esc(lc(k.name))}</div>
            <div class="kid-bar">${pencil(share, color(k.id))}<div class="meta muted small"><span>${k.points} pts</span><span>${done}</span></div></div>
            <div class="kid-num"><span class="pct">${share}%</span><span class="muted">of the work</span></div>
          </div>`;
        })
        .join("") + (view === "before" ? `<p class="illus">illustrative week before super mom</p>` : "");
      animatePencils(body);

      const top = [...d.kids].sort((a, b) => b.points - a.points)[0];
      const topShare = Math.round((top.points / d.total) * 100);
      if (view === "before") {
        note.textContent = `${lc(top.name)} did ${topShare}% of the work`;
        note.className = "note hand";
      } else {
        const even = d.gap === 0;
        const allDone = d.count > 0 && d.done === d.count;
        note.textContent = allDone ? "every chore done. nice work, team!" : even ? "fair & square ✓" : "close to even. swaps keep it fair";
        note.className = "note hand calm";
      }
    }

    $("#stat-gap").innerHTML = view === "after" && S.assigned ? circled(`${d.gap}%`) : view === "before" ? `${d.gap}%` : "0%";
    $("#stat-gap-sub").textContent = view === "before" ? "between siblings" : "split by effort, not by who says yes";
    $("#stat-done").textContent = `${d.done}/${d.count}`;
    $("#stat-done-sub").textContent = view === "before" ? "after a week of asking" : d.count ? "checked off by text" : "nothing assigned yet";
    $("#stat-rem").innerHTML = view === "after" ? circled(String(d.reminders)) : String(d.reminders);
    $("#stat-rem-sub").textContent = view === "before" ? "times a parent had to ask" : "the texts do the asking";

    const feed = $("#feed");
    if (view === "before") {
      const sample = ["whose turn is it for the dishes??", "jake, the trash. again.", "maya, can you just do the laundry too?", "i shouldn't have to ask this many times"];
      feed.innerHTML = sample.map((t) => `<li class="reminder">${doodle("sparkle")}<span>parent: "${esc(t)}"</span></li>`).join("") + `<li class="reminder"><span></span><span class="small">illustrative</span></li>`;
    } else if (!S.activity.length) {
      feed.innerHTML = `<li class="muted">${doodle("sparkle")}<span>quiet so far. assign chores to get started.</span></li>`;
    } else {
      const icon = { assign: "sparkle", done: "check", swap: "heart", excuse: "heart", reminder: "sparkle" };
      feed.innerHTML = S.activity
        .slice(0, 12)
        .map((a) => `<li>${a.kind === "done" ? doodle("check", "check drawn") : doodle(icon[a.kind] || "sparkle")}<span>${esc(a.text)}</span></li>`)
        .join("");
    }
  }

  // phones: shells are built once, chat bubbles are appended incrementally
  function renderPhones() {
    const wrap = $("#phones");
    const key = S.kids.map((k) => k.id).join(",");
    if (wrap.dataset.key !== key) {
      wrap.dataset.key = key;
      wrap.innerHTML = S.kids
        .map(
          (k) => `<div class="phone" data-kid="${k.id}" style="--kid:${color(k.id)}">
            <div class="notch"></div>
            <div class="phone-head"><span class="avatar">${esc(lc(k.name)[0])}</span><div><b>${esc(lc(k.name))}'s phone</b><span class="muted small">texts from super mom</span></div></div>
            <div class="chat" aria-live="polite"></div>
            <div class="chips"></div>
            <form class="compose"><input placeholder="text super mom..." aria-label="text as ${esc(lc(k.name))}" autocomplete="off"><button class="send" aria-label="send">↑</button></form>
          </div>`,
        )
        .join("");
      seenMsgs.clear();
    }

    for (const k of S.kids) {
      const phone = $(`.phone[data-kid="${k.id}"]`, wrap);
      const chat = $(".chat", phone);
      const msgs = S.messages.filter((m) => m.kid_id === k.id);

      // reset happened: clear the chat
      if (msgs.length < $$(".bubble[data-id]", chat).length) {
        chat.innerHTML = "";
        msgs.length || seenMsgs.clear();
      }
      $$("[data-temp]", chat).forEach((el) => el.remove());
      if (!msgs.length && !chat.children.length) chat.innerHTML = `<p class="chat-empty">no texts yet. tap “assign &amp; text kids”.</p>`;

      let added = false;
      for (const m of msgs) {
        if (seenMsgs.has(m.id)) continue;
        seenMsgs.add(m.id);
        $(".chat-empty", chat)?.remove();
        const fromKid = m.direction === "in";
        const el = document.createElement("div");
        el.className = `bubble ${fromKid ? "kid" : "app"}${first ? "" : " rise"}`;
        el.dataset.id = m.id;
        el.textContent = m.body;
        chat.appendChild(el);
        if (!fromKid && ["done", "swap", "excuse", "question"].includes(m.intent)) {
          const tag = document.createElement("span");
          tag.className = `read-as hand${first ? "" : " rise"}`;
          tag.textContent = `read as: ${m.intent}${m.intent === "done" || m.intent === "swap" ? " ✓" : ""}`;
          chat.appendChild(tag);
        }
        if (!fromKid) typing.delete(k.id);
        added = true;
      }
      if (typing.has(k.id)) chat.insertAdjacentHTML("beforeend", `<div class="typing" data-temp><i></i><i></i><i></i></div>`);
      if (added || typing.has(k.id)) chat.scrollTop = chat.scrollHeight;

      $(".chips", phone).innerHTML = chipsFor(k)
        .map((c) => `<button type="button" class="chip">${esc(c)}</button>`)
        .join("");
    }
  }

  function chipsFor(kid) {
    if (!S.assigned) return ["what are my chores?"];
    const left = S.chores.filter((c) => c.kidId === kid.id && !c.done);
    const sib = S.kids.find((k) => k.id !== kid.id);
    const chips = [];
    if (left[0]) chips.push(`done with ${short(left[0].name)}`);
    if (sib && left.length) chips.push(`can ${lc(sib.name)} do ${choreObject(left[left.length - 1].name)} tonight? i have practice`);
    chips.push(left.length ? "i have practice tonight" : "what's left?");
    return chips;
  }

  function renderBoard() {
    const board = $("#board");
    if (!S.assigned) {
      board.innerHTML = `<p class="muted small" style="margin:12px 0 0">chores show up here once they're sent.</p>`;
      return;
    }
    board.innerHTML = S.kids
      .map((k) => {
        const mine = S.chores.filter((c) => c.kidId === k.id);
        return `<div class="board-kid" style="--kid:${color(k.id)}">
          <div class="kid-name"><span><span class="dot" style="display:inline-block;margin-right:8px"></span>${esc(lc(k.name))}</span><span>${k.points} pts</span></div>
          <ul class="mini">${mine
            .map(
              (c) => `<li class="${c.done ? "done" : ""}">${doodle(c.icon)}<span class="name">${esc(lc(c.name))}${c.swappedFrom ? `<span class="swapped hand">swapped</span>` : ""}</span><span class="pts">${c.points}</span>${check(c.id, c.done)}</li>`,
            )
            .join("")}</ul>
        </div>`;
      })
      .join("");
  }

  function renderChores() {
    $("#chore-grid").innerHTML = S.chores
      .map((c) => {
        const k = c.kidId ? kidById(c.kidId) : null;
        const dots = Array.from({ length: 4 }, (_, i) => `<i class="${i < c.points ? "on" : ""}"></i>`).join("");
        return `<div class="card chore" style="--kid:${k ? color(k.id) : "var(--line)"}">
          ${doodle(c.icon)}
          <div><div class="name">${esc(lc(c.name))}</div><div class="dots" aria-label="${c.points} effort points">${dots}</div>
          <span class="owner"><span class="dot"></span>${k ? esc(lc(k.name)) : "not assigned"}${c.done ? " · done" : ""}</span></div>
          ${check(c.id, c.done)}
        </div>`;
      })
      .join("");
  }

  // ---------- actions ----------
  async function doAssign(btn) {
    const buttons = $$("#assign, [data-assign]");
    buttons.forEach((b) => (b.disabled = true));
    try {
      await api("/api/assign");
      await refresh();
      toast(`texts sent to ${S.kids.map((k) => lc(k.name)).join(" and ")}`);
    } catch (e) {
      toast(e.message);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  async function send(kidId, text) {
    text = text.trim();
    if (!text) return;
    const chat = $(`.phone[data-kid="${kidId}"] .chat`);
    $(".chat-empty", chat)?.remove();
    chat.insertAdjacentHTML("beforeend", `<div class="bubble kid rise" data-temp>${esc(text)}</div>`);
    typing.add(kidId);
    chat.insertAdjacentHTML("beforeend", `<div class="typing" data-temp><i></i><i></i><i></i></div>`);
    chat.scrollTop = chat.scrollHeight;
    try {
      await api("/api/message", { kid: kidId, text });
    } catch (e) {
      toast(e.message);
    } finally {
      typing.delete(kidId);
      lastJson = "";
      await refresh();
    }
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.matches("#assign, [data-assign]")) return doAssign(t);
    if (t.matches("#reset")) {
      api("/api/reset").then(() => { lastJson = ""; refresh(); toast("fresh week, ready for the demo"); }).catch((err) => toast(err.message));
      return;
    }
    if (t.matches("[data-tab]")) return showTab(t.dataset.tab);
    if (t.matches(".toggle button")) {
      view = t.dataset.view;
      renderFairness();
      return;
    }
    if (t.matches(".chip")) {
      const kid = Number(t.closest(".phone").dataset.kid);
      return send(kid, t.textContent);
    }
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest(".compose");
    if (!form) return;
    e.preventDefault();
    const input = $("input", form);
    send(Number(form.closest(".phone").dataset.kid), input.value);
    input.value = "";
  });

  function showTab(name) {
    $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    $$(".tab").forEach((s) => {
      const on = s.id === `tab-${name}`;
      s.hidden = !on;
      if (on) { s.classList.remove("rise"); void s.offsetWidth; s.classList.add("rise"); }
    });
    if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
    if (name === "fairness" && S) renderFairness();
  }

  const initial = location.hash.slice(1);
  if (["fairness", "phones", "chores"].includes(initial)) showTab(initial);
  refresh();
  setInterval(refresh, 2000);
})();
