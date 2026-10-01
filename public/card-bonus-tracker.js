/**
 * <card-bonus-tracker> — drop-in tracker for credit card sign-up bonuses.
 *
 * Framework-agnostic Web Component. Works in plain HTML, React, Vue, Svelte, etc.
 *
 * Usage:
 *   <script type="module" src="card-bonus-tracker.js"></script>
 *   <card-bonus-tracker></card-bonus-tracker>
 *
 * Persistence:
 *   - Default: saves to localStorage under key "cardBonusTracker.v1".
 *   - To use your app's own storage/backend, add the attribute `no-local-storage`,
 *     then call el.setCards(array) to load and listen for the "cards-change" event
 *     (event.detail.cards) to save.
 *
 * Public API:
 *   el.getCards()            -> array of card objects
 *   el.setCards(array)       -> replace all cards
 *   el.importOffers(array)   -> merge in offers (e.g. from a 6-month update file)
 *   el.exportJSON()          -> JSON string of all cards
 *
 * Events:
 *   "cards-change"  detail: { cards }   fired after any add/edit/delete/import
 *
 * Arranging (works like a swipe list):
 *   Slide a card to the right — a green "Move tab" panel appears — and drag it up or down
 *   to its place. Slide it to the left past the red "Delete" panel to delete it (asks first).
 *   The arrangement is this device's own: it is kept in localStorage under
 *   "cardBonusTracker.order.v1" even with no-local-storage, and is never part of the cards.
 *
 * Theming: set --cbt-bg, --cbt-fg, --cbt-muted, --cbt-line, --cbt-soft, --cbt-accent, --cbt-good,
 * --cbt-warn, --cbt-bad (and optionally --cbt-font, --cbt-accent-soft, --cbt-bad-soft, --cbt-shadow)
 * on the element; the title can be hidden with  card-bonus-tracker::part(title) { display:none }.
 */

const STORAGE_KEY = "cardBonusTracker.v1";
const REVIEW_INTERVAL_DAYS = 182; // ~6 months
const ORDER_KEY = "cardBonusTracker.order.v1"; // this device's own arrangement (never synced)

const STATUSES = ["Considering", "Applied", "Approved", "Bonus earned", "Closed"];

const FIELDS = [
  { key: "name", label: "Card", type: "text", required: true, placeholder: "e.g. Sapphire Preferred" },
  { key: "issuer", label: "Issuer", type: "text", placeholder: "e.g. Chase" },
  { key: "category", label: "Type", type: "select", options: ["Travel", "Airline", "Hotel", "Cash back", "Other"] },
  { key: "status", label: "Status", type: "select", options: STATUSES },
  { key: "bonusPoints", label: "Bonus (points/miles)", type: "number" },
  { key: "bonusValue", label: "Est. bonus value ($)", type: "number" },
  { key: "spendRequired", label: "Spend required ($)", type: "number" },
  { key: "spendSoFar", label: "Spent so far ($)", type: "number" },
  { key: "spendWindowDays", label: "Spend window (days)", type: "number", placeholder: "90" },
  { key: "approvedDate", label: "Approved / opened", type: "date" },
  { key: "annualFee", label: "Annual fee ($)", type: "number" },
  { key: "offerExpires", label: "Offer expires", type: "date" },
  { key: "lastReviewed", label: "Offer last checked", type: "date" },
  { key: "link", label: "Offer link", type: "url" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const DAY = 86400000;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parseDate = (s) => (s ? new Date(s + "T00:00:00") : null);
const fmtDate = (d) => d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
const isoDate = (d) => d.toISOString().slice(0, 10);
const money = (n) => (n || n === 0) && n !== "" ? "$" + Number(n).toLocaleString() : "—";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Derived values for one card. */
export function computeCard(c) {
  const opened = parseDate(c.approvedDate);
  const windowDays = Number(c.spendWindowDays) || 90;
  const deadline = opened ? new Date(opened.getTime() + windowDays * DAY) : null;
  const daysLeft = deadline ? Math.round((deadline - today()) / DAY) : null;
  const req = Number(c.spendRequired) || 0;
  const spent = Number(c.spendSoFar) || 0;
  const remaining = Math.max(req - spent, 0);
  const progress = req ? Math.min(spent / req, 1) : 0;
  const reviewed = parseDate(c.lastReviewed);
  const reviewDue = !reviewed || (today() - reviewed) / DAY > REVIEW_INTERVAL_DAYS;
  const feeDate = opened ? new Date(opened.getFullYear() + 1, opened.getMonth(), opened.getDate()) : null;

  let alert = null;
  const chasingBonus = c.status === "Approved" && req > 0 && remaining > 0;
  if (chasingBonus && daysLeft !== null) {
    if (daysLeft < 0) alert = { level: "bad", text: "Spend window passed" };
    else if (daysLeft <= 14) alert = { level: "bad", text: `${daysLeft}d left — ${money(remaining)} to go` };
    else if (daysLeft <= 30) alert = { level: "warn", text: `${daysLeft}d left — ${money(remaining)} to go` };
  }
  if (!alert && c.status === "Approved" && req > 0 && remaining === 0) alert = { level: "good", text: "Spend met — watch for bonus" };

  return { deadline, daysLeft, remaining, progress, reviewDue, feeDate, alert, chasingBonus };
}

class CardBonusTracker extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cards = [];
    this._editingId = null;
    this._filter = "active";
    try { this._order = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]"); } catch { this._order = []; }
    if (!Array.isArray(this._order)) this._order = [];
    this._arranging = false;
  }

  connectedCallback() {
    if (!this.hasAttribute("no-local-storage")) {
      try { this._cards = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { this._cards = []; }
    }
    this.render();
  }

  // ---------- public API ----------
  getCards() { return structuredClone(this._cards); }
  setCards(cards) { this._cards = Array.isArray(cards) ? structuredClone(cards) : []; this.render(); }
  exportJSON() { return JSON.stringify(this._cards, null, 2); }

  /** Merge offers in. Matches existing cards by issuer+name; updates offer fields only,
   *  never your personal progress (spendSoFar, approvedDate, status, notes) — and only while the
   *  card is still being considered: a card you have applied for keeps the terms you got. */
  importOffers(offers) {
    const offerKeys = ["category", "bonusPoints", "bonusValue", "spendRequired", "spendWindowDays", "annualFee", "offerExpires", "link"];
    const key = (c) => `${(c.issuer || "").toLowerCase().trim()}|${(c.name || "").toLowerCase().trim()}`;
    let added = 0, updated = 0, kept = 0;
    for (const o of offers || []) {
      if (!o || !o.name) continue;
      const existing = this._cards.find((c) => key(c) === key(o));
      if (existing && existing.status && existing.status !== "Considering") { kept++; continue; }
      if (existing) {
        offerKeys.forEach((k) => { if (o[k] !== undefined && o[k] !== "") existing[k] = o[k]; });
        existing.lastReviewed = o.lastReviewed || isoDate(today());
        updated++;
      } else {
        this._cards.push({ id: uid(), status: "Considering", lastReviewed: isoDate(today()), ...o, id: uid() });
        added++;
      }
    }
    this._commit();
    return { added, updated, kept };
  }

  // ---------- internals ----------
  _commit() {
    if (!this.hasAttribute("no-local-storage")) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._cards)); } catch {}
    }
    this.dispatchEvent(new CustomEvent("cards-change", { detail: { cards: this.getCards() }, bubbles: true, composed: true }));
    this.render();
  }

  _visibleCards() {
    const list = this._cards.map((c) => ({ c, d: computeCard(c) }));
    const filtered = list.filter(({ c, d }) => {
      if (this._filter === "active") return c.status !== "Closed" && c.status !== "Bonus earned";
      if (this._filter === "review") return d.reviewDue && c.status === "Considering";
      return true;
    });
    return this._sorted(filtered);
  }

  /** Your own arrangement first; anything not arranged yet: urgent first, then by deadline, then name. */
  _sorted(list) {
    const rank = (x) => { const i = this._order.indexOf(x.c.id); return i < 0 ? Infinity : i; };
    return list.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra < rb ? -1 : 1;
      const ua = a.d.alert?.level === "bad" ? 0 : a.d.alert?.level === "warn" ? 1 : 2;
      const ub = b.d.alert?.level === "bad" ? 0 : b.d.alert?.level === "warn" ? 1 : 2;
      if (ua !== ub) return ua - ub;
      const da = a.d.deadline?.getTime() ?? Infinity, db = b.d.deadline?.getTime() ?? Infinity;
      if (da !== db) return da - db;
      return (a.c.name || "").localeCompare(b.c.name || "");
    });
  }

  _summary() {
    const all = this._cards.map((c) => ({ c, d: computeCard(c) }));
    const chasing = all.filter(({ d }) => d.chasingBonus);
    return {
      chasing: chasing.length,
      spendLeft: chasing.reduce((s, { d }) => s + d.remaining, 0),
      earned: all.filter(({ c }) => c.status === "Bonus earned").reduce((s, { c }) => s + (Number(c.bonusValue) || 0), 0),
      reviewDue: all.filter(({ c, d }) => d.reviewDue && c.status === "Considering").length,
      fees: all.filter(({ c }) => c.status !== "Closed" && c.status !== "Considering").reduce((s, { c }) => s + (Number(c.annualFee) || 0), 0),
    };
  }

  render() {
    const s = this._summary();
    const editing = this._editingId ? (this._editingId === "new" ? {} : this._cards.find((c) => c.id === this._editingId) || {}) : null;
    const rows = this._visibleCards();
    const isOffer = ({ c }) => (c.status || "Considering") === "Considering";
    const mine = rows.filter((x) => !isOffer(x)), offers = rows.filter(isOffer);

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="wrap">
        <header>
          <h2 part="title">Card bonuses</h2>
          <div class="actions">
            <button class="ghost" data-act="export">Export</button>
            <label class="ghost btn">Import<input type="file" accept="application/json" data-act="import" hidden></label>
            <button class="primary" data-act="new">+ Add card</button>
          </div>
        </header>

        <section class="stats">
          <div><span>${s.chasing}</span><small>Bonuses in progress</small></div>
          <div><span>${money(s.spendLeft)}</span><small>Spend left to hit</small></div>
          <div><span>${money(s.earned)}</span><small>Bonus value earned</small></div>
          <div><span>${money(s.fees)}</span><small>Annual fees / yr</small></div>
        </section>

        ${s.reviewDue ? `<div class="banner">${s.reviewDue} offer${s.reviewDue > 1 ? "s" : ""} haven't been checked in 6+ months — bonuses change often. <button class="link" data-filter="review">Review</button></div>` : ""}

        <nav class="tabs">
          ${[["active", "Active"], ["review", "Needs review"], ["all", "All"]].map(([k, l]) =>
            `<button class="${this._filter === k ? "on" : ""}" data-filter="${k}">${l}</button>`).join("")}
        </nav>

        ${editing ? this._formHTML(editing) : ""}

        ${mine.length ? `<h4 class="sec">Your cards</h4><div class="list" data-move="1">${mine.map(({ c, d }) => this._cardHTML(c, d)).join("")}</div>` : ""}
        ${offers.length ? this._offersHTML(offers) : ""}
        ${rows.length ? "" : `<p class="empty">${this._cards.length ? "Nothing in this view." : "No cards yet. Add one you're considering or already working on."}</p>`}
      </div>`;

    this._bind();
  }

  _cardHTML(c, d) {
    return `
      <div class="lwrap" data-arr="${esc(c.id)}"><span class="swipe-hint"></span><span class="swipe-flag">${MOVE_ICON} Move tab</span><span class="del-hint"></span><span class="del-flag">${DEL_ICON} Delete</span>
      <article class="card ${d.alert ? "alert-" + d.alert.level : ""}">
        <div class="top">
          <div>
            <h3>${esc(c.name)}</h3>
            <p class="meta">${esc(c.issuer || "")}${c.category ? " · " + esc(c.category) : ""} · <span class="pill">${esc(c.status || "Considering")}</span>
              ${d.reviewDue && c.status === "Considering" ? `<span class="pill stale">check offer</span>` : ""}</p>
          </div>
          <div class="bonus">
            ${c.bonusPoints ? `<strong>${Number(c.bonusPoints).toLocaleString()}</strong><small>pts</small>` : ""}
            ${c.bonusValue ? `<div class="val">≈ ${money(c.bonusValue)}</div>` : ""}
          </div>
        </div>
        ${d.alert ? `<div class="flag ${d.alert.level}">${esc(d.alert.text)}</div>` : ""}
        ${Number(c.spendRequired) ? `
          <div class="progress"><div style="width:${(d.progress * 100).toFixed(0)}%"></div></div>
          <p class="meta">${money(c.spendSoFar || 0)} of ${money(c.spendRequired)}
            ${d.deadline ? ` · deadline ${fmtDate(d.deadline)}` : ` in ${c.spendWindowDays || 90} days`}</p>` : ""}
        <p class="meta small">
          Fee ${money(c.annualFee)}${d.feeDate && c.status !== "Considering" ? ` · next fee ~${fmtDate(d.feeDate)}` : ""}
          ${c.offerExpires ? ` · offer ends ${fmtDate(parseDate(c.offerExpires))}` : ""}
          · checked ${fmtDate(parseDate(c.lastReviewed))}
        </p>
        ${c.notes ? `<p class="notes">${esc(c.notes)}</p>` : ""}
        <div class="row-actions">
          ${d.chasingBonus ? `<button class="ghost" data-act="spend" data-id="${c.id}">+ Log spend</button>` : ""}
          ${/^https?:\/\//i.test(c.link || "") ? `<a class="ghost btn" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">Offer</a>` : ""}
          <button class="ghost" data-act="reviewed" data-id="${c.id}">Mark checked</button>
          <button class="ghost" data-act="edit" data-id="${c.id}">Edit</button>
          <button class="ghost danger" data-act="delete" data-id="${c.id}">Delete</button>
        </div>
      </article></div>`;
  }

  /** Offers to consider: grouped by type, best value first, two short lines each — tap one for its link and actions. */
  _offersHTML(list) {
    const groups = ["Travel", "Airline", "Hotel", "Cash back", "Other"], by = {};
    for (const x of list) { const g = groups.includes(x.c.category) ? x.c.category : "Other"; (by[g] = by[g] || []).push(x); }
    const latest = list.map((x) => x.c.lastReviewed || "").sort().pop();
    return `<h4 class="sec">Offers to consider <small>${latest ? "checked " + fmtDate(parseDate(latest)) + " · " : ""}terms change often, so check the issuer's site before applying</small></h4>
      ${groups.filter((g) => by[g]).map((g) => `<div class="grp">${g} <span>${by[g].length}</span></div>
        <div class="list olist">${by[g].sort((a, b) => (Number(b.c.bonusValue) || 0) - (Number(a.c.bonusValue) || 0)).map(({ c, d }) => this._offerHTML(c, d)).join("")}</div>`).join("")}`;
  }

  _offerHTML(c, d) {
    const open = this._openId === c.id;
    const span = (n) => { n = Number(n) || 90; return n % 30 === 0 ? `${n / 30} month${n === 30 ? "" : "s"}` : `${n} days`; };
    const spend = Number(c.spendRequired) > 1 ? `spend ${money(c.spendRequired)} in ${span(c.spendWindowDays)}` : `any purchase in ${span(c.spendWindowDays)}`;
    const fee = Number(c.annualFee) ? `${money(c.annualFee)}/yr fee` : "no annual fee";
    return `
      <div class="lwrap" data-arr="${esc(c.id)}"><span class="del-hint"></span><span class="del-flag">${DEL_ICON} Delete</span>
      <article class="offer ${open ? "open" : ""}" data-open="${esc(c.id)}">
        <div class="o-top"><span class="o-name">${esc(c.name)}</span><span class="o-val">${Number(c.bonusValue) ? "≈ " + money(c.bonusValue) : ""}</span></div>
        <div class="o-sub">${esc(c.issuer || "")}${Number(c.bonusPoints) ? " · " + Number(c.bonusPoints).toLocaleString() + " pts" : ""}</div>
        <div class="o-sub">${spend} · ${fee}${c.offerExpires ? ` · <b>ends ${fmtDate(parseDate(c.offerExpires))}</b>` : ""}${d.reviewDue ? ' · <span class="stale">check offer</span>' : ""}</div>
        ${open ? `<div class="row-actions">
          ${/^https?:\/\//i.test(c.link || "") ? `<a class="ghost btn" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">Offer</a>` : ""}
          <button class="primary" data-act="applied" data-id="${c.id}">I applied</button>
          <button class="ghost" data-act="reviewed" data-id="${c.id}">Mark checked</button>
          <button class="ghost" data-act="edit" data-id="${c.id}">Edit</button>
          <button class="ghost danger" data-act="delete" data-id="${c.id}">Delete</button>
        </div>` : ""}
      </article></div>`;
  }

  _formHTML(c) {
    const field = (f) => {
      const v = c[f.key] ?? (f.key === "status" ? "Considering" : f.key === "lastReviewed" ? isoDate(today()) : "");
      let input;
      if (f.type === "select") input = `<select name="${f.key}">${f.options.map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`;
      else if (f.type === "textarea") input = `<textarea name="${f.key}" rows="2">${esc(v)}</textarea>`;
      else input = `<input name="${f.key}" type="${f.type}" value="${esc(v)}" ${f.required ? "required" : ""} placeholder="${esc(f.placeholder || "")}" ${f.type === "number" ? 'min="0" step="any"' : ""}>`;
      return `<label class="${f.type === "textarea" ? "full" : ""}">${f.label}${input}</label>`;
    };
    return `
      <form class="editor">
        <h3>${c.id ? "Edit card" : "Add card"}</h3>
        <div class="grid">${FIELDS.map(field).join("")}</div>
        <div class="row-actions">
          <button type="submit" class="primary">Save</button>
          <button type="button" class="ghost" data-act="cancel">Cancel</button>
        </div>
      </form>`;
  }

  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-filter]").forEach((b) => b.onclick = () => { this._filter = b.dataset.filter; this.render(); });
    root.querySelectorAll("[data-act]").forEach((el) => {
      const act = el.dataset.act, id = el.dataset.id;
      if (act === "import") { el.onchange = (e) => this._handleImport(e); return; }
      el.onclick = () => {
        if (act === "new") { this._editingId = "new"; this.render(); }
        if (act === "edit") { this._editingId = id; this.render(); }
        if (act === "cancel") { this._editingId = null; this.render(); }
        if (act === "delete") {
          const c = this._cards.find((x) => x.id === id);
          if (confirm(`Delete ${c?.name || "this card"}?`)) { this._cards = this._cards.filter((x) => x.id !== id); this._commit(); }
        }
        if (act === "reviewed") { const c = this._cards.find((x) => x.id === id); c.lastReviewed = isoDate(today()); this._commit(); }
        if (act === "applied") { const c = this._cards.find((x) => x.id === id); if (c) { c.status = "Applied"; this._openId = null; this._commit(); } }
        if (act === "spend") {
          const c = this._cards.find((x) => x.id === id);
          const amt = parseFloat(prompt(`Add spend to ${c.name} ($):`, ""));
          if (!isNaN(amt)) { c.spendSoFar = (Number(c.spendSoFar) || 0) + amt; this._commit(); }
        }
        if (act === "export") this._download();
      };
    });
    root.querySelectorAll("[data-open]").forEach((el) => el.onclick = (e) => {
      if (this._arranging || e.target.closest("button, a")) return;
      this._openId = this._openId === el.dataset.open ? null : el.dataset.open; this.render();
    });
    this._bindArrange();
    const form = root.querySelector("form.editor");
    if (form) form.onsubmit = (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      FIELDS.filter((f) => f.type === "number").forEach((f) => { data[f.key] = data[f.key] === "" ? "" : Number(data[f.key]); });
      if (this._editingId === "new") this._cards.push({ id: uid(), ...data });
      else Object.assign(this._cards.find((c) => c.id === this._editingId), data);
      this._editingId = null;
      this._commit();
    };
  }

  /** Slide right to carry a card to a new place; slide left past the red panel to delete it. */
  _bindArrange() { this.shadowRoot.querySelectorAll(".list").forEach((list) => this._bindList(list)); }
  _bindList(list) {
    if (!list.querySelector("[data-arr]")) return;
    let p = null;
    const noScroll = (e) => e.preventDefault(); // the page stays still while a card is being carried
    const onMove = (e) => {
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!p.mode) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { // a sideways slide: right moves it, left deletes it
          if (dx > 0 && !list.dataset.move) { end(); return; } // offers are kept sorted by value: they only swipe away
          p.mode = dx > 0 ? "move" : "del"; this._arranging = true;
          p.row.classList.add(p.mode === "move" ? "moving" : "deleting"); list.classList.add("arranging");
          document.addEventListener("touchmove", noScroll, { passive: false });
          try { p.row.setPointerCapture(e.pointerId); p.captured = e.pointerId; } catch {} // only now, so plain taps still reach the buttons
          try { if (navigator.vibrate) navigator.vibrate(20); } catch {}
        } else if (Math.abs(dy) > 12) { end(); return; } // scrolling
        else return;
      }
      if (p.mode === "del") {
        p.inner.style.transform = `translateX(${Math.min(0, Math.max(dx, -120))}px)`;
        p.far = dx <= -80; p.row.classList.toggle("armed", p.far);
        return;
      }
      p.inner.style.transform = `translateX(${Math.max(0, Math.min(dx, 96))}px)`;
      for (const s of list.querySelectorAll("[data-arr]")) { // place it by where the finger is, not by what is under it
        if (s === p.row) continue;
        const b = s.getBoundingClientRect();
        if (e.clientY >= b.top && e.clientY <= b.bottom) { list.insertBefore(p.row, e.clientY < b.top + b.height / 2 ? s : s.nextSibling); break; }
      }
    };
    const end = () => {
      if (!p) return; const { row, inner, mode, far, captured } = p; p = null;
      if (captured != null) try { row.releasePointerCapture(captured); } catch {}
      document.removeEventListener("pointermove", onMove); document.removeEventListener("touchmove", noScroll);
      inner.style.transform = ""; row.classList.remove("moving", "deleting", "armed");
      if (!mode) return;
      list.classList.remove("arranging");
      setTimeout(() => { this._arranging = false; }, 60); // let the click that ends the gesture fall away
      const id = row.dataset.arr;
      if (mode === "del") {
        if (!far) return; // not far enough: it springs back
        const c = this._cards.find((x) => x.id === id);
        if (c && confirm(`Delete ${c.name || "this card"}?`)) { this._cards = this._cards.filter((x) => x.id !== id); this._order = this._order.filter((x) => x !== id); this._saveOrder(); this._commit(); }
        return;
      }
      this._arrange([...list.querySelectorAll("[data-arr]")].map((el) => el.dataset.arr));
    };
    list.addEventListener("pointerdown", (e) => {
      const row = e.target.closest("[data-arr]");
      if (!row || p || this._arranging || e.target.closest("input, select, textarea")) return;
      p = { row, inner: row.querySelector(".card, .offer") || row, x: e.clientX, y: e.clientY, mode: null, far: false };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", end, { once: true });
      document.addEventListener("pointercancel", end, { once: true });
    });
    list.addEventListener("click", (e) => { if (this._arranging) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  /** Keep a new arrangement of the cards on screen, leaving cards hidden by the current tab where they sit. */
  _arrange(visibleIds) {
    const full = this._sorted(this._cards.map((c) => ({ c, d: computeCard(c) }))).map((x) => x.c.id);
    const slots = visibleIds.map((id) => full.indexOf(id)).filter((i) => i >= 0).sort((a, b) => a - b);
    visibleIds.forEach((id, k) => { if (k < slots.length) full[slots[k]] = id; });
    this._order = full; this._saveOrder(); this.render();
  }
  _saveOrder() { try { localStorage.setItem(ORDER_KEY, JSON.stringify(this._order)); } catch {} }

  _download() {
    const blob = new Blob([this.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `card-bonuses-${isoDate(today())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async _handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const offers = Array.isArray(data) ? data : data.offers || data.cards || [];
      const { added, updated } = this.importOffers(offers);
      alert(`Imported: ${added} new, ${updated} updated.`);
    } catch { alert("That file isn't valid tracker JSON."); }
  }
}

const MOVE_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5L2.5 7 6 10.5"/><path d="M10 3.5L13.5 7 10 10.5"/><path d="M2.5 7h11"/></svg>';
const DEL_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

const STYLES = `
  :host { --bg:var(--cbt-bg,#fff); --fg:var(--cbt-fg,#1a1d21); --muted:var(--cbt-muted,#6b7280); --line:var(--cbt-line,#e5e7eb); --soft:var(--cbt-soft,#f6f7f9); --accent:var(--cbt-accent,#2f6fed);
          --good:var(--cbt-good,#15803d); --warn:var(--cbt-warn,#b45309); --bad:var(--cbt-bad,#b91c1c); display:block; font:var(--cbt-font,14px/1.45 system-ui,-apple-system,sans-serif); color:var(--fg);
          --accent-soft:var(--cbt-accent-soft,color-mix(in srgb,var(--accent) 14%,var(--bg))); --accent-line:var(--cbt-accent-line,color-mix(in srgb,var(--accent) 45%,var(--bg)));
          --bad-soft:var(--cbt-bad-soft,color-mix(in srgb,var(--bad) 12%,var(--bg))); --shadow:var(--cbt-shadow,0 6px 18px rgba(0,0,0,.14)); }
  @media (prefers-color-scheme: dark) { :host { --bg:var(--cbt-bg,#16181c); --fg:var(--cbt-fg,#eef0f3); --muted:var(--cbt-muted,#9aa1ab); --line:var(--cbt-line,#2b2f36); --soft:var(--cbt-soft,#1e2127); --accent:var(--cbt-accent,#6b9bff);
          --good:var(--cbt-good,#4ade80); --warn:var(--cbt-warn,#fbbf24); --bad:var(--cbt-bad,#f87171); } }
  * { box-sizing:border-box; }
  .wrap { background:var(--bg); max-width:900px; margin:0 auto; padding:16px; }
  header { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
  h2 { margin:0; font-size:20px; } h3 { margin:0; font-size:16px; }
  .actions, .row-actions { display:flex; gap:8px; flex-wrap:wrap; }
  button, .btn { font:inherit; border-radius:8px; padding:7px 12px; cursor:pointer; border:1px solid var(--line); background:var(--bg); color:var(--fg); text-decoration:none; display:inline-block; }
  .primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  .ghost:hover { background:var(--soft); } .danger { color:var(--bad); }
  .link { border:none; background:none; color:var(--accent); padding:0; text-decoration:underline; }
  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:16px 0; }
  .stats div { background:var(--soft); border-radius:10px; padding:10px 12px; }
  .stats span { display:block; font-size:18px; font-weight:600; } .stats small { color:var(--muted); }
  @media (max-width:560px) { .stats { grid-template-columns:repeat(2,1fr); } }
  .banner { background:color-mix(in srgb, var(--warn) 12%, transparent); color:var(--fg); border-radius:10px; padding:10px 12px; margin-bottom:12px; }
  .tabs { display:flex; gap:6px; margin-bottom:12px; }
  .tabs button { border-radius:999px; padding:5px 12px; } .tabs .on { background:var(--fg); color:var(--bg); border-color:var(--fg); }
  .list { display:grid; gap:10px; }
  .card { border:1px solid var(--line); border-radius:12px; padding:14px; }
  .card.alert-bad { border-left:4px solid var(--bad); } .card.alert-warn { border-left:4px solid var(--warn); } .card.alert-good { border-left:4px solid var(--good); }
  .top { display:flex; justify-content:space-between; gap:12px; }
  .bonus { text-align:right; white-space:nowrap; } .bonus strong { font-size:18px; } .bonus small { color:var(--muted); margin-left:3px; }
  .val { color:var(--muted); font-size:13px; }
  .meta { color:var(--muted); margin:4px 0; } .small { font-size:12.5px; }
  .pill { background:var(--soft); border-radius:999px; padding:1px 8px; font-size:12px; color:var(--fg); }
  .pill.stale { color:var(--warn); }
  .flag { margin:8px 0 4px; font-weight:600; font-size:13px; }
  .flag.bad { color:var(--bad); } .flag.warn { color:var(--warn); } .flag.good { color:var(--good); }
  .progress { height:6px; background:var(--soft); border-radius:99px; overflow:hidden; margin:8px 0 2px; }
  .progress div { height:100%; background:var(--accent); }
  .notes { margin:6px 0; white-space:pre-wrap; }
  .row-actions { margin-top:10px; } .row-actions button, .row-actions .btn { padding:5px 10px; font-size:13px; }
  .editor { border:1px solid var(--line); border-radius:12px; padding:14px; margin-bottom:12px; background:var(--soft); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; margin:12px 0; }
  label { display:flex; flex-direction:column; gap:4px; font-size:12.5px; color:var(--muted); } label.full { grid-column:1/-1; }
  input, select, textarea { font:inherit; color:var(--fg); background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:7px 9px; }
  .empty { color:var(--muted); text-align:center; padding:24px 0; }
  /* arranging: slide right to move (green), slide left to delete (red) */
  .lwrap { position:relative; border-radius:12px; touch-action:pan-y; }
  .lwrap > .card { position:relative; z-index:1; background:var(--bg); touch-action:pan-y; }
  .swipe-hint, .del-hint { position:absolute; inset:0; z-index:0; border-radius:12px; display:none; pointer-events:none; }
  .swipe-hint { background:var(--accent-soft); } .del-hint { background:var(--bad-soft); }
  .swipe-flag, .del-flag { position:absolute; top:50%; transform:translateY(-50%); z-index:3; display:none; align-items:center; gap:5px; padding:5px 11px; border-radius:999px; font-size:12px; font-weight:700; letter-spacing:.02em; white-space:nowrap; pointer-events:none; }
  .swipe-flag { left:10px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent-line); }
  .del-flag { right:10px; background:var(--bad-soft); color:var(--bad); border:1px solid var(--bad); }
  .swipe-flag svg, .del-flag svg { width:14px; height:14px; }
  .lwrap.moving .swipe-hint, .lwrap.moving .swipe-flag, .lwrap.deleting .del-hint, .lwrap.deleting .del-flag { display:flex; }
  .lwrap.deleting.armed .del-flag { background:var(--bad); color:#fff; }
  .lwrap.moving, .lwrap.deleting { box-shadow:var(--shadow); z-index:2; }
  .list.arranging { cursor:grabbing; user-select:none; }
  /* offers to consider: grouped, compact, easy to scan */
  .sec { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; margin:18px 2px 8px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  .sec small { text-transform:none; letter-spacing:0; font-weight:400; }
  .grp { margin:14px 2px 6px; font-weight:700; font-size:14px; } .grp span { color:var(--muted); font-weight:500; margin-left:4px; }
  .olist { gap:0; border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  .olist .lwrap { border-radius:0; border-bottom:1px solid var(--line); } .olist .lwrap:last-child { border-bottom:0; }
  .olist .del-hint { border-radius:0; }
  .offer { position:relative; z-index:1; background:var(--bg); padding:10px 12px; cursor:pointer; touch-action:pan-y; }
  .offer.open { background:var(--soft); }
  .o-top { display:flex; justify-content:space-between; gap:10px; align-items:baseline; }
  .o-name { font-weight:600; } .o-val { font-weight:700; white-space:nowrap; }
  .o-sub { color:var(--muted); font-size:12.5px; margin-top:2px; } .o-sub b { color:var(--fg); font-weight:600; } .stale { color:var(--warn); }
  .offer .row-actions { margin-top:8px; }
`;

if (!customElements.get("card-bonus-tracker")) customElements.define("card-bonus-tracker", CardBonusTracker);
export default CardBonusTracker;
