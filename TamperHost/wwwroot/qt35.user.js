// ==UserScript==
// @name         QT35_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.43
// @description  Displays read-only “Attachments: N” in the Quote Wizard action bar.
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js
// @require      http://localhost:5000/lt-data-core.user.js 
// @require      http://localhost:5000/lt-core.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.plex.com
// @connect      localhost
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  // src/quote-tracking/qt35-attachmentsGet/qt35.index.js
  (() => {
    "use strict";
    const DEV = true ? true : true;
    const dlog = (...a) => DEV && console.debug("QT35", ...a);
    const derr = (...a) => console.error("QT35 \u2716\uFE0F", ...a);
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!(window.TMUtils && window.TMUtils.matchRoute && window.TMUtils.matchRoute(ROUTES))) return;
    const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const CFG = {
      ACTION_BAR_SEL: "#QuoteWizardSharedActionBar",
      GRID_SEL: ".plex-grid",
      SHOW_ON_PAGES_RE: /review|summary|submit/i,
      DS_ATTACHMENTS_BY_QUOTE: 11713,
      ATTACHMENT_GROUP_KEY: 11,
      DS_QUOTE_HEADER_GET: 3156,
      POLL_MS: 200,
      TIMEOUT_MS: 12e3
    };
    function getActiveWizardPageName() {
      const active = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
      if (active) {
        try {
          const vm = KO?.dataFor?.(active);
          const name = vm ? window.TMUtils?.getObsValue?.(vm, "Name") || window.TMUtils?.getObsValue?.(vm, "name") : "";
          if (name) return String(name);
        } catch {
        }
      }
      const h = document.querySelector(".wizard-header, .plex-page h1, h1");
      if (h?.textContent) return h.textContent.trim();
      const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
      return (nav?.textContent || "").trim();
    }
    function isOnTargetWizardPage() {
      return CFG.SHOW_ON_PAGES_RE.test(getActiveWizardPageName() || "");
    }
    async function ensureWizardVM() {
      const anchor = document.querySelector(CFG.GRID_SEL) ? CFG.GRID_SEL : CFG.ACTION_BAR_SEL;
      const { viewModel } = await (window.TMUtils?.waitForModelAsync(anchor, { pollMs: CFG.POLL_MS, timeoutMs: CFG.TIMEOUT_MS, requireKo: true }) ?? { viewModel: null });
      return viewModel;
    }
    function getQuoteKeyDeterministic() {
      try {
        const grid = document.querySelector(CFG.GRID_SEL);
        if (grid && KO?.dataFor) {
          const gridVM = KO.dataFor(grid);
          const raw0 = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw[0] : null;
          const v = raw0 ? window.TMUtils?.getObsValue?.(raw0, "QuoteKey") : null;
          if (v != null) return Number(v);
        }
      } catch {
      }
      try {
        const rootEl = document.querySelector(".plex-wizard, .plex-page");
        const rootVM = rootEl ? KO?.dataFor?.(rootEl) : null;
        const v = rootVM && (window.TMUtils?.getObsValue?.(rootVM, "QuoteKey") || window.TMUtils?.getObsValue?.(rootVM, "Quote.QuoteKey"));
        if (v != null) return Number(v);
      } catch {
      }
      const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
      return m ? Number(m[1]) : null;
    }
    const DataCore = (() => {
      const DC = window.lt?.core?.data ?? window.lt?.data ?? null;
      if (DC?.createDataContext && (DC?.RepoBase || DC?.RepoBase?.value)) {
        return {
          create(ns, scopeKey) {
            const ctx2 = DC.createDataContext({ ns, scopeKey, persist: "session", ttlMs: 3e3 });
            try {
              sessionStorage.setItem("lt.tabId", ctx2.tabId);
            } catch {
            }
            return { makeRepo: ctx2.makeRepo, scopeKey, tabId: ctx2.tabId };
          },
          RepoBase: DC.RepoBase?.value ?? DC.RepoBase
        };
      }
      const getTabId = () => {
        let id = sessionStorage.getItem("lt.tabId");
        if (!id) {
          id = crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
          sessionStorage.setItem("lt.tabId", id);
        }
        return id;
      };
      class SessionStore {
        get(k) {
          const v = sessionStorage.getItem(k);
          return v ? JSON.parse(v) : null;
        }
        set(k, v) {
          sessionStorage.setItem(k, JSON.stringify(v));
        }
        del(k) {
          sessionStorage.removeItem(k);
        }
      }
      class Cache {
        constructor(ttl = 3e3) {
          this.ttl = ttl;
          this.m = /* @__PURE__ */ new Map();
        }
        get(k) {
          const e = this.m.get(k);
          if (!e) return null;
          if (Date.now() > e.expires) {
            this.m.delete(k);
            return null;
          }
          return e.value;
        }
        set(k, v) {
          this.m.set(k, { value: v, expires: Date.now() + this.ttl });
        }
        del(k) {
          this.m.delete(k);
        }
      }
      class RepoBase {
        constructor({ ns, entity, scopeKey }) {
          if (!scopeKey) throw new Error(`${entity} repo requires scopeKey`);
          Object.assign(this, { ns, entity, scopeKey, tabId: getTabId(), store: new SessionStore(), cache: new Cache(3e3) });
        }
        k(id = "current") {
          return `lt:${this.ns}:tab:${this.tabId}:scope:${this.scopeKey}:${this.entity}:${id}`;
        }
        getCached(id) {
          return this.cache.get(this.k(id));
        }
        setCached(id, v) {
          this.cache.set(this.k(id), v);
        }
        async read(id) {
          const k = this.k(id);
          const c = this.getCached(id);
          if (c) return c;
          const v = this.store.get(k);
          if (v) this.setCached(id, v);
          return v ?? null;
        }
        async write(id, v) {
          const k = this.k(id);
          this.store.set(k, v);
          this.setCached(id, v);
          return v;
        }
        async remove(id) {
          const k = this.k(id);
          this.store.del(k);
          this.cache.del(k);
        }
      }
      function create(ns, scopeKey) {
        const base = { ns, scopeKey };
        const makeRepo = (Ctor) => new Ctor(base);
        return { makeRepo, scopeKey, tabId: getTabId() };
      }
      return { create, RepoBase };
    })();
    class QuoteRepo extends DataCore.RepoBase {
      constructor(base) {
        super({ ...base, entity: "QuoteHeader" });
      }
      async get() {
        return await this.read("current");
      }
      async set(v) {
        return await this.write("current", v);
      }
      async clear() {
        return await this.remove("current");
      }
      async update(patch) {
        const cur = await this.get() || {};
        return await this.set({ ...cur, ...patch, Updated_At: Date.now() });
      }
    }
    let ctx = null, quoteRepo = null, lastScope = null, refreshInFlight = false;
    async function ensureRepoForQuote(qk) {
      if (!qk || !Number.isFinite(qk) || qk <= 0) return null;
      if (!ctx || lastScope !== qk) {
        ctx = DataCore.create("QT", qk);
        quoteRepo = ctx.makeRepo(QuoteRepo);
        lastScope = qk;
      }
      return quoteRepo;
    }
    async function withFreshAuth(run) {
      try {
        return await run();
      } catch (err) {
        const s = err?.status || (/(\b\d{3}\b)/.exec(err?.message || "") || [])[1];
        if (+s === 419) {
          try {
            await window.lt?.core?.auth?.getKey?.();
          } catch {
          }
          return await run();
        }
        throw err;
      }
    }
    async function mergeDraftIntoQuoteOnce(qk) {
      if (!qk || !Number.isFinite(qk) || qk <= 0) return;
      const draftCtx = DataCore.create("QT", "draft");
      const draftRepo = draftCtx.makeRepo(QuoteRepo);
      const draft = await draftRepo.get();
      if (!draft) return;
      await ensureRepoForQuote(qk);
      const current = await quoteRepo.get() || {};
      const promotedAt = Number(current.Promoted_At || 0);
      const draftUpdated = Number(draft.Updated_At || 0);
      const curCust = String(current.Customer_No ?? "");
      const newCust = String(draft.Customer_No ?? "");
      const needsMerge = draftUpdated > promotedAt || curCust !== newCust || current.Catalog_Key !== draft.Catalog_Key || current.Catalog_Code !== draft.Catalog_Code;
      if (!needsMerge) return;
      const merged = {
        ...current,
        Quote_Key: qk,
        Customer_No: draft.Customer_No ?? null,
        Catalog_Key: draft.Catalog_Key ?? null,
        Catalog_Code: draft.Catalog_Code ?? null,
        Promoted_From: "draft",
        Promoted_At: Date.now()
      };
      await quoteRepo.set(merged);
      const merged2 = { ...merged };
      delete merged2.Quote_Header_Fetched_At;
      await quoteRepo.set(merged2);
      await draftRepo.clear();
      dlog("Draft merged and cleared (re-promote if newer/different)", { qk, merged });
      if (typeof fetchedHeaderOnce !== "undefined") {
        fetchedHeaderOnce.delete(`${ctx?.tabId || "shim"}:${qk}`);
      }
    }
    async function fetchAttachmentCount(quoteKey) {
      const rows = await withFreshAuth(() => window.lt.core.plex.dsRows(CFG.DS_ATTACHMENTS_BY_QUOTE, {
        Attachment_Group_Key: CFG.ATTACHMENT_GROUP_KEY,
        Record_Key_Value: String(quoteKey)
      }));
      return Array.isArray(rows) ? rows.length : 0;
    }
    function quoteHeaderGet(row) {
      return {
        Customer_Code: row?.Customer_Code ?? null,
        Customer_Name: row?.Customer_Name ?? null,
        Customer_No: row?.Customer_No ?? null,
        Quote_No: row?.Quote_No ?? null
      };
    }
    async function hydratePartSummaryOnce(qk) {
      await ensureRepoForQuote(qk);
      if (!quoteRepo) return;
      const snap = await quoteRepo.get() || {};
      if (snap.Quote_Header_Fetched_At) return;
      const plex = typeof getPlexFacade === "function" ? await getPlexFacade() : window.lt.core.plex;
      const rows = await withFreshAuth(() => plex.dsRows(CFG.DS_QUOTE_HEADER_GET, { Quote_Key: String(qk) }));
      const first = Array.isArray(rows) && rows.length ? quoteHeaderGet(rows[0]) : null;
      if (!first) return;
      await quoteRepo.update({ Quote_Key: qk, ...first, Quote_Header_Fetched_At: Date.now() });
    }
    const LI_ID = "lt-attachments-badge";
    const PILL_ID = "lt-attach-pill";
    function ensureBadge() {
      const bar = document.querySelector(CFG.ACTION_BAR_SEL);
      if (!bar || bar.tagName !== "UL") return null;
      const existing = document.getElementById(LI_ID);
      if (existing) return existing;
      const li = document.createElement("li");
      li.id = LI_ID;
      const a = document.createElement("a");
      a.href = "javascript:void(0)";
      a.title = "Refresh attachments (manual)";
      const pill = document.createElement("span");
      pill.id = PILL_ID;
      Object.assign(pill.style, { display: "inline-block", minWidth: "18px", padding: "2px 8px", borderRadius: "999px", textAlign: "center", fontWeight: "600" });
      a.appendChild(document.createTextNode("Attachments "));
      a.appendChild(pill);
      li.appendChild(a);
      bar.appendChild(li);
      a.addEventListener("click", () => runOneRefresh(true));
      return li;
    }
    function setBadgeCount(n) {
      const pill = document.getElementById(PILL_ID);
      if (!pill) return;
      pill.textContent = String(n ?? 0);
      const isZero = !n || n === 0;
      pill.style.background = isZero ? "#e5e7eb" : "#10b981";
      pill.style.color = isZero ? "#111827" : "#fff";
    }
    async function runOneRefresh(manual = false) {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        await ensureWizardVM();
        const qk = getQuoteKeyDeterministic();
        if (!qk || !Number.isFinite(qk) || qk <= 0) {
          setBadgeCount(0);
          if (manual) window.TMUtils?.toast?.("\u26A0\uFE0F Quote Key not found", "warn", 2200);
          return;
        }
        if (!ctx || lastScope !== qk) {
          await ensureRepoForQuote(qk);
          try {
            const snap = await quoteRepo.get();
            if (snap?.Attachment_Count != null) setBadgeCount(Number(snap.Attachment_Count));
          } catch {
          }
        }
        await mergeDraftIntoQuoteOnce(qk);
        const count = await fetchAttachmentCount(qk);
        setBadgeCount(count);
        await quoteRepo.update({ Quote_Key: qk, Attachment_Count: Number(count) });
        if (manual) {
          const ok = count > 0;
          window.TMUtils?.toast?.(ok ? `\u2705 ${count} attachment(s)` : "\u26A0\uFE0F No attachments", ok ? "success" : "warn", 2e3);
        }
        dlog("refresh", { qk, count });
      } catch (err) {
        derr("refresh failed", err);
        window.TMUtils?.toast?.(`\u274C Attachments refresh failed: ${err?.message || err}`, "error", 4e3);
      } finally {
        refreshInFlight = false;
      }
    }
    let booted = false;
    let offUrl = null;
    function wireNav(handler) {
      offUrl?.();
      offUrl = window.TMUtils?.onUrlChange?.(handler);
    }
    async function init() {
      if (booted) return;
      booted = true;
      await raf();
      const li = ensureBadge();
      if (!li) return;
      startWizardPageObserver();
      const show = isOnTargetWizardPage();
      li.style.display = show ? "" : "none";
      if (show) {
        await ensureWizardVM();
        const qk = getQuoteKeyDeterministic();
        if (qk && Number.isFinite(qk) && qk > 0) {
          await ensureRepoForQuote(qk);
          await mergeDraftIntoQuoteOnce(qk);
          await runOneRefresh(false);
          try {
            await hydratePartSummaryOnce(qk);
          } catch (e) {
            console.error("QT35 hydrate failed", e);
          }
        }
      }
      dlog("initialized");
    }
    function teardown() {
      booted = false;
      offUrl?.();
      offUrl = null;
      stopWizardPageObserver();
    }
    init();
    let lastWizardPage = null;
    let pageObserver = null;
    function startWizardPageObserver() {
      const root = document.querySelector(".plex-wizard") || document.body;
      lastWizardPage = getActiveWizardPageName();
      pageObserver?.disconnect();
      pageObserver = new MutationObserver(() => {
        const name = getActiveWizardPageName();
        if (name !== lastWizardPage) {
          lastWizardPage = name;
          if (isOnTargetWizardPage()) {
            queueMicrotask(async () => {
              const qk = getQuoteKeyDeterministic();
              if (qk && Number.isFinite(qk) && qk > 0) {
                await ensureRepoForQuote(qk);
                await mergeDraftIntoQuoteOnce(qk);
                await runOneRefresh(false);
                try {
                  await hydratePartSummaryOnce(qk);
                } catch {
                }
              }
            });
          }
        }
      });
      pageObserver.observe(root, { attributes: true, childList: true, subtree: true, attributeFilter: ["class", "aria-current"] });
    }
    function stopWizardPageObserver() {
      pageObserver?.disconnect();
      pageObserver = null;
    }
    wireNav(() => {
      if (window.TMUtils?.matchRoute?.(ROUTES)) init();
      else teardown();
    });
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzXHJcblxyXG4oKCkgPT4ge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG5cclxuICAgIGNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpID8gX19CVUlMRF9ERVZfXyA6IHRydWU7XHJcbiAgICBjb25zdCBkbG9nID0gKC4uLmEpID0+IERFViAmJiBjb25zb2xlLmRlYnVnKCdRVDM1JywgLi4uYSk7XHJcbiAgICBjb25zdCBkZXJyID0gKC4uLmEpID0+IGNvbnNvbGUuZXJyb3IoJ1FUMzUgXHUyNzE2XHVGRTBGJywgLi4uYSk7XHJcblxyXG4gICAgY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcclxuICAgIGlmICghKHdpbmRvdy5UTVV0aWxzICYmIHdpbmRvdy5UTVV0aWxzLm1hdGNoUm91dGUgJiYgd2luZG93LlRNVXRpbHMubWF0Y2hSb3V0ZShST1VURVMpKSkgcmV0dXJuO1xyXG5cclxuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcclxuICAgIGNvbnN0IHJhZiA9ICgpID0+IG5ldyBQcm9taXNlKHIgPT4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHIpKTtcclxuXHJcbiAgICBjb25zdCBDRkcgPSB7XHJcbiAgICAgICAgQUNUSU9OX0JBUl9TRUw6ICcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLFxyXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXHJcbiAgICAgICAgU0hPV19PTl9QQUdFU19SRTogL3Jldmlld3xzdW1tYXJ5fHN1Ym1pdC9pLFxyXG4gICAgICAgIERTX0FUVEFDSE1FTlRTX0JZX1FVT1RFOiAxMTcxMyxcclxuICAgICAgICBBVFRBQ0hNRU5UX0dST1VQX0tFWTogMTEsXHJcbiAgICAgICAgRFNfUVVPVEVfSEVBREVSX0dFVDogMzE1NixcclxuICAgICAgICBQT0xMX01TOiAyMDAsXHJcbiAgICAgICAgVElNRU9VVF9NUzogMTJfMDAwXHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkge1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xyXG4gICAgICAgIGlmIChhY3RpdmUpIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHZtID0gS08/LmRhdGFGb3I/LihhY3RpdmUpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbmFtZSA9IHZtID8gKHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHZtLCAnTmFtZScpIHx8IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHZtLCAnbmFtZScpKSA6ICcnO1xyXG4gICAgICAgICAgICAgICAgaWYgKG5hbWUpIHJldHVybiBTdHJpbmcobmFtZSk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGggPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcud2l6YXJkLWhlYWRlciwgLnBsZXgtcGFnZSBoMSwgaDEnKTtcclxuICAgICAgICBpZiAoaD8udGV4dENvbnRlbnQpIHJldHVybiBoLnRleHRDb250ZW50LnRyaW0oKTtcclxuICAgICAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5hY3RpdmUsIC5wbGV4LXdpemFyZC1wYWdlLWxpc3QgW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcclxuICAgICAgICByZXR1cm4gKG5hdj8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIGlzT25UYXJnZXRXaXphcmRQYWdlKCkgeyByZXR1cm4gQ0ZHLlNIT1dfT05fUEFHRVNfUkUudGVzdChnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHx8ICcnKTsgfVxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVdpemFyZFZNKCkge1xyXG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcclxuICAgICAgICBjb25zdCB7IHZpZXdNb2RlbCB9ID0gYXdhaXQgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYyhhbmNob3IsIHsgcG9sbE1zOiBDRkcuUE9MTF9NUywgdGltZW91dE1zOiBDRkcuVElNRU9VVF9NUywgcmVxdWlyZUtvOiB0cnVlIH0pID8/IHsgdmlld01vZGVsOiBudWxsIH0pO1xyXG4gICAgICAgIHJldHVybiB2aWV3TW9kZWw7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5HUklEX1NFTCk7XHJcbiAgICAgICAgICAgIGlmIChncmlkICYmIEtPPy5kYXRhRm9yKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBncmlkVk0gPSBLTy5kYXRhRm9yKGdyaWQpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmF3MCA9IEFycmF5LmlzQXJyYXkoZ3JpZFZNPy5kYXRhc291cmNlPy5yYXcpID8gZ3JpZFZNLmRhdGFzb3VyY2UucmF3WzBdIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSByYXcwID8gd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocmF3MCwgJ1F1b3RlS2V5JykgOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkgcmV0dXJuIE51bWJlcih2KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3Qgcm9vdEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLCAucGxleC1wYWdlJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvb3RWTSA9IHJvb3RFbCA/IEtPPy5kYXRhRm9yPy4ocm9vdEVsKSA6IG51bGw7XHJcbiAgICAgICAgICAgIGNvbnN0IHYgPSByb290Vk0gJiYgKHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJvb3RWTSwgJ1F1b3RlS2V5JykgfHwgd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGUuUXVvdGVLZXknKSk7XHJcbiAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XHJcbiAgICAgICAgfSBjYXRjaCB7IH1cclxuICAgICAgICBjb25zdCBtID0gL1s/Jl1RdW90ZUtleT0oXFxkKykvaS5leGVjKGxvY2F0aW9uLnNlYXJjaCk7XHJcbiAgICAgICAgcmV0dXJuIG0gPyBOdW1iZXIobVsxXSkgOiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09IERhdGFDb3JlIChwcmVmZXIgbHQuY29yZS5kYXRhIG9yIGx0LmRhdGE7IGZhbGxiYWNrIHNoaW0pID09PT09XHJcbiAgICBjb25zdCBEYXRhQ29yZSA9ICgoKSA9PiB7XHJcbiAgICAgICAgY29uc3QgREMgPSB3aW5kb3cubHQ/LmNvcmU/LmRhdGEgPz8gd2luZG93Lmx0Py5kYXRhID8/IG51bGw7XHJcbiAgICAgICAgaWYgKERDPy5jcmVhdGVEYXRhQ29udGV4dCAmJiAoREM/LlJlcG9CYXNlIHx8IERDPy5SZXBvQmFzZT8udmFsdWUpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBjcmVhdGUobnMsIHNjb3BlS2V5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3R4ID0gREMuY3JlYXRlRGF0YUNvbnRleHQoeyBucywgc2NvcGVLZXksIHBlcnNpc3Q6ICdzZXNzaW9uJywgdHRsTXM6IDMwMDAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnbHQudGFiSWQnLCBjdHgudGFiSWQpOyB9IGNhdGNoIHsgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IG1ha2VSZXBvOiBjdHgubWFrZVJlcG8sIHNjb3BlS2V5LCB0YWJJZDogY3R4LnRhYklkIH07XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgUmVwb0Jhc2U6IERDLlJlcG9CYXNlPy52YWx1ZSA/PyBEQy5SZXBvQmFzZVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBTZXNzaW9uLWJhY2tlZCBzaGltIChzdHJ1Y3R1cmUgbWlycm9ycyBsdC5jb3JlLmRhdGEpXHJcbiAgICAgICAgY29uc3QgZ2V0VGFiSWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBpZCA9IHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oJ2x0LnRhYklkJyk7XHJcbiAgICAgICAgICAgIGlmICghaWQpIHsgaWQgPSAoY3J5cHRvPy5yYW5kb21VVUlEPy4oKSB8fCBgJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCl9YCk7IHNlc3Npb25TdG9yYWdlLnNldEl0ZW0oJ2x0LnRhYklkJywgaWQpOyB9XHJcbiAgICAgICAgICAgIHJldHVybiBpZDtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGNsYXNzIFNlc3Npb25TdG9yZSB7IGdldChrKSB7IGNvbnN0IHYgPSBzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKGspOyByZXR1cm4gdiA/IEpTT04ucGFyc2UodikgOiBudWxsOyB9IHNldChrLCB2KSB7IHNlc3Npb25TdG9yYWdlLnNldEl0ZW0oaywgSlNPTi5zdHJpbmdpZnkodikpOyB9IGRlbChrKSB7IHNlc3Npb25TdG9yYWdlLnJlbW92ZUl0ZW0oayk7IH0gfVxyXG4gICAgICAgIGNsYXNzIENhY2hlIHsgY29uc3RydWN0b3IodHRsID0gMzAwMCkgeyB0aGlzLnR0bCA9IHR0bDsgdGhpcy5tID0gbmV3IE1hcCgpOyB9IGdldChrKSB7IGNvbnN0IGUgPSB0aGlzLm0uZ2V0KGspOyBpZiAoIWUpIHJldHVybiBudWxsOyBpZiAoRGF0ZS5ub3coKSA+IGUuZXhwaXJlcykgeyB0aGlzLm0uZGVsZXRlKGspOyByZXR1cm4gbnVsbDsgfSByZXR1cm4gZS52YWx1ZTsgfSBzZXQoaywgdikgeyB0aGlzLm0uc2V0KGssIHsgdmFsdWU6IHYsIGV4cGlyZXM6IERhdGUubm93KCkgKyB0aGlzLnR0bCB9KTsgfSBkZWwoaykgeyB0aGlzLm0uZGVsZXRlKGspOyB9IH1cclxuICAgICAgICBjbGFzcyBSZXBvQmFzZSB7XHJcbiAgICAgICAgICAgIGNvbnN0cnVjdG9yKHsgbnMsIGVudGl0eSwgc2NvcGVLZXkgfSkgeyBpZiAoIXNjb3BlS2V5KSB0aHJvdyBuZXcgRXJyb3IoYCR7ZW50aXR5fSByZXBvIHJlcXVpcmVzIHNjb3BlS2V5YCk7IE9iamVjdC5hc3NpZ24odGhpcywgeyBucywgZW50aXR5LCBzY29wZUtleSwgdGFiSWQ6IGdldFRhYklkKCksIHN0b3JlOiBuZXcgU2Vzc2lvblN0b3JlKCksIGNhY2hlOiBuZXcgQ2FjaGUoMzAwMCkgfSk7IH1cclxuICAgICAgICAgICAgayhpZCA9ICdjdXJyZW50JykgeyByZXR1cm4gYGx0OiR7dGhpcy5uc306dGFiOiR7dGhpcy50YWJJZH06c2NvcGU6JHt0aGlzLnNjb3BlS2V5fToke3RoaXMuZW50aXR5fToke2lkfWA7IH1cclxuICAgICAgICAgICAgZ2V0Q2FjaGVkKGlkKSB7IHJldHVybiB0aGlzLmNhY2hlLmdldCh0aGlzLmsoaWQpKTsgfVxyXG4gICAgICAgICAgICBzZXRDYWNoZWQoaWQsIHYpIHsgdGhpcy5jYWNoZS5zZXQodGhpcy5rKGlkKSwgdik7IH1cclxuICAgICAgICAgICAgYXN5bmMgcmVhZChpZCkgeyBjb25zdCBrID0gdGhpcy5rKGlkKTsgY29uc3QgYyA9IHRoaXMuZ2V0Q2FjaGVkKGlkKTsgaWYgKGMpIHJldHVybiBjOyBjb25zdCB2ID0gdGhpcy5zdG9yZS5nZXQoayk7IGlmICh2KSB0aGlzLnNldENhY2hlZChpZCwgdik7IHJldHVybiB2ID8/IG51bGw7IH1cclxuICAgICAgICAgICAgYXN5bmMgd3JpdGUoaWQsIHYpIHsgY29uc3QgayA9IHRoaXMuayhpZCk7IHRoaXMuc3RvcmUuc2V0KGssIHYpOyB0aGlzLnNldENhY2hlZChpZCwgdik7IHJldHVybiB2OyB9XHJcbiAgICAgICAgICAgIGFzeW5jIHJlbW92ZShpZCkgeyBjb25zdCBrID0gdGhpcy5rKGlkKTsgdGhpcy5zdG9yZS5kZWwoayk7IHRoaXMuY2FjaGUuZGVsKGspOyB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZShucywgc2NvcGVLZXkpIHsgY29uc3QgYmFzZSA9IHsgbnMsIHNjb3BlS2V5IH07IGNvbnN0IG1ha2VSZXBvID0gKEN0b3IpID0+IG5ldyBDdG9yKGJhc2UpOyByZXR1cm4geyBtYWtlUmVwbywgc2NvcGVLZXksIHRhYklkOiBnZXRUYWJJZCgpIH07IH1cclxuICAgICAgICByZXR1cm4geyBjcmVhdGUsIFJlcG9CYXNlIH07XHJcbiAgICB9KSgpO1xyXG5cclxuICAgIGNsYXNzIFF1b3RlUmVwbyBleHRlbmRzIERhdGFDb3JlLlJlcG9CYXNlIHtcclxuICAgICAgICBjb25zdHJ1Y3RvcihiYXNlKSB7IHN1cGVyKHsgLi4uYmFzZSwgZW50aXR5OiAnUXVvdGVIZWFkZXInIH0pOyB9XHJcbiAgICAgICAgYXN5bmMgZ2V0KCkgeyByZXR1cm4gYXdhaXQgdGhpcy5yZWFkKCdjdXJyZW50Jyk7IH1cclxuICAgICAgICBhc3luYyBzZXQodikgeyByZXR1cm4gYXdhaXQgdGhpcy53cml0ZSgnY3VycmVudCcsIHYpOyB9XHJcbiAgICAgICAgYXN5bmMgY2xlYXIoKSB7IHJldHVybiBhd2FpdCB0aGlzLnJlbW92ZSgnY3VycmVudCcpOyB9XHJcbiAgICAgICAgYXN5bmMgdXBkYXRlKHBhdGNoKSB7IGNvbnN0IGN1ciA9IChhd2FpdCB0aGlzLmdldCgpKSB8fCB7fTsgcmV0dXJuIGF3YWl0IHRoaXMuc2V0KHsgLi4uY3VyLCAuLi5wYXRjaCwgVXBkYXRlZF9BdDogRGF0ZS5ub3coKSB9KTsgfVxyXG4gICAgfVxyXG5cclxuICAgIGxldCBjdHggPSBudWxsLCBxdW90ZVJlcG8gPSBudWxsLCBsYXN0U2NvcGUgPSBudWxsLCByZWZyZXNoSW5GbGlnaHQgPSBmYWxzZTtcclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVSZXBvRm9yUXVvdGUocWspIHtcclxuICAgICAgICBpZiAoIXFrIHx8ICFOdW1iZXIuaXNGaW5pdGUocWspIHx8IHFrIDw9IDApIHJldHVybiBudWxsO1xyXG4gICAgICAgIGlmICghY3R4IHx8IGxhc3RTY29wZSAhPT0gcWspIHtcclxuICAgICAgICAgICAgY3R4ID0gRGF0YUNvcmUuY3JlYXRlKCdRVCcsIHFrKTtcclxuICAgICAgICAgICAgcXVvdGVSZXBvID0gY3R4Lm1ha2VSZXBvKFF1b3RlUmVwbyk7XHJcbiAgICAgICAgICAgIGxhc3RTY29wZSA9IHFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcXVvdGVSZXBvO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09IDQxOSByZS1hdXRoIHdyYXBwZXIgPT09PT1cclxuICAgIGFzeW5jIGZ1bmN0aW9uIHdpdGhGcmVzaEF1dGgocnVuKSB7XHJcbiAgICAgICAgdHJ5IHsgcmV0dXJuIGF3YWl0IHJ1bigpOyB9XHJcbiAgICAgICAgY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICBjb25zdCBzID0gZXJyPy5zdGF0dXMgfHwgKCgvKFxcYlxcZHszfVxcYikvLmV4ZWMoZXJyPy5tZXNzYWdlIHx8ICcnKSB8fCBbXSlbMV0pO1xyXG4gICAgICAgICAgICBpZiAoK3MgPT09IDQxOSkgeyB0cnkgeyBhd2FpdCB3aW5kb3cubHQ/LmNvcmU/LmF1dGg/LmdldEtleT8uKCk7IH0gY2F0Y2ggeyB9IHJldHVybiBhd2FpdCBydW4oKTsgfVxyXG4gICAgICAgICAgICB0aHJvdyBlcnI7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09IE1lcmdlIFFUMTAgZHJhZnQgXHUyMTkyIHBlci1xdW90ZSAob25jZSkgPT09PT1cclxuICAgIGFzeW5jIGZ1bmN0aW9uIG1lcmdlRHJhZnRJbnRvUXVvdGVPbmNlKHFrKSB7XHJcbiAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGRyYWZ0Q3R4ID0gRGF0YUNvcmUuY3JlYXRlKCdRVCcsICdkcmFmdCcpO1xyXG4gICAgICAgIGNvbnN0IGRyYWZ0UmVwbyA9IGRyYWZ0Q3R4Lm1ha2VSZXBvKFF1b3RlUmVwbyk7XHJcbiAgICAgICAgY29uc3QgZHJhZnQgPSBhd2FpdCBkcmFmdFJlcG8uZ2V0KCk7XHJcbiAgICAgICAgaWYgKCFkcmFmdCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnQgPSAoYXdhaXQgcXVvdGVSZXBvLmdldCgpKSB8fCB7fTtcclxuICAgICAgICBjb25zdCBwcm9tb3RlZEF0ID0gTnVtYmVyKGN1cnJlbnQuUHJvbW90ZWRfQXQgfHwgMCk7XHJcbiAgICAgICAgY29uc3QgZHJhZnRVcGRhdGVkID0gTnVtYmVyKGRyYWZ0LlVwZGF0ZWRfQXQgfHwgMCk7XHJcblxyXG4gICAgICAgIC8vIE5vcm1hbGl6ZSBmb3IgY29tcGFyZSAoYXZvaWQgbnVtYmVyIHZzIHN0cmluZyBtaXNtYXRjaGVzKVxyXG4gICAgICAgIGNvbnN0IGN1ckN1c3QgPSBTdHJpbmcoY3VycmVudC5DdXN0b21lcl9ObyA/PyAnJyk7XHJcbiAgICAgICAgY29uc3QgbmV3Q3VzdCA9IFN0cmluZyhkcmFmdC5DdXN0b21lcl9ObyA/PyAnJyk7XHJcblxyXG4gICAgICAgIGNvbnN0IG5lZWRzTWVyZ2UgPVxyXG4gICAgICAgICAgICAoZHJhZnRVcGRhdGVkID4gcHJvbW90ZWRBdCkgfHxcclxuICAgICAgICAgICAgKGN1ckN1c3QgIT09IG5ld0N1c3QpIHx8XHJcbiAgICAgICAgICAgIChjdXJyZW50LkNhdGFsb2dfS2V5ICE9PSBkcmFmdC5DYXRhbG9nX0tleSkgfHxcclxuICAgICAgICAgICAgKGN1cnJlbnQuQ2F0YWxvZ19Db2RlICE9PSBkcmFmdC5DYXRhbG9nX0NvZGUpO1xyXG5cclxuICAgICAgICBpZiAoIW5lZWRzTWVyZ2UpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgbWVyZ2VkID0ge1xyXG4gICAgICAgICAgICAuLi5jdXJyZW50LFxyXG4gICAgICAgICAgICBRdW90ZV9LZXk6IHFrLFxyXG4gICAgICAgICAgICBDdXN0b21lcl9ObzogZHJhZnQuQ3VzdG9tZXJfTm8gPz8gbnVsbCxcclxuICAgICAgICAgICAgQ2F0YWxvZ19LZXk6IGRyYWZ0LkNhdGFsb2dfS2V5ID8/IG51bGwsXHJcbiAgICAgICAgICAgIENhdGFsb2dfQ29kZTogZHJhZnQuQ2F0YWxvZ19Db2RlID8/IG51bGwsXHJcbiAgICAgICAgICAgIFByb21vdGVkX0Zyb206ICdkcmFmdCcsXHJcbiAgICAgICAgICAgIFByb21vdGVkX0F0OiBEYXRlLm5vdygpLFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGF3YWl0IHF1b3RlUmVwby5zZXQobWVyZ2VkKTtcclxuXHJcbiAgICAgICAgLy8gQ2xlYXIgdGhlIHBlcnNpc3RlbnQgXHUyMDFDZmV0Y2hlZCBvbmNlXHUyMDFEIGd1YXJkIHNvIHdlIHJlLWh5ZHJhdGUgaGVhZGVyIGZvciB0aGUgbmV3IGN1c3RvbWVyXHJcbiAgICAgICAgY29uc3QgbWVyZ2VkMiA9IHsgLi4ubWVyZ2VkIH07XHJcbiAgICAgICAgZGVsZXRlIG1lcmdlZDIuUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQ7XHJcbiAgICAgICAgYXdhaXQgcXVvdGVSZXBvLnNldChtZXJnZWQyKTtcclxuICAgICAgICBhd2FpdCBkcmFmdFJlcG8uY2xlYXIoKTtcclxuICAgICAgICBkbG9nKCdEcmFmdCBtZXJnZWQgYW5kIGNsZWFyZWQgKHJlLXByb21vdGUgaWYgbmV3ZXIvZGlmZmVyZW50KScsIHsgcWssIG1lcmdlZCB9KTtcclxuXHJcbiAgICAgICAgLy8gSWYgeW91IGFkb3B0ZWQgdGhlIGluLW1lbW9yeSBoZWFkZXIgZmV0Y2ggZ3VhcmQsIGNsZWFyIGl0IHNvIHdlIHJlLWh5ZHJhdGUuXHJcbiAgICAgICAgaWYgKHR5cGVvZiBmZXRjaGVkSGVhZGVyT25jZSAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgZmV0Y2hlZEhlYWRlck9uY2UuZGVsZXRlKGAke2N0eD8udGFiSWQgfHwgJ3NoaW0nfToke3FrfWApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcblxyXG4gICAgLy8gPT09PT0gRGF0YSBzb3VyY2VzID09PT09XHJcbiAgICBhc3luYyBmdW5jdGlvbiBmZXRjaEF0dGFjaG1lbnRDb3VudChxdW90ZUtleSkge1xyXG4gICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IHdpbmRvdy5sdC5jb3JlLnBsZXguZHNSb3dzKENGRy5EU19BVFRBQ0hNRU5UU19CWV9RVU9URSwge1xyXG4gICAgICAgICAgICBBdHRhY2htZW50X0dyb3VwX0tleTogQ0ZHLkFUVEFDSE1FTlRfR1JPVVBfS0VZLFxyXG4gICAgICAgICAgICBSZWNvcmRfS2V5X1ZhbHVlOiBTdHJpbmcocXVvdGVLZXkpXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHJvd3MpID8gcm93cy5sZW5ndGggOiAwO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gcXVvdGVIZWFkZXJHZXQocm93KSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgQ3VzdG9tZXJfQ29kZTogcm93Py5DdXN0b21lcl9Db2RlID8/IG51bGwsXHJcbiAgICAgICAgICAgIEN1c3RvbWVyX05hbWU6IHJvdz8uQ3VzdG9tZXJfTmFtZSA/PyBudWxsLFxyXG4gICAgICAgICAgICBDdXN0b21lcl9Obzogcm93Py5DdXN0b21lcl9ObyA/PyBudWxsLFxyXG4gICAgICAgICAgICBRdW90ZV9Obzogcm93Py5RdW90ZV9ObyA/PyBudWxsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGh5ZHJhdGVQYXJ0U3VtbWFyeU9uY2UocWspIHtcclxuICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgIGlmICghcXVvdGVSZXBvKSByZXR1cm47XHJcbiAgICAgICAgY29uc3Qgc25hcCA9IChhd2FpdCBxdW90ZVJlcG8uZ2V0KCkpIHx8IHt9O1xyXG4gICAgICAgIGlmIChzbmFwLlF1b3RlX0hlYWRlcl9GZXRjaGVkX0F0KSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHBsZXggPSAodHlwZW9mIGdldFBsZXhGYWNhZGUgPT09ICdmdW5jdGlvbicpID8gYXdhaXQgZ2V0UGxleEZhY2FkZSgpIDogd2luZG93Lmx0LmNvcmUucGxleDtcclxuICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhDRkcuRFNfUVVPVEVfSEVBREVSX0dFVCwgeyBRdW90ZV9LZXk6IFN0cmluZyhxaykgfSkpO1xyXG4gICAgICAgIGNvbnN0IGZpcnN0ID0gKEFycmF5LmlzQXJyYXkocm93cykgJiYgcm93cy5sZW5ndGgpID8gcXVvdGVIZWFkZXJHZXQocm93c1swXSkgOiBudWxsO1xyXG4gICAgICAgIGlmICghZmlyc3QpIHJldHVybjtcclxuXHJcbiAgICAgICAgYXdhaXQgcXVvdGVSZXBvLnVwZGF0ZSh7IFF1b3RlX0tleTogcWssIC4uLmZpcnN0LCBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogRGF0ZS5ub3coKSB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA9PT09PSBVSSBiYWRnZSA9PT09PVxyXG4gICAgY29uc3QgTElfSUQgPSAnbHQtYXR0YWNobWVudHMtYmFkZ2UnO1xyXG4gICAgY29uc3QgUElMTF9JRCA9ICdsdC1hdHRhY2gtcGlsbCc7XHJcblxyXG4gICAgZnVuY3Rpb24gZW5zdXJlQmFkZ2UoKSB7XHJcbiAgICAgICAgY29uc3QgYmFyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuQUNUSU9OX0JBUl9TRUwpO1xyXG4gICAgICAgIGlmICghYmFyIHx8IGJhci50YWdOYW1lICE9PSAnVUwnKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChMSV9JRCk7XHJcbiAgICAgICAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XHJcblxyXG4gICAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTsgbGkuaWQgPSBMSV9JRDtcclxuICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpOyBhLmhyZWYgPSAnamF2YXNjcmlwdDp2b2lkKDApJzsgYS50aXRsZSA9ICdSZWZyZXNoIGF0dGFjaG1lbnRzIChtYW51YWwpJztcclxuICAgICAgICBjb25zdCBwaWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpOyBwaWxsLmlkID0gUElMTF9JRDtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHBpbGwuc3R5bGUsIHsgZGlzcGxheTogJ2lubGluZS1ibG9jaycsIG1pbldpZHRoOiAnMThweCcsIHBhZGRpbmc6ICcycHggOHB4JywgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLCB0ZXh0QWxpZ246ICdjZW50ZXInLCBmb250V2VpZ2h0OiAnNjAwJyB9KTtcclxuXHJcbiAgICAgICAgYS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnQXR0YWNobWVudHMgJykpO1xyXG4gICAgICAgIGEuYXBwZW5kQ2hpbGQocGlsbCk7XHJcbiAgICAgICAgbGkuYXBwZW5kQ2hpbGQoYSk7XHJcbiAgICAgICAgYmFyLmFwcGVuZENoaWxkKGxpKTtcclxuXHJcbiAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSkpO1xyXG4gICAgICAgIHJldHVybiBsaTtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIHNldEJhZGdlQ291bnQobikge1xyXG4gICAgICAgIGNvbnN0IHBpbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChQSUxMX0lEKTtcclxuICAgICAgICBpZiAoIXBpbGwpIHJldHVybjtcclxuICAgICAgICBwaWxsLnRleHRDb250ZW50ID0gU3RyaW5nKG4gPz8gMCk7XHJcbiAgICAgICAgY29uc3QgaXNaZXJvID0gIW4gfHwgbiA9PT0gMDtcclxuICAgICAgICBwaWxsLnN0eWxlLmJhY2tncm91bmQgPSBpc1plcm8gPyAnI2U1ZTdlYicgOiAnIzEwYjk4MSc7XHJcbiAgICAgICAgcGlsbC5zdHlsZS5jb2xvciA9IGlzWmVybyA/ICcjMTExODI3JyA6ICcjZmZmJztcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBydW5PbmVSZWZyZXNoKG1hbnVhbCA9IGZhbHNlKSB7XHJcbiAgICAgICAgaWYgKHJlZnJlc2hJbkZsaWdodCkgcmV0dXJuO1xyXG4gICAgICAgIHJlZnJlc2hJbkZsaWdodCA9IHRydWU7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcclxuICAgICAgICAgICAgY29uc3QgcWsgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcclxuICAgICAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50KDApO1xyXG4gICAgICAgICAgICAgICAgaWYgKG1hbnVhbCkgd2luZG93LlRNVXRpbHM/LnRvYXN0Py4oJ1x1MjZBMFx1RkUwRiBRdW90ZSBLZXkgbm90IGZvdW5kJywgJ3dhcm4nLCAyMjAwKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gSWYgc2NvcGUgY2hhbmdlZCwgcGFpbnQgYW55IGV4aXN0aW5nIHNuYXBzaG90IGJlZm9yZSBmZXRjaGluZ1xyXG4gICAgICAgICAgICBpZiAoIWN0eCB8fCBsYXN0U2NvcGUgIT09IHFrKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzbmFwID0gYXdhaXQgcXVvdGVSZXBvLmdldCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChzbmFwPy5BdHRhY2htZW50X0NvdW50ICE9IG51bGwpIHNldEJhZGdlQ291bnQoTnVtYmVyKHNuYXAuQXR0YWNobWVudF9Db3VudCkpO1xyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gUHJvbW90ZSAmIGNsZWFyIGRyYWZ0IEJFRk9SRSBwZXItcXVvdGUgdXBkYXRlc1xyXG4gICAgICAgICAgICBhd2FpdCBtZXJnZURyYWZ0SW50b1F1b3RlT25jZShxayk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjb3VudCA9IGF3YWl0IGZldGNoQXR0YWNobWVudENvdW50KHFrKTtcclxuICAgICAgICAgICAgc2V0QmFkZ2VDb3VudChjb3VudCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHF1b3RlUmVwby51cGRhdGUoeyBRdW90ZV9LZXk6IHFrLCBBdHRhY2htZW50X0NvdW50OiBOdW1iZXIoY291bnQpIH0pO1xyXG5cclxuICAgICAgICAgICAgaWYgKG1hbnVhbCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb2sgPSBjb3VudCA+IDA7XHJcbiAgICAgICAgICAgICAgICB3aW5kb3cuVE1VdGlscz8udG9hc3Q/LihvayA/IGBcdTI3MDUgJHtjb3VudH0gYXR0YWNobWVudChzKWAgOiAnXHUyNkEwXHVGRTBGIE5vIGF0dGFjaG1lbnRzJywgb2sgPyAnc3VjY2VzcycgOiAnd2FybicsIDIwMDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGRsb2coJ3JlZnJlc2gnLCB7IHFrLCBjb3VudCB9KTtcclxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgZGVycigncmVmcmVzaCBmYWlsZWQnLCBlcnIpO1xyXG4gICAgICAgICAgICB3aW5kb3cuVE1VdGlscz8udG9hc3Q/LihgXHUyNzRDIEF0dGFjaG1lbnRzIHJlZnJlc2ggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCwgJ2Vycm9yJywgNDAwMCk7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgcmVmcmVzaEluRmxpZ2h0ID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09IFNQQSB3aXJpbmcgPT09PT1cclxuICAgIGxldCBib290ZWQgPSBmYWxzZTsgbGV0IG9mZlVybCA9IG51bGw7XHJcbiAgICBmdW5jdGlvbiB3aXJlTmF2KGhhbmRsZXIpIHsgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oaGFuZGxlcik7IH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBpbml0KCkge1xyXG4gICAgICAgIGlmIChib290ZWQpIHJldHVybjtcclxuICAgICAgICBib290ZWQgPSB0cnVlO1xyXG4gICAgICAgIGF3YWl0IHJhZigpO1xyXG5cclxuICAgICAgICBjb25zdCBsaSA9IGVuc3VyZUJhZGdlKCk7XHJcbiAgICAgICAgaWYgKCFsaSkgcmV0dXJuO1xyXG4gICAgICAgIHN0YXJ0V2l6YXJkUGFnZU9ic2VydmVyKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNob3cgPSBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpO1xyXG4gICAgICAgIGxpLnN0eWxlLmRpc3BsYXkgPSBzaG93ID8gJycgOiAnbm9uZSc7XHJcblxyXG4gICAgICAgIGlmIChzaG93KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVdpemFyZFZNKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHFrID0gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCk7XHJcbiAgICAgICAgICAgIGlmIChxayAmJiBOdW1iZXIuaXNGaW5pdGUocWspICYmIHFrID4gMCkge1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IG1lcmdlRHJhZnRJbnRvUXVvdGVPbmNlKHFrKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHJ1bk9uZVJlZnJlc2goZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgdHJ5IHsgYXdhaXQgaHlkcmF0ZVBhcnRTdW1tYXJ5T25jZShxayk7IH0gY2F0Y2ggKGUpIHsgY29uc29sZS5lcnJvcignUVQzNSBoeWRyYXRlIGZhaWxlZCcsIGUpOyB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZGxvZygnaW5pdGlhbGl6ZWQnKTtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIHRlYXJkb3duKCkge1xyXG4gICAgICAgIGJvb3RlZCA9IGZhbHNlO1xyXG4gICAgICAgIG9mZlVybD8uKCk7XHJcbiAgICAgICAgb2ZmVXJsID0gbnVsbDtcclxuICAgICAgICBzdG9wV2l6YXJkUGFnZU9ic2VydmVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgaW5pdCgpO1xyXG5cclxuICAgIC8vIFBsYWNlIG5lYXIgb3RoZXIgbW9kdWxlLWxldmVsIGxldHNcclxuICAgIGxldCBsYXN0V2l6YXJkUGFnZSA9IG51bGw7XHJcbiAgICBsZXQgcGFnZU9ic2VydmVyID0gbnVsbDtcclxuXHJcbiAgICBmdW5jdGlvbiBzdGFydFdpemFyZFBhZ2VPYnNlcnZlcigpIHtcclxuICAgICAgICBjb25zdCByb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkJykgfHwgZG9jdW1lbnQuYm9keTtcclxuICAgICAgICBsYXN0V2l6YXJkUGFnZSA9IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCk7XHJcbiAgICAgICAgcGFnZU9ic2VydmVyPy5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgcGFnZU9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBuYW1lID0gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKTtcclxuICAgICAgICAgICAgaWYgKG5hbWUgIT09IGxhc3RXaXphcmRQYWdlKSB7XHJcbiAgICAgICAgICAgICAgICBsYXN0V2l6YXJkUGFnZSA9IG5hbWU7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXNPblRhcmdldFdpemFyZFBhZ2UoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHF1ZXVlTWljcm90YXNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcWsgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHFrICYmIE51bWJlci5pc0Zpbml0ZShxaykgJiYgcWsgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgbWVyZ2VEcmFmdEludG9RdW90ZU9uY2UocWspO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgcnVuT25lUmVmcmVzaChmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkgeyBhd2FpdCBoeWRyYXRlUGFydFN1bW1hcnlPbmNlKHFrKTsgfSBjYXRjaCB7IH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcGFnZU9ic2VydmVyLm9ic2VydmUocm9vdCwgeyBhdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZUZpbHRlcjogWydjbGFzcycsICdhcmlhLWN1cnJlbnQnXSB9KTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBzdG9wV2l6YXJkUGFnZU9ic2VydmVyKCkge1xyXG4gICAgICAgIHBhZ2VPYnNlcnZlcj8uZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIHBhZ2VPYnNlcnZlciA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgd2lyZU5hdigoKSA9PiB7IGlmICh3aW5kb3cuVE1VdGlscz8ubWF0Y2hSb3V0ZT8uKFJPVVRFUykpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcclxufSkoKTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsR0FBQyxNQUFNO0FBQ0g7QUFFQSxVQUFNLE1BQU8sT0FBd0MsT0FBZ0I7QUFDckUsVUFBTSxPQUFPLElB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QUFNLGVBQWU7QUFDckIsY0FBTSxLQUFLLHlCQUF5QjtBQUNwQyxZQUFJLE1BQU0sT0FBTyxTQUFTLEVBQUUsS0FBSyxLQUFLLEdBQUc7QUFDckMsZ0JBQU0sbUJBQW1CLEVBQUU7QUFDM0IsZ0JBQU0sd0JBQXdCLEVBQUU7QUFDaEMsZ0JBQU0sY0FBYyxLQUFLO0FBQ3pCLGNBQUk7QUFBRSxrQkFBTSx1QkFBdUIsRUFBRTtBQUFBLFVBQUcsU0FBUyxHQUFHO0FBQUUsb0JBQVEsTUFBTSx1QkFBdUIsQ0FBQztBQUFBLFVBQUc7QUFBQSxRQUNuRztBQUFBLE1BQ0o7QUFDQSxXQUFLLGFBQWE7QUFBQSxJQUN0QjtBQUNBLGFBQVMsV0FBVztBQUNoQixlQUFTO0FBQ1QsZUFBUztBQUNULGVBQVM7QUFDVCw2QkFBdUI7QUFBQSxJQUMzQjtBQUVBLFNBQUs7QUFHTCxRQUFJLGlCQUFpQjtBQUNyQixRQUFJLGVBQWU7QUFFbkIsYUFBUywwQkFBMEI7QUFDL0IsWUFBTSxPQUFPLFNBQVMsY0FBYyxjQUFjLEtBQUssU0FBUztBQUNoRSx1QkFBaUIsd0JBQXdCO0FBQ3pDLG9CQUFjLFdBQVc7QUFDekIscUJBQWUsSUFBSSxpQkFBaUIsTUFBTTtBQUN0QyxjQUFNLE9BQU8sd0JBQXdCO0FBQ3JDLFlBQUksU0FBUyxnQkFBZ0I7QUFDekIsMkJBQWlCO0FBQ2pCLGNBQUkscUJBQXFCLEdBQUc7QUFDeEIsMkJBQWUsWUFBWTtBQUN2QixvQkFBTSxLQUFLLHlCQUF5QjtBQUNwQyxrQkFBSSxNQUFNLE9BQU8sU0FBUyxFQUFFLEtBQUssS0FBSyxHQUFHO0FBQ3JDLHNCQUFNLG1CQUFtQixFQUFFO0FBQzNCLHNCQUFNLHdCQUF3QixFQUFFO0FBQ2hDLHNCQUFNLGNBQWMsS0FBSztBQUN6QixvQkFBSTtBQUFFLHdCQUFNLHVCQUF1QixFQUFFO0FBQUEsZ0JBQUcsUUFBUTtBQUFBLGdCQUFFO0FBQUEsY0FDdEQ7QUFBQSxZQUNKLENBQUM7QUFBQSxVQUNMO0FBQUEsUUFDSjtBQUFBLE1BQ0osQ0FBQztBQUNELG1CQUFhLFFBQVEsTUFBTSxFQUFFLFlBQVksTUFBTSxXQUFXLE1BQU0sU0FBUyxNQUFNLGlCQUFpQixDQUFDLFNBQVMsY0FBYyxFQUFFLENBQUM7QUFBQSxJQUMvSDtBQUVBLGFBQVMseUJBQXlCO0FBQzlCLG9CQUFjLFdBQVc7QUFDekIscUJBQWU7QUFBQSxJQUNuQjtBQUVBLFlBQVEsTUFBTTtBQUFFLFVBQUksT0FBTyxTQUFTLGFBQWEsTUFBTSxFQUFHLE1BQUs7QUFBQSxVQUFRLFVBQVM7QUFBQSxJQUFHLENBQUM7QUFBQSxFQUN4RixHQUFHOyIsCiAgIm5hbWVzIjogWyJjdHgiXQp9Cg==
