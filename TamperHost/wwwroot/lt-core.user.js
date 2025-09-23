(() => {
  // src/shared/lt-core.user.js
  (() => {
    const ROOT = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const LT = ROOT.lt = ROOT.lt || {};
    const core = LT.core = LT.core || {};
    core.auth = core.auth || {
      /**
       * Try PlexAuth first, then PlexAPI; return bearer token string or null.
       */
      async getKey() {
        try {
          if (ROOT.PlexAuth?.getKey) return await ROOT.PlexAuth.getKey();
          if (ROOT.PlexAPI?.getKey) return await ROOT.PlexAPI.getKey();
        } catch {
        }
        return null;
      },
      /**
       * Run a function after ensuring we have an auth key.
       * If a refresh hook exists we’ll attempt it once.
       */
      async withFreshAuth(fn) {
        let key = await core.auth.getKey();
        if (!key) {
          try {
            if (ROOT.PlexAuth?.refresh) {
              await ROOT.PlexAuth.refresh();
              key = await core.auth.getKey();
            } else if (ROOT.PlexAPI?.refresh) {
              await ROOT.PlexAPI.refresh();
              key = await core.auth.getKey();
            }
          } catch {
          }
        }
        return fn(key || void 0);
      }
    };
    core.http = core.http || {
      async fetch(url, { method = "GET", headers = {}, body, timeoutMs = 15e3, useXHR = false } = {}) {
        if (ROOT.TMUtils?.fetchData) {
          return await ROOT.TMUtils.fetchData(url, { method, headers, body, timeoutMs, useXHR });
        }
        const key = await core.auth.getKey();
        const h = new Headers(headers || {});
        if (key && !h.has("Authorization")) h.set("Authorization", `Bearer ${key}`);
        if (body && !h.has("Content-Type")) h.set("Content-Type", "application/json");
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method,
            headers: h,
            body: body && typeof body !== "string" ? JSON.stringify(body) : body,
            signal: ctl.signal,
            credentials: "include"
          });
          const ct = res.headers.get("content-type") || "";
          const data = ct.includes("application/json") ? await res.json() : await res.text();
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          return data;
        } finally {
          clearTimeout(t);
        }
      },
      async get(url, opts = {}) {
        return this.fetch(url, { ...opts || {}, method: "GET" });
      },
      async post(url, body, opts = {}) {
        return this.fetch(url, { ...opts || {}, method: "POST", body });
      }
    };
    core.plex = core.plex || {
      async ds(sourceId, payload = {}, opts = {}) {
        if (ROOT.TMUtils?.ds) return await ROOT.TMUtils.ds(sourceId, payload, opts);
        const base = location.origin.replace(/\/$/, "");
        const url = `${base}/api/datasources/${sourceId}/execute?format=2`;
        const json = await core.http.post(url, payload, opts);
        const rows = Array.isArray(json?.rows) ? json.rows : [];
        return { ...json, rows };
      },
      async dsRows(sourceId, payload = {}, opts = {}) {
        if (ROOT.TMUtils?.dsRows) return await ROOT.TMUtils.dsRows(sourceId, payload, opts);
        const { rows } = await this.ds(sourceId, payload, opts);
        return rows;
      }
    };
    core.hub = core.hub || (() => {
      const fallback = (() => {
        const api = {};
        api._sticky = false;
        function ensurePill() {
          let pill = document.querySelector("#lt-hub-pill");
          if (!pill) {
            pill = document.createElement("div");
            pill.id = "lt-hub-pill";
            pill.style.cssText = `
                        position: fixed;
                        top: 10px; right: 10px;
                        z-index: 2147483000;
                        background: rgba(0,0,0,.8);
                        color: #fff;
                        font: 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
                        padding: 6px 10px; border-radius: 999px;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
                    `;
            pill.textContent = "\u2026";
            document.documentElement.appendChild(pill);
          }
          return pill;
        }
        api.setStatus = (text, tone = "info", { sticky = false } = {}) => {
          const el = ensurePill();
          el.textContent = text || "";
          api._sticky = !!sticky;
          if (!api._sticky) setTimeout(() => {
            try {
              el.remove();
            } catch {
            }
          }, 2e3);
          return api;
        };
        api.notify = (_level, text, { ms = 2500 } = {}) => {
          const el = ensurePill();
          el.textContent = text || "";
          setTimeout(() => {
            try {
              el.remove();
            } catch {
            }
          }, Math.max(500, ms | 0));
          return api;
        };
        api.toast = (msg, ms = 3e3) => api.notify("info", msg, { ms });
        return api;
      })();
      let mounted = false;
      let mounting = null;
      const queue = [];
      async function mountUiHubOnce() {
        if (mounted) return true;
        if (mounting) return mounting;
        mounting = (async () => {
          try {
            const ensureFn = typeof ensureLTHub === "function" ? ensureLTHub : typeof ROOT.ensureLTHub === "function" ? ROOT.ensureLTHub : null;
            if (ensureFn) {
              await ensureFn({
                theme: { name: "OneMonroe" },
                // default to body; honor any earlier selection
                mount: ROOT.__LT_HUB_MOUNT || "nav",
                pageRootSelectors: [
                  "#plexSidetabsMenuPage",
                  ".plex-sidetabs-menu-page",
                  ".plex-sidetabs-menu-page-content",
                  ".plex-sidetabs-menu-page-content-container",
                  ".plex-actions-wrapper"
                ],
                // when living in the navbar we never want to alter page layout
                stick: false,
                gap: 8
              });
            }
            const hubObj = typeof ltUIHub !== "undefined" ? ltUIHub : ROOT.ltUIHub;
            mounted = !!hubObj;
            return mounted;
          } catch {
            mounted = false;
            return false;
          } finally {
            const hub = mounted ? ROOT.ltUIHub : null;
            for (const { fn, args } of queue.splice(0)) {
              try {
                if (hub && typeof hub[fn] === "function") hub[fn](...args);
                else fallback[fn](...args);
              } catch {
              }
            }
          }
        })();
        return mounting;
      }
      function delegateOrQueue(fn, ...args) {
        const hubNow = mounted ? typeof ltUIHub !== "undefined" ? ltUIHub : ROOT.ltUIHub : null;
        if (hubNow && typeof hubNow[fn] === "function") {
          try {
            hubNow[fn](...args);
          } catch {
          }
          return;
        }
        if (typeof ensureLTHub === "function" || typeof ROOT.ensureLTHub === "function") {
          queue.push({ fn, args });
          mountUiHubOnce();
          return;
        }
        fallback[fn](...args);
      }
      return {
        setStatus(text, tone = "info", opts = {}) {
          delegateOrQueue("setStatus", text, tone, opts);
          return this;
        },
        notify(text, tone = "info", opts = {}) {
          const ms = opts?.timeout ?? opts?.ms ?? 2500;
          delegateOrQueue("notify", tone, text, { ms, sticky: !!opts?.sticky, toast: !!opts?.toast });
          if (!mounted && typeof ROOT.ensureLTHub !== "function") fallback.notify(text, tone, opts);
          return this;
        },
        toast(msg, timeout = 3e3) {
          delegateOrQueue("notify", "info", msg, { ms: timeout, toast: true });
          if (!mounted && typeof ROOT.ensureLTHub !== "function") fallback.toast(msg, timeout);
          return this;
        },
        updateButton(id, patch = {}) {
          delegateOrQueue("updateButton", id, patch);
          return this;
        },
        beginTask(label, tone = "info") {
          if (mounted && ROOT.ltUIHub?.beginTask) return ROOT.ltUIHub.beginTask(label, tone);
          this.setStatus(label, tone, { sticky: true });
          const ctl = {
            update: (txt, t = tone) => {
              this.setStatus(txt, t, { sticky: true });
              return ctl;
            },
            success: (msg = "Done", ms = 2500) => {
              this.setStatus("", "info", { sticky: false });
              this.notify(msg, "success", { timeout: ms });
              return ctl;
            },
            error: (msg = "Failed") => {
              this.setStatus("", "info", { sticky: false });
              this.notify(msg, "error", { timeout: 3500 });
              return ctl;
            },
            clear: () => {
              this.setStatus("", "info", { sticky: false });
              return ctl;
            },
            done: (msg, ms) => ctl.success(msg, ms)
          };
          mountUiHubOnce().then(() => {
            const hubNow = typeof ltUIHub !== "undefined" ? ltUIHub : ROOT.ltUIHub;
            if (hubNow?.beginTask) {
              try {
                hubNow.beginTask(label, tone);
              } catch {
              }
            }
          });
          return ctl;
        }
      };
    })();
    core.theme = core.theme || {
      apply() {
        try {
          const css = typeof GM_getResourceText === "function" ? GM_getResourceText("THEME_CSS") : "";
          if (css && typeof GM_addStyle === "function") GM_addStyle(css);
        } catch (e) {
          try {
            console.warn("[lt-core] theme.apply failed", e);
          } catch {
          }
        }
      }
    };
    core.util = core.util || {
      sleep(ms) {
        return new Promise((r) => setTimeout(r, Math.max(0, ms | 0)));
      },
      /**
       * Run a function only once per key (per page load).
       */
      once(key, fn) {
        const store = core.__once = core.__once || /* @__PURE__ */ new Set();
        if (store.has(key)) return void 0;
        store.add(key);
        return fn();
      }
    };
    core.qt = core.qt || /* @__PURE__ */ (() => {
      const ROOT2 = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      function getTabScopeId(ns = "QT") {
        try {
          if (typeof ROOT2.getTabScopeId === "function") return ROOT2.getTabScopeId(ns);
        } catch {
        }
        try {
          const storage = ROOT2.sessionStorage;
          const K = `lt:${ns}:__scopeId`;
          let v = storage.getItem(K);
          if (!v) {
            v = String(Math.floor(Math.random() * 2147483647));
            storage.setItem(K, v);
          }
          const n = Number(v);
          if (!Number.isFinite(n) || n <= 0) throw new Error("bad scope");
          return n;
        } catch {
          const key = "__LT_QT_SCOPE_ID__";
          if (!ROOT2[key]) ROOT2[key] = Math.floor(Math.random() * 2147483647);
          return ROOT2[key];
        }
      }
      function getQTF() {
        const make = ROOT2.lt?.core?.data?.makeFlatScopedRepo;
        return typeof make === "function" ? make({ ns: "QT", entity: "quote", legacyEntity: "QuoteHeader" }) : null;
      }
      async function useDraftRepo() {
        const QTF = getQTF();
        if (!QTF) return null;
        const { repo } = QTF.use(getTabScopeId("QT"));
        return repo || null;
      }
      async function useQuoteRepo(qk) {
        const QTF = getQTF();
        if (!QTF || !qk || !Number.isFinite(qk) || qk <= 0) return null;
        const { repo } = QTF.use(Number(qk));
        return repo || null;
      }
      function needsMerge(current = {}, draft = {}) {
        const curUpd = Number(current.Updated_At ?? 0);
        const dUpd = Number(draft?.Updated_At ?? 0);
        const curCust = String(current.Customer_No ?? "");
        const newCust = String(draft?.Customer_No ?? "");
        const keyChanged = String(current.Catalog_Key ?? "") !== String(draft?.Catalog_Key ?? "");
        const codeChanged = String(current.Catalog_Code ?? "") !== String(draft?.Catalog_Code ?? "");
        return dUpd > curUpd || keyChanged || codeChanged || curCust !== newCust;
      }
      async function mergeOnce(qk) {
        const draftRepo = await useDraftRepo();
        if (!draftRepo) return "no-dc";
        let draft = await draftRepo.getHeader?.() || await draftRepo.get?.();
        if (!draft || !Object.keys(draft).length) {
          try {
            const { repo: legacy } = getQTF().use("draft");
            const legacyDraft = await legacy.getHeader?.() || await legacy.get?.();
            if (legacyDraft && Object.keys(legacyDraft).length) {
              await draftRepo.patchHeader?.(legacyDraft);
              draft = legacyDraft;
            }
          } catch {
          }
        }
        if (!draft || !Object.keys(draft).length) return "no-draft";
        const quoteRepo = await useQuoteRepo(qk);
        if (!quoteRepo) return "no-quote";
        const current = await quoteRepo.getHeader?.() || {};
        if (!needsMerge(current, draft)) return "noop";
        await quoteRepo.patchHeader?.({
          ...draft,
          Quote_Key: Number(qk),
          Quote_Header_Fetched_At: Date.now(),
          Promoted_From: "draft",
          Promoted_At: Date.now()
        });
        try {
          await draftRepo.clear?.();
        } catch {
        }
        try {
          const { repo: legacy } = getQTF().use("draft");
          await legacy.clear?.();
        } catch {
        }
        return "merged";
      }
      const RETRY = { timer: null, tries: 0, max: 20, ms: 250 };
      function stopRetry() {
        if (RETRY.timer) clearInterval(RETRY.timer);
        RETRY.timer = null;
        RETRY.tries = 0;
      }
      function promoteDraftToQuote({ qk, strategy = "once" } = {}) {
        if (strategy === "retry") {
          stopRetry();
          RETRY.timer = setInterval(async () => {
            RETRY.tries++;
            const res = await mergeOnce(qk);
            if (res === "merged" || RETRY.tries >= RETRY.max) stopRetry();
          }, RETRY.ms);
          return;
        }
        return mergeOnce(qk);
      }
      function getNumber(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      }
      function fromUrl() {
        try {
          const u = new URL(location.href);
          return { quoteKey: getNumber(u.searchParams.get("QuoteKey") || u.searchParams.get("quoteKey")) };
        } catch {
          return { quoteKey: 0 };
        }
      }
      function fromDom() {
        const el = document.querySelector('[data-quote-key],#QuoteKey,[name="QuoteKey"]');
        const qk = el ? getNumber(el.getAttribute("data-quote-key") ?? el.value) : 0;
        const pn = (document.querySelector(".wizard-steps .active, .wizard .active, .plex-sidetabs .active")?.textContent || document.querySelector(".page-title, .content-header h1, .plex-navbar-title")?.textContent || document.querySelector('[aria-current="page"]')?.textContent || "").trim();
        return { quoteKey: qk, pageName: pn };
      }
      function fromKo() {
        try {
          const koRoot = window.ko && typeof window.ko.dataFor === "function" ? window.ko.dataFor(document.body) : null;
          const qk = getNumber(koRoot?.QuoteKey ?? koRoot?.quoteKey ?? koRoot?.Quote?.QuoteKey) || 0;
          const pn = String(koRoot?.CurrentPageName ?? koRoot?.currentPageName ?? koRoot?.Wizard?.CurrentPageName ?? "").trim();
          return { quoteKey: qk, pageName: pn };
        } catch {
          return { quoteKey: 0, pageName: "" };
        }
      }
      function coalesce() {
        const a = fromKo(), b = fromDom(), c = fromUrl();
        const quoteKey = a.quoteKey || b.quoteKey || c.quoteKey || 0;
        const pageName = (a.pageName || b.pageName || document.title || "").replace(/\s+/g, " ").trim();
        const isOnPartSummary = (() => {
          try {
            const hasPSForm = !!document.querySelector('#QuotePartSummaryForm,[id^="QuotePartSummaryForm_"]');
            if (hasPSForm) return true;
            const active = document.querySelector(".plex-wizard-page-list .plex-wizard-page.active");
            if (active && active.textContent && active.textContent.trim().toLowerCase() === "part summary")
              return true;
          } catch {
          }
          return /part\s*summary/i.test(pageName) || /part(?:%20|\s|-)?summary|summary(?:%20|\s|-)?part/i.test(location.href);
        })();
        return { quoteKey, pageName, isOnPartSummary };
      }
      function getQuoteContext() {
        const { quoteKey, pageName, isOnPartSummary } = coalesce();
        return { quoteKey, pageName, isOnPartSummary, hasQuoteKey: quoteKey > 0, isPage: (n) => new RegExp(String(n).replace(/\s+/g, "\\s*"), "i").test(pageName) };
      }
      async function getHub(opts = { mount: "nav" }) {
        const R = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
        for (let i = 0; i < 50; i++) {
          const ensure = R.ensureLTHub || window.ensureLTHub;
          if (typeof ensure === "function") {
            try {
              await ensure(opts);
              const hubNow2 = typeof ltUIHub !== "undefined" ? ltUIHub : R.ltUIHub;
              if (hubNow2) return hubNow2;
            } catch {
            }
          }
          const hubNow = typeof ltUIHub !== "undefined" ? ltUIHub : R.ltUIHub;
          if (hubNow) return hubNow;
          await new Promise((r) => setTimeout(r, 100));
        }
        return { __fallback: true };
      }
      async function ensureHubButton({
        id,
        label,
        title,
        side = "left",
        weight = 120,
        onClick,
        showWhen,
        force = false,
        mount = "nav"
      } = {}) {
        const hub = await getHub({ mount });
        const usingUiHub = !!(hub && !hub.__fallback && typeof hub.registerButton === "function");
        const shouldShowNow = () => {
          try {
            const ctx = getQuoteContext();
            return !!(force || (typeof showWhen === "function" ? showWhen(ctx) : true));
          } catch {
            return !!force;
          }
        };
        if (usingUiHub) {
          let listIds2 = function() {
            try {
              const v = hub.list?.();
              if (!Array.isArray(v)) return [];
              return v.map((x) => x && typeof x === "object" ? x.id : x).filter(Boolean);
            } catch {
              return [];
            }
          }, isPresent2 = function() {
            try {
              if (typeof hub.has === "function") return !!hub.has(id);
              return listIds2().includes(id);
            } catch {
              return false;
            }
          }, ensureReg2 = function() {
            if (isPresent2()) return false;
            return register();
          };
          var listIds = listIds2, isPresent = isPresent2, ensureReg = ensureReg2;
          async function register() {
            const def = { id, label, title, weight, onClick };
            try {
              hub.registerButton?.(side, def);
            } catch {
            }
            await 0;
            if (!isPresent2()) {
              try {
                hub.registerButton?.({ ...def, section: side });
              } catch {
              }
            }
            await 0;
            if (!isPresent2()) {
              try {
                hub.registerButton({ ...def, section: side });
              } catch {
              }
            }
            await 0;
            if (!isPresent2()) {
              try {
                hub.registerButton(side, def);
              } catch {
              }
            }
            return isPresent2();
          }
          ensureReg2();
          async function reconcile() {
            try {
              const show = shouldShowNow();
              const present = isPresent2();
              if (show) {
                if (!present) ensureReg2();
                return true;
              }
              if (present) hub.remove?.(id);
              return false;
            } catch {
              return false;
            }
          }
          ensureHubButton.__state = ensureHubButton.__state || {};
          const state2 = ensureHubButton.__state[id] ||= { obs: null, offUrl: null };
          await reconcile();
          if (!state2.obs) {
            const root = document.querySelector(".plex-wizard-page-list") || document.body;
            if (root && window.MutationObserver) {
              state2.obs = new MutationObserver(() => {
                reconcile();
              });
              state2.obs.observe(root, { subtree: true, attributes: true, childList: true });
            }
          }
          if (!state2.offUrl && window.TMUtils?.onUrlChange) {
            state2.offUrl = window.TMUtils.onUrlChange(() => {
              reconcile();
            });
          }
          return true;
        }
        const domId = `lt-navbtn-${id}`;
        function navRight() {
          return document.querySelector("#navBar .navbar-right") || document.querySelector(".plex-navbar-container .navbar-right") || document.querySelector(".navbar-right") || document.getElementById("navBar") || document.body;
        }
        function ensureDom() {
          const host = navRight();
          if (!host) return null;
          let btn = document.getElementById(domId);
          if (!btn) {
            btn = document.createElement("button");
            btn.id = domId;
            btn.type = "button";
            btn.className = "btn btn-primary";
            btn.title = title || "";
            btn.textContent = label || id;
            btn.style.marginLeft = "8px";
            btn.addEventListener("click", (ev) => {
              try {
                onClick?.(ev);
              } catch {
              }
            });
            host.appendChild(btn);
          }
          return btn;
        }
        function removeDom() {
          const n = document.getElementById(domId);
          if (n) try {
            n.remove();
          } catch {
          }
        }
        async function reconcileDom() {
          const show = shouldShowNow();
          if (show) ensureDom();
          else removeDom();
        }
        ensureHubButton.__state = ensureHubButton.__state || {};
        const state = ensureHubButton.__state[id] ||= { obs: null, offUrl: null };
        await reconcileDom();
        if (!state.obs) {
          const root = document.querySelector(".plex-wizard-page-list") || document.body;
          if (root && window.MutationObserver) {
            state.obs = new MutationObserver(() => {
              reconcileDom();
            });
            state.obs.observe(root, { subtree: true, attributes: true, childList: true });
          }
        }
        if (!state.offUrl && window.TMUtils?.onUrlChange) {
          state.offUrl = window.TMUtils.onUrlChange(() => {
            reconcileDom();
          });
        }
        return true;
      }
      return { promoteDraftToQuote, stopRetry, useDraftRepo, useQuoteRepo, getQuoteContext, getHub, ensureHubButton };
    })();
    try {
      core.theme.apply();
    } catch {
    }
  })();
})();
;(function(g){try{if(typeof LTCore!=='undefined'){g.LTCore=LTCore;}}catch(e){}})(typeof unsafeWindow!=='undefined'?unsafeWindow:window);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LWNvcmUudXNlci5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gPT1Vc2VyU2NyaXB0PT1cbi8vIEBuYW1lICAgICAgICAgbHQtY29yZVxuLy8gQG5hbWVzcGFjZSAgICBsdFxuLy8gQHZlcnNpb24gICAgICAzLjguMzdcbi8vIEBkZXNjcmlwdGlvbiAgU2hhcmVkIGNvcmU6IGF1dGggKyBodHRwICsgcGxleCBEUyArIGh1YiAoc3RhdHVzL3RvYXN0KSArIHRoZW1lIGJyaWRnZSArIHRpbnkgdXRpbHNcbi8vIEBydW4tYXQgICAgICAgZG9jdW1lbnQtc3RhcnRcbi8vIEBncmFudCAgICAgICAgbm9uZVxuLy8gPT0vVXNlclNjcmlwdD09XG5cbigoKSA9PiB7XG4gICAgLy8gUHJlZmVyIHRoZSBwYWdlIGNvbnRleHQgaWYgYXZhaWxhYmxlIChzbyBnbG9iYWxzIGFyZSBzaGFyZWQgd2l0aCB0aGUgYXBwKVxuICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xuICAgIGNvbnN0IExUID0gKFJPT1QubHQgPSBST09ULmx0IHx8IHt9KTtcbiAgICBjb25zdCBjb3JlID0gKExULmNvcmUgPSBMVC5jb3JlIHx8IHt9KTtcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBBdXRoIChmcm9tIHlvdXIgcGxleC1hdXRoKVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBjb3JlLmF1dGggPSBjb3JlLmF1dGggfHwge1xuICAgICAgICAvKipcbiAgICAgICAgICogVHJ5IFBsZXhBdXRoIGZpcnN0LCB0aGVuIFBsZXhBUEk7IHJldHVybiBiZWFyZXIgdG9rZW4gc3RyaW5nIG9yIG51bGwuXG4gICAgICAgICAqL1xuICAgICAgICBhc3luYyBnZXRLZXkoKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGlmIChST09ULlBsZXhBdXRoPy5nZXRLZXkpIHJldHVybiBhd2FpdCBST09ULlBsZXhBdXRoLmdldEtleSgpO1xuICAgICAgICAgICAgICAgIGlmIChST09ULlBsZXhBUEk/LmdldEtleSkgcmV0dXJuIGF3YWl0IFJPT1QuUGxleEFQSS5nZXRLZXkoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJ1biBhIGZ1bmN0aW9uIGFmdGVyIGVuc3VyaW5nIHdlIGhhdmUgYW4gYXV0aCBrZXkuXG4gICAgICAgICAqIElmIGEgcmVmcmVzaCBob29rIGV4aXN0cyB3ZVx1MjAxOWxsIGF0dGVtcHQgaXQgb25jZS5cbiAgICAgICAgICovXG4gICAgICAgIGFzeW5jIHdpdGhGcmVzaEF1dGgoZm4pIHtcbiAgICAgICAgICAgIGxldCBrZXkgPSBhd2FpdCBjb3JlLmF1dGguZ2V0S2V5KCk7XG4gICAgICAgICAgICBpZiAoIWtleSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChST09ULlBsZXhBdXRoPy5yZWZyZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBST09ULlBsZXhBdXRoLnJlZnJlc2goKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGF3YWl0IGNvcmUuYXV0aC5nZXRLZXkoKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChST09ULlBsZXhBUEk/LnJlZnJlc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IFJPT1QuUGxleEFQSS5yZWZyZXNoKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSBhd2FpdCBjb3JlLmF1dGguZ2V0S2V5KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmbihrZXkgfHwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gSFRUUFxuICAgIC8vIERlbGVnYXRlcyB0byBUTVV0aWxzLmZldGNoRGF0YSB3aGVuIGF2YWlsYWJsZTsgZmFsbHMgYmFjayB0byBmZXRjaCgpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUuaHR0cCA9IGNvcmUuaHR0cCB8fCB7XG4gICAgICAgIGFzeW5jIGZldGNoKHVybCwgeyBtZXRob2QgPSAnR0VUJywgaGVhZGVycyA9IHt9LCBib2R5LCB0aW1lb3V0TXMgPSAxNTAwMCwgdXNlWEhSID0gZmFsc2UgfSA9IHt9KSB7XG4gICAgICAgICAgICBpZiAoUk9PVC5UTVV0aWxzPy5mZXRjaERhdGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgUk9PVC5UTVV0aWxzLmZldGNoRGF0YSh1cmwsIHsgbWV0aG9kLCBoZWFkZXJzLCBib2R5LCB0aW1lb3V0TXMsIHVzZVhIUiB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IG5hdGl2ZSBmZXRjaCB3aXRoIEF1dGhvcml6YXRpb24gKGZyb20gcGxleC1hdXRoKVxuICAgICAgICAgICAgY29uc3Qga2V5ID0gYXdhaXQgY29yZS5hdXRoLmdldEtleSgpO1xuICAgICAgICAgICAgY29uc3QgaCA9IG5ldyBIZWFkZXJzKGhlYWRlcnMgfHwge30pO1xuICAgICAgICAgICAgaWYgKGtleSAmJiAhaC5oYXMoJ0F1dGhvcml6YXRpb24nKSkgaC5zZXQoJ0F1dGhvcml6YXRpb24nLCBgQmVhcmVyICR7a2V5fWApO1xuICAgICAgICAgICAgaWYgKGJvZHkgJiYgIWguaGFzKCdDb250ZW50LVR5cGUnKSkgaC5zZXQoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGN0bCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICAgICAgICAgIGNvbnN0IHQgPSBzZXRUaW1lb3V0KCgpID0+IGN0bC5hYm9ydCgpLCB0aW1lb3V0TXMpO1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHVybCwge1xuICAgICAgICAgICAgICAgICAgICBtZXRob2QsXG4gICAgICAgICAgICAgICAgICAgIGhlYWRlcnM6IGgsXG4gICAgICAgICAgICAgICAgICAgIGJvZHk6IGJvZHkgJiYgdHlwZW9mIGJvZHkgIT09ICdzdHJpbmcnID8gSlNPTi5zdHJpbmdpZnkoYm9keSkgOiBib2R5LFxuICAgICAgICAgICAgICAgICAgICBzaWduYWw6IGN0bC5zaWduYWwsXG4gICAgICAgICAgICAgICAgICAgIGNyZWRlbnRpYWxzOiAnaW5jbHVkZSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBjdCA9IHJlcy5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJykgfHwgJyc7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGN0LmluY2x1ZGVzKCdhcHBsaWNhdGlvbi9qc29uJykgPyBhd2FpdCByZXMuanNvbigpIDogYXdhaXQgcmVzLnRleHQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzLnN0YXR1c30gJHtyZXMuc3RhdHVzVGV4dH1gKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZGF0YTtcbiAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGFzeW5jIGdldCh1cmwsIG9wdHMgPSB7fSkgeyByZXR1cm4gdGhpcy5mZXRjaCh1cmwsIHsgLi4uKG9wdHMgfHwge30pLCBtZXRob2Q6ICdHRVQnIH0pOyB9LFxuICAgICAgICBhc3luYyBwb3N0KHVybCwgYm9keSwgb3B0cyA9IHt9KSB7IHJldHVybiB0aGlzLmZldGNoKHVybCwgeyAuLi4ob3B0cyB8fCB7fSksIG1ldGhvZDogJ1BPU1QnLCBib2R5IH0pOyB9XG4gICAgfTtcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gUGxleCBEUyBoZWxwZXJzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBjb3JlLnBsZXggPSBjb3JlLnBsZXggfHwge1xuICAgICAgICBhc3luYyBkcyhzb3VyY2VJZCwgcGF5bG9hZCA9IHt9LCBvcHRzID0ge30pIHtcbiAgICAgICAgICAgIGlmIChST09ULlRNVXRpbHM/LmRzKSByZXR1cm4gYXdhaXQgUk9PVC5UTVV0aWxzLmRzKHNvdXJjZUlkLCBwYXlsb2FkLCBvcHRzKTtcblxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IGRpcmVjdCBQT1NUIHRvIERTIGVuZHBvaW50IChmb3JtYXQ9MiBcdTIxOTIgcm93cyBpbiBhcnJheSlcbiAgICAgICAgICAgIGNvbnN0IGJhc2UgPSBsb2NhdGlvbi5vcmlnaW4ucmVwbGFjZSgvXFwvJC8sICcnKTtcbiAgICAgICAgICAgIGNvbnN0IHVybCA9IGAke2Jhc2V9L2FwaS9kYXRhc291cmNlcy8ke3NvdXJjZUlkfS9leGVjdXRlP2Zvcm1hdD0yYDtcbiAgICAgICAgICAgIGNvbnN0IGpzb24gPSBhd2FpdCBjb3JlLmh0dHAucG9zdCh1cmwsIHBheWxvYWQsIG9wdHMpO1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IEFycmF5LmlzQXJyYXkoanNvbj8ucm93cykgPyBqc29uLnJvd3MgOiBbXTtcbiAgICAgICAgICAgIHJldHVybiB7IC4uLmpzb24sIHJvd3MgfTtcbiAgICAgICAgfSxcblxuICAgICAgICBhc3luYyBkc1Jvd3Moc291cmNlSWQsIHBheWxvYWQgPSB7fSwgb3B0cyA9IHt9KSB7XG4gICAgICAgICAgICBpZiAoUk9PVC5UTVV0aWxzPy5kc1Jvd3MpIHJldHVybiBhd2FpdCBST09ULlRNVXRpbHMuZHNSb3dzKHNvdXJjZUlkLCBwYXlsb2FkLCBvcHRzKTtcbiAgICAgICAgICAgIGNvbnN0IHsgcm93cyB9ID0gYXdhaXQgdGhpcy5kcyhzb3VyY2VJZCwgcGF5bG9hZCwgb3B0cyk7XG4gICAgICAgICAgICByZXR1cm4gcm93cztcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tIEh1YiBmYWNhZGUgKHByZWZlcnMgbHQtdWktaHViOyBtb3VudHMgb24gZmlyc3QgdXNlKSAtLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS5odWIgPSBjb3JlLmh1YiB8fCAoKCkgPT4ge1xuICAgICAgICAvLyAtLS0gc21hbGwgcGlsbCBmYWxsYmFjayAodXNlZCBvbmx5IGlmIGx0LXVpLWh1YiBtaXNzaW5nKSAtLS1cbiAgICAgICAgY29uc3QgZmFsbGJhY2sgPSAoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYXBpID0ge307XG4gICAgICAgICAgICBhcGkuX3N0aWNreSA9IGZhbHNlO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBlbnN1cmVQaWxsKCkge1xuICAgICAgICAgICAgICAgIGxldCBwaWxsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2x0LWh1Yi1waWxsJyk7XG4gICAgICAgICAgICAgICAgaWYgKCFwaWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHBpbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgICAgICAgICAgcGlsbC5pZCA9ICdsdC1odWItcGlsbCc7XG4gICAgICAgICAgICAgICAgICAgIHBpbGwuc3R5bGUuY3NzVGV4dCA9IGBcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvcDogMTBweDsgcmlnaHQ6IDEwcHg7XG4gICAgICAgICAgICAgICAgICAgICAgICB6LWluZGV4OiAyMTQ3NDgzMDAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgwLDAsMCwuOCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogI2ZmZjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbnQ6IDEzcHggc3lzdGVtLXVpLCAtYXBwbGUtc3lzdGVtLCBTZWdvZSBVSSwgUm9ib3RvLCBzYW5zLXNlcmlmO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogNnB4IDEwcHg7IGJvcmRlci1yYWRpdXM6IDk5OXB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgYm94LXNoYWRvdzogMCA4cHggMjRweCByZ2JhKDAsMCwwLDAuMjUpO1xuICAgICAgICAgICAgICAgICAgICBgO1xuICAgICAgICAgICAgICAgICAgICBwaWxsLnRleHRDb250ZW50ID0gJ1x1MjAyNic7XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5hcHBlbmRDaGlsZChwaWxsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBpbGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGFwaS5zZXRTdGF0dXMgPSAodGV4dCwgdG9uZSA9ICdpbmZvJywgeyBzdGlja3kgPSBmYWxzZSB9ID0ge30pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbCA9IGVuc3VyZVBpbGwoKTtcbiAgICAgICAgICAgICAgICBlbC50ZXh0Q29udGVudCA9IHRleHQgfHwgJyc7XG4gICAgICAgICAgICAgICAgYXBpLl9zdGlja3kgPSAhIXN0aWNreTtcbiAgICAgICAgICAgICAgICBpZiAoIWFwaS5fc3RpY2t5KSBzZXRUaW1lb3V0KCgpID0+IHsgdHJ5IHsgZWwucmVtb3ZlKCk7IH0gY2F0Y2ggeyB9IH0sIDIwMDApO1xuICAgICAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBhcGkubm90aWZ5ID0gKF9sZXZlbCwgdGV4dCwgeyBtcyA9IDI1MDAgfSA9IHt9KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZWwgPSBlbnN1cmVQaWxsKCk7XG4gICAgICAgICAgICAgICAgZWwudGV4dENvbnRlbnQgPSB0ZXh0IHx8ICcnO1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyB0cnkgeyBlbC5yZW1vdmUoKTsgfSBjYXRjaCB7IH0gfSwgTWF0aC5tYXgoNTAwLCBtcyB8IDApKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgYXBpLnRvYXN0ID0gKG1zZywgbXMgPSAzMDAwKSA9PiBhcGkubm90aWZ5KCdpbmZvJywgbXNnLCB7IG1zIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgICB9KSgpO1xuXG4gICAgICAgIC8vIC0tLSBxdWV1ZSB1bnRpbCBsdC11aS1odWIgbW91bnRzIC0tLVxuICAgICAgICBsZXQgbW91bnRlZCA9IGZhbHNlO1xuICAgICAgICBsZXQgbW91bnRpbmcgPSBudWxsOyAgICAgICAgICAgICAgIC8vIFByb21pc2VcbiAgICAgICAgY29uc3QgcXVldWUgPSBbXTsgICAgICAgICAgICAgICAgICAvLyBbe2ZuLCBhcmdzfV1cblxuICAgICAgICBhc3luYyBmdW5jdGlvbiBtb3VudFVpSHViT25jZSgpIHtcbiAgICAgICAgICAgIGlmIChtb3VudGVkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGlmIChtb3VudGluZykgcmV0dXJuIG1vdW50aW5nO1xuXG4gICAgICAgICAgICBtb3VudGluZyA9IChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgZW5zdXJlTFRIdWIgaXMgYXZhaWxhYmxlLCBtb3VudCB0aGUgZnVsbC13aWR0aCBiYXJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZW5zdXJlRm4gPVxuICAgICAgICAgICAgICAgICAgICAgICAgKHR5cGVvZiBlbnN1cmVMVEh1YiA9PT0gJ2Z1bmN0aW9uJykgPyBlbnN1cmVMVEh1YiA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKHR5cGVvZiBST09ULmVuc3VyZUxUSHViID09PSAnZnVuY3Rpb24nID8gUk9PVC5lbnN1cmVMVEh1YiA6IG51bGwpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChlbnN1cmVGbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgZW5zdXJlRm4oe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoZW1lOiB7IG5hbWU6ICdPbmVNb25yb2UnIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZGVmYXVsdCB0byBib2R5OyBob25vciBhbnkgZWFybGllciBzZWxlY3Rpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb3VudDogKFJPT1QuX19MVF9IVUJfTU9VTlQgfHwgJ25hdicpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhZ2VSb290U2VsZWN0b3JzOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICcjcGxleFNpZGV0YWJzTWVudVBhZ2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnLnBsZXgtc2lkZXRhYnMtbWVudS1wYWdlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50LWNvbnRhaW5lcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICcucGxleC1hY3Rpb25zLXdyYXBwZXInXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB3aGVuIGxpdmluZyBpbiB0aGUgbmF2YmFyIHdlIG5ldmVyIHdhbnQgdG8gYWx0ZXIgcGFnZSBsYXlvdXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGljazogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2FwOiA4XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGh1Yk9iaiA9ICh0eXBlb2YgbHRVSUh1YiAhPT0gJ3VuZGVmaW5lZCcpID8gbHRVSUh1YiA6IFJPT1QubHRVSUh1YjtcbiAgICAgICAgICAgICAgICAgICAgbW91bnRlZCA9ICEhaHViT2JqO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbW91bnRlZDtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgbW91bnRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZmx1c2ggcXVldWVkIGNhbGxzIHRocm91Z2ggZWl0aGVyIHVpLWh1YiAoaWYgbW91bnRlZCkgb3IgZmFsbGJhY2tcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaHViID0gbW91bnRlZCA/IFJPT1QubHRVSUh1YiA6IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgeyBmbiwgYXJncyB9IG9mIHF1ZXVlLnNwbGljZSgwKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaHViICYmIHR5cGVvZiBodWJbZm5dID09PSAnZnVuY3Rpb24nKSBodWJbZm5dKC4uLmFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgZmFsbGJhY2tbZm5dKC4uLmFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KSgpO1xuXG4gICAgICAgICAgICByZXR1cm4gbW91bnRpbmc7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBkZWxlZ2F0ZU9yUXVldWUoZm4sIC4uLmFyZ3MpIHtcbiAgICAgICAgICAgIC8vIElmIGx0LXVpLWh1YiBpcyBhbHJlYWR5IG1vdW50ZWQsIGRlbGVnYXRlIGltbWVkaWF0ZWx5XG4gICAgICAgICAgICBjb25zdCBodWJOb3cgPSBtb3VudGVkXG4gICAgICAgICAgICAgICAgPyAoKHR5cGVvZiBsdFVJSHViICE9PSAndW5kZWZpbmVkJykgPyBsdFVJSHViIDogUk9PVC5sdFVJSHViKVxuICAgICAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICAgICAgaWYgKGh1Yk5vdyAmJiB0eXBlb2YgaHViTm93W2ZuXSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIHRyeSB7IGh1Yk5vd1tmbl0oLi4uYXJncyk7IH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSWYgd2UgY2FuIG1vdW50IChzYW5kYm94IG9yIHdpbmRvdyksIHF1ZXVlIGFuZCBraWNrIGl0IG9mZlxuICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmVMVEh1YiA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgUk9PVC5lbnN1cmVMVEh1YiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIHF1ZXVlLnB1c2goeyBmbiwgYXJncyB9KTtcbiAgICAgICAgICAgICAgICBtb3VudFVpSHViT25jZSgpOyAgLy8gZmlyZSAmIGZvcmdldFxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTm8gdWktaHViIGF2YWlsYWJsZSBcdTIxOTIgZmFsbGJhY2sgaW1tZWRpYXRlbHlcbiAgICAgICAgICAgIGZhbGxiYWNrW2ZuXSguLi5hcmdzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFB1YmxpYyBBUEkgKHN5bmMgbG9va2luZzsgaW50ZXJuYWxseSBxdWV1ZXMvZGVsZWdhdGVzKVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc2V0U3RhdHVzKHRleHQsIHRvbmUgPSAnaW5mbycsIG9wdHMgPSB7fSkgeyBkZWxlZ2F0ZU9yUXVldWUoJ3NldFN0YXR1cycsIHRleHQsIHRvbmUsIG9wdHMpOyByZXR1cm4gdGhpczsgfSxcblxuICAgICAgICAgICAgbm90aWZ5KHRleHQsIHRvbmUgPSAnaW5mbycsIG9wdHMgPSB7fSkge1xuICAgICAgICAgICAgICAgIC8vIGx0LXVpLWh1YiBzaWduYXR1cmU6IG5vdGlmeShraW5kLCB0ZXh0LCB7bXMsIHN0aWNreSwgdG9hc3R9KVxuICAgICAgICAgICAgICAgIGNvbnN0IG1zID0gb3B0cz8udGltZW91dCA/PyBvcHRzPy5tcyA/PyAyNTAwO1xuICAgICAgICAgICAgICAgIGRlbGVnYXRlT3JRdWV1ZSgnbm90aWZ5JywgdG9uZSwgdGV4dCwgeyBtcywgc3RpY2t5OiAhIW9wdHM/LnN0aWNreSwgdG9hc3Q6ICEhb3B0cz8udG9hc3QgfSk7XG4gICAgICAgICAgICAgICAgaWYgKCFtb3VudGVkICYmIHR5cGVvZiBST09ULmVuc3VyZUxUSHViICE9PSAnZnVuY3Rpb24nKSBmYWxsYmFjay5ub3RpZnkodGV4dCwgdG9uZSwgb3B0cyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdG9hc3QobXNnLCB0aW1lb3V0ID0gMzAwMCkge1xuICAgICAgICAgICAgICAgIGRlbGVnYXRlT3JRdWV1ZSgnbm90aWZ5JywgJ2luZm8nLCBtc2csIHsgbXM6IHRpbWVvdXQsIHRvYXN0OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgIGlmICghbW91bnRlZCAmJiB0eXBlb2YgUk9PVC5lbnN1cmVMVEh1YiAhPT0gJ2Z1bmN0aW9uJykgZmFsbGJhY2sudG9hc3QobXNnLCB0aW1lb3V0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB1cGRhdGVCdXR0b24oaWQsIHBhdGNoID0ge30pIHtcbiAgICAgICAgICAgICAgICBkZWxlZ2F0ZU9yUXVldWUoJ3VwZGF0ZUJ1dHRvbicsIGlkLCBwYXRjaCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYmVnaW5UYXNrKGxhYmVsLCB0b25lID0gJ2luZm8nKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1vdW50ZWQgJiYgUk9PVC5sdFVJSHViPy5iZWdpblRhc2spIHJldHVybiBST09ULmx0VUlIdWIuYmVnaW5UYXNrKGxhYmVsLCB0b25lKTtcbiAgICAgICAgICAgICAgICAvLyBxdWV1ZSBhIHN5bnRoZXRpYyBiZWdpblRhc2sgdXNpbmcgc3RhdHVzICsgc3VjY2Vzcy9lcnJvciBoZWxwZXJzXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0dXMobGFiZWwsIHRvbmUsIHsgc3RpY2t5OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGN0bCA9IHtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlOiAodHh0LCB0ID0gdG9uZSkgPT4geyB0aGlzLnNldFN0YXR1cyh0eHQsIHQsIHsgc3RpY2t5OiB0cnVlIH0pOyByZXR1cm4gY3RsOyB9LFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiAobXNnID0gJ0RvbmUnLCBtcyA9IDI1MDApID0+IHsgdGhpcy5zZXRTdGF0dXMoJycsICdpbmZvJywgeyBzdGlja3k6IGZhbHNlIH0pOyB0aGlzLm5vdGlmeShtc2csICdzdWNjZXNzJywgeyB0aW1lb3V0OiBtcyB9KTsgcmV0dXJuIGN0bDsgfSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IChtc2cgPSAnRmFpbGVkJykgPT4geyB0aGlzLnNldFN0YXR1cygnJywgJ2luZm8nLCB7IHN0aWNreTogZmFsc2UgfSk7IHRoaXMubm90aWZ5KG1zZywgJ2Vycm9yJywgeyB0aW1lb3V0OiAzNTAwIH0pOyByZXR1cm4gY3RsOyB9LFxuICAgICAgICAgICAgICAgICAgICBjbGVhcjogKCkgPT4geyB0aGlzLnNldFN0YXR1cygnJywgJ2luZm8nLCB7IHN0aWNreTogZmFsc2UgfSk7IHJldHVybiBjdGw7IH0sXG4gICAgICAgICAgICAgICAgICAgIGRvbmU6IChtc2csIG1zKSA9PiBjdGwuc3VjY2Vzcyhtc2csIG1zKVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgLy8gdHJ5IHRvIHVwZ3JhZGUgdG8gbHQtdWktaHViIHJlYWwgdGFzayBhZnRlciBtb3VudFxuICAgICAgICAgICAgICAgIG1vdW50VWlIdWJPbmNlKCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGh1Yk5vdyA9ICh0eXBlb2YgbHRVSUh1YiAhPT0gJ3VuZGVmaW5lZCcpID8gbHRVSUh1YiA6IFJPT1QubHRVSUh1YjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGh1Yk5vdz8uYmVnaW5UYXNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkgeyBodWJOb3cuYmVnaW5UYXNrKGxhYmVsLCB0b25lKTsgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY3RsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH0pKCk7XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gVGhlbWUgYnJpZGdlIChAcmVzb3VyY2UgVEhFTUVfQ1NTIFx1MjE5MiBHTV9hZGRTdHlsZSlcbiAgICAvLyBHcmFudHMgYXJlIGV4cGVjdGVkIGluIHRoZSBwYXJlbnQgKGVudHJ5KSBiYW5uZXI7IHRoaXMgaXMgc2FmZSBuby1vcC5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS50aGVtZSA9IGNvcmUudGhlbWUgfHwge1xuICAgICAgICBhcHBseSgpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gT25seSBtYWluIHNjcmlwdFx1MjAxOXMgQGdyYW50IG1hdHRlcnM7IEByZXF1aXJlIG1ldGFkYXRhIGlzIGlnbm9yZWQgYnkgVE1cbiAgICAgICAgICAgICAgICBjb25zdCBjc3MgPSAodHlwZW9mIEdNX2dldFJlc291cmNlVGV4dCA9PT0gJ2Z1bmN0aW9uJykgPyBHTV9nZXRSZXNvdXJjZVRleHQoJ1RIRU1FX0NTUycpIDogJyc7XG4gICAgICAgICAgICAgICAgaWYgKGNzcyAmJiB0eXBlb2YgR01fYWRkU3R5bGUgPT09ICdmdW5jdGlvbicpIEdNX2FkZFN0eWxlKGNzcyk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgY29uc29sZS53YXJuKCdbbHQtY29yZV0gdGhlbWUuYXBwbHkgZmFpbGVkJywgZSk7IH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBTbWFsbCB1dGlsaXRpZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS51dGlsID0gY29yZS51dGlsIHx8IHtcbiAgICAgICAgc2xlZXAobXMpIHsgcmV0dXJuIG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBNYXRoLm1heCgwLCBtcyB8IDApKSk7IH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJ1biBhIGZ1bmN0aW9uIG9ubHkgb25jZSBwZXIga2V5IChwZXIgcGFnZSBsb2FkKS5cbiAgICAgICAgICovXG4gICAgICAgIG9uY2Uoa2V5LCBmbikge1xuICAgICAgICAgICAgY29uc3Qgc3RvcmUgPSAoY29yZS5fX29uY2UgPSBjb3JlLl9fb25jZSB8fCBuZXcgU2V0KCkpO1xuICAgICAgICAgICAgaWYgKHN0b3JlLmhhcyhrZXkpKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgc3RvcmUuYWRkKGtleSk7XG4gICAgICAgICAgICByZXR1cm4gZm4oKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gRGF0YSAoaW50ZW50aW9uYWxseSBibGFuayBpbiBjb3JlKVxuICAgIC8vIERvIE5PVCBkZWZpbmUgY29yZS5kYXRhIGhlcmU7IGx0LWRhdGEtY29yZSAvIHlvdXIgcmVwb3MgYXVnbWVudCBpdC5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFFUIGhlbHBlcnM6IHJlcG9zICsgcHJvbW90aW9uICsgcXVvdGUgY29udGV4dCArIGh1YiBidXR0b25cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS1cbiAgICBjb3JlLnF0ID0gY29yZS5xdCB8fCAoKCkgPT4ge1xuICAgICAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnKSA/IHVuc2FmZVdpbmRvdyA6IHdpbmRvdztcblxuICAgICAgICBmdW5jdGlvbiBnZXRUYWJTY29wZUlkKG5zID0gJ1FUJykge1xuICAgICAgICAgICAgdHJ5IHsgaWYgKHR5cGVvZiBST09ULmdldFRhYlNjb3BlSWQgPT09ICdmdW5jdGlvbicpIHJldHVybiBST09ULmdldFRhYlNjb3BlSWQobnMpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdG9yYWdlID0gUk9PVC5zZXNzaW9uU3RvcmFnZTtcbiAgICAgICAgICAgICAgICBjb25zdCBLID0gYGx0OiR7bnN9Ol9fc2NvcGVJZGA7XG4gICAgICAgICAgICAgICAgbGV0IHYgPSBzdG9yYWdlLmdldEl0ZW0oSyk7XG4gICAgICAgICAgICAgICAgaWYgKCF2KSB7XG4gICAgICAgICAgICAgICAgICAgIHYgPSBTdHJpbmcoTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjE0NzQ4MzY0NykpO1xuICAgICAgICAgICAgICAgICAgICBzdG9yYWdlLnNldEl0ZW0oSywgdik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IG4gPSBOdW1iZXIodik7XG4gICAgICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikgfHwgbiA8PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ2JhZCBzY29wZScpO1xuICAgICAgICAgICAgICAgIHJldHVybiBuO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gJ19fTFRfUVRfU0NPUEVfSURfXyc7XG4gICAgICAgICAgICAgICAgaWYgKCFST09UW2tleV0pIFJPT1Rba2V5XSA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDIxNDc0ODM2NDcpO1xuICAgICAgICAgICAgICAgIHJldHVybiBST09UW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBnZXRRVEYoKSB7XG4gICAgICAgICAgICBjb25zdCBtYWtlID0gUk9PVC5sdD8uY29yZT8uZGF0YT8ubWFrZUZsYXRTY29wZWRSZXBvO1xuICAgICAgICAgICAgcmV0dXJuICh0eXBlb2YgbWFrZSA9PT0gJ2Z1bmN0aW9uJykgPyBtYWtlKHsgbnM6ICdRVCcsIGVudGl0eTogJ3F1b3RlJywgbGVnYWN5RW50aXR5OiAnUXVvdGVIZWFkZXInIH0pIDogbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGFzeW5jIGZ1bmN0aW9uIHVzZURyYWZ0UmVwbygpIHtcbiAgICAgICAgICAgIGNvbnN0IFFURiA9IGdldFFURigpO1xuICAgICAgICAgICAgaWYgKCFRVEYpIHJldHVybiBudWxsO1xuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSBRVEYudXNlKGdldFRhYlNjb3BlSWQoJ1FUJykpO1xuICAgICAgICAgICAgcmV0dXJuIHJlcG8gfHwgbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGFzeW5jIGZ1bmN0aW9uIHVzZVF1b3RlUmVwbyhxaykge1xuICAgICAgICAgICAgY29uc3QgUVRGID0gZ2V0UVRGKCk7XG4gICAgICAgICAgICBpZiAoIVFURiB8fCAhcWsgfHwgIU51bWJlci5pc0Zpbml0ZShxaykgfHwgcWsgPD0gMCkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICBjb25zdCB7IHJlcG8gfSA9IFFURi51c2UoTnVtYmVyKHFrKSk7XG4gICAgICAgICAgICByZXR1cm4gcmVwbyB8fCBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gLS0tLS0tLS0tLSBQcm9tb3Rpb24gKEEpIC0tLS0tLS0tLS1cbiAgICAgICAgZnVuY3Rpb24gbmVlZHNNZXJnZShjdXJyZW50ID0ge30sIGRyYWZ0ID0ge30pIHtcbiAgICAgICAgICAgIGNvbnN0IGN1clVwZCA9IE51bWJlcihjdXJyZW50LlVwZGF0ZWRfQXQgPz8gMCk7XG4gICAgICAgICAgICBjb25zdCBkVXBkID0gTnVtYmVyKGRyYWZ0Py5VcGRhdGVkX0F0ID8/IDApO1xuICAgICAgICAgICAgY29uc3QgY3VyQ3VzdCA9IFN0cmluZyhjdXJyZW50LkN1c3RvbWVyX05vID8/ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IG5ld0N1c3QgPSBTdHJpbmcoZHJhZnQ/LkN1c3RvbWVyX05vID8/ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IGtleUNoYW5nZWQgPSBTdHJpbmcoY3VycmVudC5DYXRhbG9nX0tleSA/PyAnJykgIT09IFN0cmluZyhkcmFmdD8uQ2F0YWxvZ19LZXkgPz8gJycpO1xuICAgICAgICAgICAgY29uc3QgY29kZUNoYW5nZWQgPSBTdHJpbmcoY3VycmVudC5DYXRhbG9nX0NvZGUgPz8gJycpICE9PSBTdHJpbmcoZHJhZnQ/LkNhdGFsb2dfQ29kZSA/PyAnJyk7XG4gICAgICAgICAgICByZXR1cm4gKGRVcGQgPiBjdXJVcGQpIHx8IGtleUNoYW5nZWQgfHwgY29kZUNoYW5nZWQgfHwgKGN1ckN1c3QgIT09IG5ld0N1c3QpO1xuICAgICAgICB9XG5cbiAgICAgICAgYXN5bmMgZnVuY3Rpb24gbWVyZ2VPbmNlKHFrKSB7XG4gICAgICAgICAgICBjb25zdCBkcmFmdFJlcG8gPSBhd2FpdCB1c2VEcmFmdFJlcG8oKTtcbiAgICAgICAgICAgIGlmICghZHJhZnRSZXBvKSByZXR1cm4gJ25vLWRjJztcbiAgICAgICAgICAgIGxldCBkcmFmdCA9IChhd2FpdCBkcmFmdFJlcG8uZ2V0SGVhZGVyPy4oKSkgfHwgKGF3YWl0IGRyYWZ0UmVwby5nZXQ/LigpKTtcblxuICAgICAgICAgICAgLy8gSWYgZW1wdHksIHRyeSBsZWdhY3kgXCJkcmFmdFwiIHNjb3BlIGFuZCBtaWdyYXRlIGl0IGZvcndhcmRcbiAgICAgICAgICAgIGlmICghZHJhZnQgfHwgIU9iamVjdC5rZXlzKGRyYWZ0KS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB7IHJlcG86IGxlZ2FjeSB9ID0gZ2V0UVRGKCkudXNlKCdkcmFmdCcpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsZWdhY3lEcmFmdCA9IChhd2FpdCBsZWdhY3kuZ2V0SGVhZGVyPy4oKSkgfHwgKGF3YWl0IGxlZ2FjeS5nZXQ/LigpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxlZ2FjeURyYWZ0ICYmIE9iamVjdC5rZXlzKGxlZ2FjeURyYWZ0KS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGRyYWZ0UmVwby5wYXRjaEhlYWRlcj8uKGxlZ2FjeURyYWZ0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRyYWZ0ID0gbGVnYWN5RHJhZnQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFkcmFmdCB8fCAhT2JqZWN0LmtleXMoZHJhZnQpLmxlbmd0aCkgcmV0dXJuICduby1kcmFmdCc7XG5cbiAgICAgICAgICAgIGNvbnN0IHF1b3RlUmVwbyA9IGF3YWl0IHVzZVF1b3RlUmVwbyhxayk7XG4gICAgICAgICAgICBpZiAoIXF1b3RlUmVwbykgcmV0dXJuICduby1xdW90ZSc7XG5cbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSAoYXdhaXQgcXVvdGVSZXBvLmdldEhlYWRlcj8uKCkpIHx8IHt9O1xuICAgICAgICAgICAgaWYgKCFuZWVkc01lcmdlKGN1cnJlbnQsIGRyYWZ0KSkgcmV0dXJuICdub29wJztcblxuICAgICAgICAgICAgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyPy4oe1xuICAgICAgICAgICAgICAgIC4uLmRyYWZ0LFxuICAgICAgICAgICAgICAgIFF1b3RlX0tleTogTnVtYmVyKHFrKSxcbiAgICAgICAgICAgICAgICBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogRGF0ZS5ub3coKSxcbiAgICAgICAgICAgICAgICBQcm9tb3RlZF9Gcm9tOiAnZHJhZnQnLFxuICAgICAgICAgICAgICAgIFByb21vdGVkX0F0OiBEYXRlLm5vdygpXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdHJ5IHsgYXdhaXQgZHJhZnRSZXBvLmNsZWFyPy4oKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIHRyeSB7IGNvbnN0IHsgcmVwbzogbGVnYWN5IH0gPSBnZXRRVEYoKS51c2UoJ2RyYWZ0Jyk7IGF3YWl0IGxlZ2FjeS5jbGVhcj8uKCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICByZXR1cm4gJ21lcmdlZCc7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBSRVRSWSA9IHsgdGltZXI6IG51bGwsIHRyaWVzOiAwLCBtYXg6IDIwLCBtczogMjUwIH07XG4gICAgICAgIGZ1bmN0aW9uIHN0b3BSZXRyeSgpIHsgaWYgKFJFVFJZLnRpbWVyKSBjbGVhckludGVydmFsKFJFVFJZLnRpbWVyKTsgUkVUUlkudGltZXIgPSBudWxsOyBSRVRSWS50cmllcyA9IDA7IH1cbiAgICAgICAgZnVuY3Rpb24gcHJvbW90ZURyYWZ0VG9RdW90ZSh7IHFrLCBzdHJhdGVneSA9ICdvbmNlJyB9ID0ge30pIHtcbiAgICAgICAgICAgIGlmIChzdHJhdGVneSA9PT0gJ3JldHJ5Jykge1xuICAgICAgICAgICAgICAgIHN0b3BSZXRyeSgpO1xuICAgICAgICAgICAgICAgIFJFVFJZLnRpbWVyID0gc2V0SW50ZXJ2YWwoYXN5bmMgKCkgPT4geyBSRVRSWS50cmllcysrOyBjb25zdCByZXMgPSBhd2FpdCBtZXJnZU9uY2UocWspOyBpZiAocmVzID09PSAnbWVyZ2VkJyB8fCBSRVRSWS50cmllcyA+PSBSRVRSWS5tYXgpIHN0b3BSZXRyeSgpOyB9LCBSRVRSWS5tcyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1lcmdlT25jZShxayk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyAtLS0tLS0tLS0tIFF1b3RlIENvbnRleHQgKEIpIC0tLS0tLS0tLS1cbiAgICAgICAgZnVuY3Rpb24gZ2V0TnVtYmVyKHYpIHsgY29uc3QgbiA9IE51bWJlcih2KTsgcmV0dXJuIE51bWJlci5pc0Zpbml0ZShuKSA/IG4gOiAwOyB9XG4gICAgICAgIGZ1bmN0aW9uIGZyb21VcmwoKSB7IHRyeSB7IGNvbnN0IHUgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpOyByZXR1cm4geyBxdW90ZUtleTogZ2V0TnVtYmVyKHUuc2VhcmNoUGFyYW1zLmdldCgnUXVvdGVLZXknKSB8fCB1LnNlYXJjaFBhcmFtcy5nZXQoJ3F1b3RlS2V5JykpIH07IH0gY2F0Y2ggeyByZXR1cm4geyBxdW90ZUtleTogMCB9OyB9IH1cbiAgICAgICAgZnVuY3Rpb24gZnJvbURvbSgpIHtcbiAgICAgICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtcXVvdGUta2V5XSwjUXVvdGVLZXksW25hbWU9XCJRdW90ZUtleVwiXScpO1xuICAgICAgICAgICAgY29uc3QgcWsgPSBlbCA/IGdldE51bWJlcihlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcXVvdGUta2V5JykgPz8gZWwudmFsdWUpIDogMDtcbiAgICAgICAgICAgIGNvbnN0IHBuID0gKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy53aXphcmQtc3RlcHMgLmFjdGl2ZSwgLndpemFyZCAuYWN0aXZlLCAucGxleC1zaWRldGFicyAuYWN0aXZlJyk/LnRleHRDb250ZW50XG4gICAgICAgICAgICAgICAgfHwgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBhZ2UtdGl0bGUsIC5jb250ZW50LWhlYWRlciBoMSwgLnBsZXgtbmF2YmFyLXRpdGxlJyk/LnRleHRDb250ZW50XG4gICAgICAgICAgICAgICAgfHwgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKT8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICAgIHJldHVybiB7IHF1b3RlS2V5OiBxaywgcGFnZU5hbWU6IHBuIH07XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZnJvbUtvKCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBrb1Jvb3QgPSAod2luZG93LmtvICYmIHR5cGVvZiB3aW5kb3cua28uZGF0YUZvciA9PT0gJ2Z1bmN0aW9uJykgPyB3aW5kb3cua28uZGF0YUZvcihkb2N1bWVudC5ib2R5KSA6IG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3QgcWsgPSBnZXROdW1iZXIoa29Sb290Py5RdW90ZUtleSA/PyBrb1Jvb3Q/LnF1b3RlS2V5ID8/IGtvUm9vdD8uUXVvdGU/LlF1b3RlS2V5KSB8fCAwO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBuID0gU3RyaW5nKGtvUm9vdD8uQ3VycmVudFBhZ2VOYW1lID8/IGtvUm9vdD8uY3VycmVudFBhZ2VOYW1lID8/IGtvUm9vdD8uV2l6YXJkPy5DdXJyZW50UGFnZU5hbWUgPz8gJycpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBxdW90ZUtleTogcWssIHBhZ2VOYW1lOiBwbiB9O1xuICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiB7IHF1b3RlS2V5OiAwLCBwYWdlTmFtZTogJycgfTsgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGNvYWxlc2NlKCkge1xuICAgICAgICAgICAgY29uc3QgYSA9IGZyb21LbygpLCBiID0gZnJvbURvbSgpLCBjID0gZnJvbVVybCgpO1xuICAgICAgICAgICAgY29uc3QgcXVvdGVLZXkgPSBhLnF1b3RlS2V5IHx8IGIucXVvdGVLZXkgfHwgYy5xdW90ZUtleSB8fCAwO1xuICAgICAgICAgICAgY29uc3QgcGFnZU5hbWUgPSAoYS5wYWdlTmFtZSB8fCBiLnBhZ2VOYW1lIHx8IGRvY3VtZW50LnRpdGxlIHx8ICcnKS5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xuICAgICAgICAgICAgY29uc3QgaXNPblBhcnRTdW1tYXJ5ID0gKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAvLyBET00gc2lnbmFsIGZyb20gUGFydCBTdW1tYXJ5OiBJRHMgbGlrZSBcIlF1b3RlUGFydFN1bW1hcnlGb3JtXypcIlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNQU0Zvcm0gPVxuICAgICAgICAgICAgICAgICAgICAgICAgISFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjUXVvdGVQYXJ0U3VtbWFyeUZvcm0sW2lkXj1cIlF1b3RlUGFydFN1bW1hcnlGb3JtX1wiXScpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaGFzUFNGb3JtKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICAgICAgICAgICAgICAvLyAoT3B0aW9uYWwpIGFjdGl2ZSB3aXphcmQgc3RlcCBsYWJlbCBlcXVhbHMgXCJQYXJ0IFN1bW1hcnlcIlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZScpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYWN0aXZlICYmIGFjdGl2ZS50ZXh0Q29udGVudCAmJiBhY3RpdmUudGV4dENvbnRlbnQudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09ICdwYXJ0IHN1bW1hcnknKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cbiAgICAgICAgICAgICAgICAvLyBGYWxsYmFja3MgKFVSTC90aXRsZSBoZXVyaXN0aWNzKVxuICAgICAgICAgICAgICAgIHJldHVybiAvcGFydFxccypzdW1tYXJ5L2kudGVzdChwYWdlTmFtZSkgfHxcbiAgICAgICAgICAgICAgICAgICAgL3BhcnQoPzolMjB8XFxzfC0pP3N1bW1hcnl8c3VtbWFyeSg/OiUyMHxcXHN8LSk/cGFydC9pLnRlc3QobG9jYXRpb24uaHJlZik7XG4gICAgICAgICAgICB9KSgpO1xuXG4gICAgICAgICAgICByZXR1cm4geyBxdW90ZUtleSwgcGFnZU5hbWUsIGlzT25QYXJ0U3VtbWFyeSB9O1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdldFF1b3RlQ29udGV4dCgpIHtcbiAgICAgICAgICAgIGNvbnN0IHsgcXVvdGVLZXksIHBhZ2VOYW1lLCBpc09uUGFydFN1bW1hcnkgfSA9IGNvYWxlc2NlKCk7XG4gICAgICAgICAgICByZXR1cm4geyBxdW90ZUtleSwgcGFnZU5hbWUsIGlzT25QYXJ0U3VtbWFyeSwgaGFzUXVvdGVLZXk6IHF1b3RlS2V5ID4gMCwgaXNQYWdlOiAobikgPT4gbmV3IFJlZ0V4cChTdHJpbmcobikucmVwbGFjZSgvXFxzKy9nLCAnXFxcXHMqJyksICdpJykudGVzdChwYWdlTmFtZSkgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIC0tLS0tLS0tLS0gSHViIGhlbHBlcnMgKEMpIC0tLS0tLS0tLS1cbiAgICAgICAgYXN5bmMgZnVuY3Rpb24gZ2V0SHViKG9wdHMgPSB7IG1vdW50OiAnbmF2JyB9KSB7XG4gICAgICAgICAgICBjb25zdCBSID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnKSA/IHVuc2FmZVdpbmRvdyA6IHdpbmRvdztcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuc3VyZSA9IChSLmVuc3VyZUxUSHViIHx8IHdpbmRvdy5lbnN1cmVMVEh1Yik7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGVuc3VyZShvcHRzKTsgLy8gbWF5IHJldHVybiB2b2lkXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBodWJOb3cgPSAodHlwZW9mIGx0VUlIdWIgIT09ICd1bmRlZmluZWQnKSA/IGx0VUlIdWIgOiBSLmx0VUlIdWI7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaHViTm93KSByZXR1cm4gaHViTm93O1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBodWJOb3cgPSAodHlwZW9mIGx0VUlIdWIgIT09ICd1bmRlZmluZWQnKSA/IGx0VUlIdWIgOiBSLmx0VUlIdWI7XG4gICAgICAgICAgICAgICAgaWYgKGh1Yk5vdykgcmV0dXJuIGh1Yk5vdztcbiAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBfX2ZhbGxiYWNrOiB0cnVlIH07IC8vIGZhbGxiYWNrIHNlbnRpbmVsXG4gICAgICAgIH1cblxuICAgICAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJCdXR0b24oe1xuICAgICAgICAgICAgaWQsIGxhYmVsLCB0aXRsZSwgc2lkZSA9ICdsZWZ0Jywgd2VpZ2h0ID0gMTIwLCBvbkNsaWNrLCBzaG93V2hlbiwgZm9yY2UgPSBmYWxzZSwgbW91bnQgPSAnbmF2J1xuICAgICAgICB9ID0ge30pIHtcbiAgICAgICAgICAgIGNvbnN0IGh1YiA9IGF3YWl0IGdldEh1Yih7IG1vdW50IH0pO1xuICAgICAgICAgICAgY29uc3QgdXNpbmdVaUh1YiA9ICEhKGh1YiAmJiAhaHViLl9fZmFsbGJhY2sgJiYgdHlwZW9mIGh1Yi5yZWdpc3RlckJ1dHRvbiA9PT0gJ2Z1bmN0aW9uJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHNob3VsZFNob3dOb3cgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgY29uc3QgY3R4ID0gZ2V0UXVvdGVDb250ZXh0KCk7IHJldHVybiAhIShmb3JjZSB8fCAodHlwZW9mIHNob3dXaGVuID09PSAnZnVuY3Rpb24nID8gc2hvd1doZW4oY3R4KSA6IHRydWUpKTsgfVxuICAgICAgICAgICAgICAgIGNhdGNoIHsgcmV0dXJuICEhZm9yY2U7IH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmICh1c2luZ1VpSHViKSB7XG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gbGlzdElkcygpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHYgPSBodWIubGlzdD8uKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkodikpIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFN1cHBvcnQgYXJyYXlzIG9mIHN0cmluZ3MgT1IgYXJyYXlzIG9mIHsgaWQsIC4uLiB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdi5tYXAoeCA9PiAoeCAmJiB0eXBlb2YgeCA9PT0gJ29iamVjdCcpID8geC5pZCA6IHgpLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiBbXTsgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGlzUHJlc2VudCgpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaHViLmhhcyA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuICEhaHViLmhhcyhpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbGlzdElkcygpLmluY2x1ZGVzKGlkKTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGFzeW5jIGZ1bmN0aW9uIHJlZ2lzdGVyKCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWYgPSB7IGlkLCBsYWJlbCwgdGl0bGUsIHdlaWdodCwgb25DbGljayB9O1xuICAgICAgICAgICAgICAgICAgICAvLyBBbHdheXMgcHJlZmVyIHRoZSAyLWFyZyBmb3JtOyBmYWxsIGJhY2sgdG8gMS1hcmdcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgaHViLnJlZ2lzdGVyQnV0dG9uPy4oc2lkZSwgZGVmKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgMDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc1ByZXNlbnQoKSkgeyB0cnkgeyBodWIucmVnaXN0ZXJCdXR0b24/Lih7IC4uLmRlZiwgc2VjdGlvbjogc2lkZSB9KTsgfSBjYXRjaCB7IH0gfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHN0aWxsIG5vdCBwcmVzZW50LCB0cnkgdGhlIGFsdGVybmF0ZSBmb3JtIGV4cGxpY2l0bHlcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgMDsgLy8geWllbGRcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc1ByZXNlbnQoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oeyAuLi5kZWYsIHNlY3Rpb246IHNpZGUgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBhd2FpdCAwO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzUHJlc2VudCgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGh1Yi5yZWdpc3RlckJ1dHRvbihzaWRlLCBkZWYpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlzUHJlc2VudCgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGVuc3VyZVJlZygpIHsgaWYgKGlzUHJlc2VudCgpKSByZXR1cm4gZmFsc2U7IHJldHVybiByZWdpc3RlcigpOyB9XG4gICAgICAgICAgICAgICAgZW5zdXJlUmVnKCk7XG5cbiAgICAgICAgICAgICAgICBhc3luYyBmdW5jdGlvbiByZWNvbmNpbGUoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzaG93ID0gc2hvdWxkU2hvd05vdygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJlc2VudCA9IGlzUHJlc2VudCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNob3cpIHsgaWYgKCFwcmVzZW50KSBlbnN1cmVSZWcoKTsgcmV0dXJuIHRydWU7IH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmVzZW50KSBodWIucmVtb3ZlPy4oaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZW5zdXJlSHViQnV0dG9uLl9fc3RhdGUgPSBlbnN1cmVIdWJCdXR0b24uX19zdGF0ZSB8fCB7fTtcbiAgICAgICAgICAgICAgICBjb25zdCBzdGF0ZSA9IGVuc3VyZUh1YkJ1dHRvbi5fX3N0YXRlW2lkXSB8fD0geyBvYnM6IG51bGwsIG9mZlVybDogbnVsbCB9O1xuXG4gICAgICAgICAgICAgICAgYXdhaXQgcmVjb25jaWxlKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS5vYnMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKSB8fCBkb2N1bWVudC5ib2R5O1xuICAgICAgICAgICAgICAgICAgICBpZiAocm9vdCAmJiB3aW5kb3cuTXV0YXRpb25PYnNlcnZlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4geyByZWNvbmNpbGUoKTsgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vYnMub2JzZXJ2ZShyb290LCB7IHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZXM6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLm9mZlVybCAmJiB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2UpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUub2ZmVXJsID0gd2luZG93LlRNVXRpbHMub25VcmxDaGFuZ2UoKCkgPT4geyByZWNvbmNpbGUoKTsgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBGYWxsYmFjazogc3ludGhlc2l6ZSBhIHNpbXBsZSBuYXZiYXIgYnV0dG9uIChvbmx5IGlmIGx0LXVpLWh1YiBub3QgcHJlc2VudClcbiAgICAgICAgICAgIGNvbnN0IGRvbUlkID0gYGx0LW5hdmJ0bi0ke2lkfWA7XG4gICAgICAgICAgICBmdW5jdGlvbiBuYXZSaWdodCgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI25hdkJhciAubmF2YmFyLXJpZ2h0JykgfHxcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtbmF2YmFyLWNvbnRhaW5lciAubmF2YmFyLXJpZ2h0JykgfHxcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm5hdmJhci1yaWdodCcpIHx8XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduYXZCYXInKSB8fCBkb2N1bWVudC5ib2R5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZnVuY3Rpb24gZW5zdXJlRG9tKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGhvc3QgPSBuYXZSaWdodCgpOyBpZiAoIWhvc3QpIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIGxldCBidG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChkb21JZCk7XG4gICAgICAgICAgICAgICAgaWYgKCFidG4pIHtcbiAgICAgICAgICAgICAgICAgICAgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi5pZCA9IGRvbUlkOyBidG4udHlwZSA9ICdidXR0b24nOyBidG4uY2xhc3NOYW1lID0gJ2J0biBidG4tcHJpbWFyeSc7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi50aXRsZSA9IHRpdGxlIHx8ICcnOyBidG4udGV4dENvbnRlbnQgPSBsYWJlbCB8fCBpZDsgYnRuLnN0eWxlLm1hcmdpbkxlZnQgPSAnOHB4JztcbiAgICAgICAgICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2KSA9PiB7IHRyeSB7IG9uQ2xpY2s/Lihldik7IH0gY2F0Y2ggeyB9IH0pO1xuICAgICAgICAgICAgICAgICAgICBob3N0LmFwcGVuZENoaWxkKGJ0bik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBidG47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmdW5jdGlvbiByZW1vdmVEb20oKSB7IGNvbnN0IG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChkb21JZCk7IGlmIChuKSB0cnkgeyBuLnJlbW92ZSgpOyB9IGNhdGNoIHsgfSB9XG5cbiAgICAgICAgICAgIGFzeW5jIGZ1bmN0aW9uIHJlY29uY2lsZURvbSgpIHsgY29uc3Qgc2hvdyA9IHNob3VsZFNob3dOb3coKTsgaWYgKHNob3cpIGVuc3VyZURvbSgpOyBlbHNlIHJlbW92ZURvbSgpOyB9XG5cbiAgICAgICAgICAgIGVuc3VyZUh1YkJ1dHRvbi5fX3N0YXRlID0gZW5zdXJlSHViQnV0dG9uLl9fc3RhdGUgfHwge307XG4gICAgICAgICAgICBjb25zdCBzdGF0ZSA9IGVuc3VyZUh1YkJ1dHRvbi5fX3N0YXRlW2lkXSB8fD0geyBvYnM6IG51bGwsIG9mZlVybDogbnVsbCB9O1xuXG4gICAgICAgICAgICBhd2FpdCByZWNvbmNpbGVEb20oKTtcbiAgICAgICAgICAgIGlmICghc3RhdGUub2JzKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKSB8fCBkb2N1bWVudC5ib2R5O1xuICAgICAgICAgICAgICAgIGlmIChyb290ICYmIHdpbmRvdy5NdXRhdGlvbk9ic2VydmVyKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLm9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHsgcmVjb25jaWxlRG9tKCk7IH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vYnMub2JzZXJ2ZShyb290LCB7IHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZXM6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXN0YXRlLm9mZlVybCAmJiB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2UpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5vZmZVcmwgPSB3aW5kb3cuVE1VdGlscy5vblVybENoYW5nZSgoKSA9PiB7IHJlY29uY2lsZURvbSgpOyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHsgcHJvbW90ZURyYWZ0VG9RdW90ZSwgc3RvcFJldHJ5LCB1c2VEcmFmdFJlcG8sIHVzZVF1b3RlUmVwbywgZ2V0UXVvdGVDb250ZXh0LCBnZXRIdWIsIGVuc3VyZUh1YkJ1dHRvbiB9O1xuICAgIH0pKCk7XG5cbiAgICAvLyBBdXRvLWFwcGx5IFRIRU1FX0NTUyBpZiBwcm92aWRlZCAoc2FmZSBuby1vcCBvdGhlcndpc2UpXG4gICAgdHJ5IHsgY29yZS50aGVtZS5hcHBseSgpOyB9IGNhdGNoIHsgfVxuXG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFTQSxHQUFDLE1BQU07QUFFSCxVQUFNLE9BQVEsT0FBTyxpQkFBaUIsY0FBYyxlQUFlO0FBQ25FLFVBQU0sS0FBTSxLQUFLLEtBQUssS0FBSyxNQUFNLENBQUM7QUFDbEMsVUFBTSxPQUFRLEdBQUcsT0FBTyxHQUFHLFFBQVEsQ0FBQztBQUtwQyxTQUFLLE9BQU8sS0FBSyxRQUFRO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFJckIsTUFBTSxTQUFTO0FBQ1gsWUFBSTtBQUNBLGNBQUksS0FBSyxVQUFVLE9BQVEsUUFBTyxNQUFNLEtBQUssU0FBUyxPQUFPO0FBQzdELGNBQUksS0FBSyxTQUFTLE9BQVEsUUFBTyxNQUFNLEtBQUssUUFBUSxPQUFPO0FBQUEsUUFDL0QsUUFBUTtBQUFBLFFBQWtCO0FBQzFCLGVBQU87QUFBQSxNQUNYO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQU1BLE1BQU0sY0FBYyxJQUFJO0FBQ3BCLFlBQUksTUFBTSxNQUFNLEtBQUssS0FBSyxPQUFPO0FBQ2pDLFlBQUksQ0FBQyxLQUFLO0FBQ04sY0FBSTtBQUNBLGdCQUFJLEtBQUssVUFBVSxTQUFTO0FBQ3hCLG9CQUFNLEtBQUssU0FBUyxRQUFRO0FBQzVCLG9CQUFNLE1BQU0sS0FBSyxLQUFLLE9BQU87QUFBQSxZQUNqQyxXQUFXLEtBQUssU0FBUyxTQUFTO0FBQzlCLG9CQUFNLEtBQUssUUFBUSxRQUFRO0FBQzNCLG9CQUFNLE1BQU0sS0FBSyxLQUFLLE9BQU87QUFBQSxZQUNqQztBQUFBLFVBQ0osUUFBUTtBQUFBLFVBQWtCO0FBQUEsUUFDOUI7QUFDQSxlQUFPLEdBQUcsT0FBTyxNQUFTO0FBQUEsTUFDOUI7QUFBQSxJQUNKO0FBTUEsU0FBSyxPQUFPLEtBQUssUUFBUTtBQUFB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LFNBQVMsZUFBZSxLQUFLO0FBQ3ZDLGNBQUksQ0FBQyxLQUFLO0FBQ04sa0JBQU0sU0FBUyxjQUFjLFFBQVE7QUFDckMsZ0JBQUksS0FBSztBQUFPLGdCQUFJLE9BQU87QUFBVSxnQkFBSSxZQUFZO0FBQ3JELGdCQUFJLFFBQVEsU0FBUztBQUFJLGdCQUFJLGNBQWMsU0FBUztBQUFJLGdCQUFJLE1BQU0sYUFBYTtBQUMvRSxnQkFBSSxpQkFBaUIsU0FBUyxDQUFDLE9BQU87QUFBRSxrQkFBSTtBQUFFLDBCQUFVLEVBQUU7QUFBQSxjQUFHLFFBQVE7QUFBQSxjQUFFO0FBQUEsWUFBRSxDQUFDO0FBQzFFLGlCQUFLLFlBQVksR0FBRztBQUFBLFVBQ3hCO0FBQ0EsaUJBQU87QUFBQSxRQUNYO0FBQ0EsaUJBQVMsWUFBWTtBQUFFLGdCQUFNLElBQUksU0FBUyxlQUFlLEtBQUs7QUFBRyxjQUFJLEVBQUcsS0FBSTtBQUFFLGNBQUUsT0FBTztBQUFBLFVBQUcsUUFBUTtBQUFBLFVBQUU7QUFBQSxRQUFFO0FBRXRHLHVCQUFlLGVBQWU7QUFBRSxnQkFBTSxPQUFPLGNBQWM7QUFBRyxjQUFJLEtBQU0sV0FBVTtBQUFBLGNBQVEsV0FBVTtBQUFBLFFBQUc7QUFFdkcsd0JBQWdCLFVBQVUsZ0JBQWdCLFdBQVcsQ0FBQztBQUN0RCxjQUFNLFFBQVEsZ0JBQWdCLFFBQVEsRUFBRSxNQUFNLEVBQUUsS0FBSyxNQUFNLFFBQVEsS0FBSztBQUV4RSxjQUFNLGFBQWE7QUFDbkIsWUFBSSxDQUFDLE1BQU0sS0FBSztBQUNaLGdCQUFNLE9BQU8sU0FBUyxjQUFjLHdCQUF3QixLQUFLLFNBQVM7QUFDMUUsY0FBSSxRQUFRLE9BQU8sa0JBQWtCO0FBQ2pDLGtCQUFNLE1BQU0sSUFBSSxpQkFBaUIsTUFBTTtBQUFFLDJCQUFhO0FBQUEsWUFBRyxDQUFDO0FBQzFELGtCQUFNLElBQUksUUFBUSxNQUFNLEVBQUUsU0FBUyxNQUFNLFlBQVksTUFBTSxXQUFXLEtBQUssQ0FBQztBQUFBLFVBQ2hGO0FBQUEsUUFDSjtBQUNBLFlBQUksQ0FBQyxNQUFNLFVBQVUsT0FBTyxTQUFTLGFBQWE7QUFDOUMsZ0JBQU0sU0FBUyxPQUFPLFFBQVEsWUFBWSxNQUFNO0FBQUUseUJBQWE7QUFBQSxVQUFHLENBQUM7QUFBQSxRQUN2RTtBQUNBLGVBQU87QUFBQSxNQUNYO0FBRUEsYUFBTyxFQUFFLHFCQUFxQixXQUFXLGNBQWMsY0FBYyxpQkFBaUIsUUFBUSxnQkFBZ0I7QUFBQSxJQUNsSCxHQUFHO0FBR0gsUUFBSTtBQUFFLFdBQUssTUFBTSxNQUFNO0FBQUEsSUFBRyxRQUFRO0FBQUEsSUFBRTtBQUFBLEVBRXhDLEdBQUc7IiwKICAibmFtZXMiOiBbIlJPT1QiLCAiaHViTm93IiwgImxpc3RJZHMiLCAiaXNQcmVzZW50IiwgImVuc3VyZVJlZyIsICJzdGF0ZSJdCn0K
