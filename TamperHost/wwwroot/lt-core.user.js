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
       * If a refresh hook exists we'll attempt it once.
       * Throws if no key is available after the refresh attempt.
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
        if (!key) throw new Error("No Plex API key configured. Use the TamperMonkey menu (\u2699\uFE0F Set Plex API Key) to set one.");
        return fn(key);
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
        api.notify = (_level, text, { ms = 5e3 } = {}) => {
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
        api.toast = (msg, ms = 5e3) => api.notify("info", msg, { ms });
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
          const ms = opts?.timeout ?? opts?.ms ?? 5e3;
          delegateOrQueue("notify", tone, text, { ms, sticky: !!opts?.sticky, toast: !!opts?.toast });
          if (!mounted && typeof ROOT.ensureLTHub !== "function") fallback.notify(text, tone, opts);
          return this;
        },
        toast(msg, timeout = 5e3) {
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
            success: (msg = "Done", ms = 5e3) => {
              this.setStatus("", "info", { sticky: false });
              this.notify(msg, "success", { timeout: ms });
              return ctl;
            },
            error: (msg = "Failed") => {
              this.setStatus("", "info", { sticky: false });
              this.notify(msg, "error", { timeout: 5e3 });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LWNvcmUudXNlci5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gPT1Vc2VyU2NyaXB0PT1cbi8vIEBuYW1lICAgICAgICAgbHQtY29yZVxuLy8gQG5hbWVzcGFjZSAgICBsdFxuLy8gQHZlcnNpb24gICAgICAyMDI2LjA1LjIxLjNcbi8vIEBkZXNjcmlwdGlvbiAgU2hhcmVkIGNvcmU6IGF1dGggKyBodHRwICsgcGxleCBEUyArIGh1YiAoc3RhdHVzL3RvYXN0KSArIHRoZW1lIGJyaWRnZSArIHRpbnkgdXRpbHNcbi8vIEBydW4tYXQgICAgICAgZG9jdW1lbnQtc3RhcnRcbi8vIEBncmFudCAgICAgICAgbm9uZVxuLy8gPT0vVXNlclNjcmlwdD09XG5cbigoKSA9PiB7XG4gICAgLy8gUHJlZmVyIHRoZSBwYWdlIGNvbnRleHQgaWYgYXZhaWxhYmxlIChzbyBnbG9iYWxzIGFyZSBzaGFyZWQgd2l0aCB0aGUgYXBwKVxuICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xuICAgIGNvbnN0IExUID0gKFJPT1QubHQgPSBST09ULmx0IHx8IHt9KTtcbiAgICBjb25zdCBjb3JlID0gKExULmNvcmUgPSBMVC5jb3JlIHx8IHt9KTtcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBBdXRoIChmcm9tIHlvdXIgcGxleC1hdXRoKVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBjb3JlLmF1dGggPSBjb3JlLmF1dGggfHwge1xuICAgICAgICAvKipcbiAgICAgICAgICogVHJ5IFBsZXhBdXRoIGZpcnN0LCB0aGVuIFBsZXhBUEk7IHJldHVybiBiZWFyZXIgdG9rZW4gc3RyaW5nIG9yIG51bGwuXG4gICAgICAgICAqL1xuICAgICAgICBhc3luYyBnZXRLZXkoKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGlmIChST09ULlBsZXhBdXRoPy5nZXRLZXkpIHJldHVybiBhd2FpdCBST09ULlBsZXhBdXRoLmdldEtleSgpO1xuICAgICAgICAgICAgICAgIGlmIChST09ULlBsZXhBUEk/LmdldEtleSkgcmV0dXJuIGF3YWl0IFJPT1QuUGxleEFQSS5nZXRLZXkoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJ1biBhIGZ1bmN0aW9uIGFmdGVyIGVuc3VyaW5nIHdlIGhhdmUgYW4gYXV0aCBrZXkuXG4gICAgICAgICAqIElmIGEgcmVmcmVzaCBob29rIGV4aXN0cyB3ZSdsbCBhdHRlbXB0IGl0IG9uY2UuXG4gICAgICAgICAqIFRocm93cyBpZiBubyBrZXkgaXMgYXZhaWxhYmxlIGFmdGVyIHRoZSByZWZyZXNoIGF0dGVtcHQuXG4gICAgICAgICAqL1xuICAgICAgICBhc3luYyB3aXRoRnJlc2hBdXRoKGZuKSB7XG4gICAgICAgICAgICBsZXQga2V5ID0gYXdhaXQgY29yZS5hdXRoLmdldEtleSgpO1xuICAgICAgICAgICAgaWYgKCFrZXkpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoUk9PVC5QbGV4QXV0aD8ucmVmcmVzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgUk9PVC5QbGV4QXV0aC5yZWZyZXNoKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSBhd2FpdCBjb3JlLmF1dGguZ2V0S2V5KCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoUk9PVC5QbGV4QVBJPy5yZWZyZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBST09ULlBsZXhBUEkucmVmcmVzaCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gYXdhaXQgY29yZS5hdXRoLmdldEtleSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWtleSkgdGhyb3cgbmV3IEVycm9yKCdObyBQbGV4IEFQSSBrZXkgY29uZmlndXJlZC4gVXNlIHRoZSBUYW1wZXJNb25rZXkgbWVudSAoXHUyNjk5XHVGRTBGIFNldCBQbGV4IEFQSSBLZXkpIHRvIHNldCBvbmUuJyk7XG4gICAgICAgICAgICByZXR1cm4gZm4oa2V5KTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gSFRUUFxuICAgIC8vIERlbGVnYXRlcyB0byBUTVV0aWxzLmZldGNoRGF0YSB3aGVuIGF2YWlsYWJsZTsgZmFsbHMgYmFjayB0byBmZXRjaCgpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUuaHR0cCA9IGNvcmUuaHR0cCB8fCB7XG4gICAgICAgIGFzeW5jIGZldGNoKHVybCwgeyBtZXRob2QgPSAnR0VUJywgaGVhZGVycyA9IHt9LCBib2R5LCB0aW1lb3V0TXMgPSAxNTAwMCwgdXNlWEhSID0gZmFsc2UgfSA9IHt9KSB7XG4gICAgICAgICAgICBpZiAoUk9PVC5UTVV0aWxzPy5mZXRjaERhdGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgUk9PVC5UTVV0aWxzLmZldGNoRGF0YSh1cmwsIHsgbWV0aG9kLCBoZWFkZXJzLCBib2R5LCB0aW1lb3V0TXMsIHVzZVhIUiB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IG5hdGl2ZSBmZXRjaCB3aXRoIEF1dGhvcml6YXRpb24gKGZyb20gcGxleC1hdXRoKVxuICAgICAgICAgICAgY29uc3Qga2V5ID0gYXdhaXQgY29yZS5hdXRoLmdldEtleSgpO1xuICAgICAgICAgICAgY29uc3QgaCA9IG5ldyBIZWFkZXJzKGhlYWRlcnMgfHwge30pO1xuICAgICAgICAgICAgaWYgKGtleSAmJiAhaC5oYXMoJ0F1dGhvcml6YXRpb24nKSkgaC5zZXQoJ0F1dGhvcml6YXRpb24nLCBgQmVhcmVyICR7a2V5fWApO1xuICAgICAgICAgICAgaWYgKGJvZHkgJiYgIWguaGFzKCdDb250ZW50LVR5cGUnKSkgaC5zZXQoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGN0bCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICAgICAgICAgIGNvbnN0IHQgPSBzZXRUaW1lb3V0KCgpID0+IGN0bC5hYm9ydCgpLCB0aW1lb3V0TXMpO1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHVybCwge1xuICAgICAgICAgICAgICAgICAgICBtZXRob2QsXG4gICAgICAgICAgICAgICAgICAgIGhlYWRlcnM6IGgsXG4gICAgICAgICAgICAgICAgICAgIGJvZHk6IGJvZHkgJiYgdHlwZW9mIGJvZHkgIT09ICdzdHJpbmcnID8gSlNPTi5zdHJpbmdpZnkoYm9keSkgOiBib2R5LFxuICAgICAgICAgICAgICAgICAgICBzaWduYWw6IGN0bC5zaWduYWwsXG4gICAgICAgICAgICAgICAgICAgIGNyZWRlbnRpYWxzOiAnaW5jbHVkZSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBjdCA9IHJlcy5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJykgfHwgJyc7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGN0LmluY2x1ZGVzKCdhcHBsaWNhdGlvbi9qc29uJykgPyBhd2FpdCByZXMuanNvbigpIDogYXdhaXQgcmVzLnRleHQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzLnN0YXR1c30gJHtyZXMuc3RhdHVzVGV4dH1gKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZGF0YTtcbiAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGFzeW5jIGdldCh1cmwsIG9wdHMgPSB7fSkgeyByZXR1cm4gdGhpcy5mZXRjaCh1cmwsIHsgLi4uKG9wdHMgfHwge30pLCBtZXRob2Q6ICdHRVQnIH0pOyB9LFxuICAgICAgICBhc3luYyBwb3N0KHVybCwgYm9keSwgb3B0cyA9IHt9KSB7IHJldHVybiB0aGlzLmZldGNoKHVybCwgeyAuLi4ob3B0cyB8fCB7fSksIG1ldGhvZDogJ1BPU1QnLCBib2R5IH0pOyB9XG4gICAgfTtcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gUGxleCBEUyBoZWxwZXJzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBjb3JlLnBsZXggPSBjb3JlLnBsZXggfHwge1xuICAgICAgICBhc3luYyBkcyhzb3VyY2VJZCwgcGF5bG9hZCA9IHt9LCBvcHRzID0ge30pIHtcbiAgICAgICAgICAgIGlmIChST09ULlRNVXRpbHM/LmRzKSByZXR1cm4gYXdhaXQgUk9PVC5UTVV0aWxzLmRzKHNvdXJjZUlkLCBwYXlsb2FkLCBvcHRzKTtcblxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IGRpcmVjdCBQT1NUIHRvIERTIGVuZHBvaW50IChmb3JtYXQ9MiBcdTIxOTIgcm93cyBpbiBhcnJheSlcbiAgICAgICAgICAgIGNvbnN0IGJhc2UgPSBsb2NhdGlvbi5vcmlnaW4ucmVwbGFjZSgvXFwvJC8sICcnKTtcbiAgICAgICAgICAgIGNvbnN0IHVybCA9IGAke2Jhc2V9L2FwaS9kYXRhc291cmNlcy8ke3NvdXJjZUlkfS9leGVjdXRlP2Zvcm1hdD0yYDtcbiAgICAgICAgICAgIGNvbnN0IGpzb24gPSBhd2FpdCBjb3JlLmh0dHAucG9zdCh1cmwsIHBheWxvYWQsIG9wdHMpO1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IEFycmF5LmlzQXJyYXkoanNvbj8ucm93cykgPyBqc29uLnJvd3MgOiBbXTtcbiAgICAgICAgICAgIHJldHVybiB7IC4uLmpzb24sIHJvd3MgfTtcbiAgICAgICAgfSxcblxuICAgICAgICBhc3luYyBkc1Jvd3Moc291cmNlSWQsIHBheWxvYWQgPSB7fSwgb3B0cyA9IHt9KSB7XG4gICAgICAgICAgICBpZiAoUk9PVC5UTVV0aWxzPy5kc1Jvd3MpIHJldHVybiBhd2FpdCBST09ULlRNVXRpbHMuZHNSb3dzKHNvdXJjZUlkLCBwYXlsb2FkLCBvcHRzKTtcbiAgICAgICAgICAgIGNvbnN0IHsgcm93cyB9ID0gYXdhaXQgdGhpcy5kcyhzb3VyY2VJZCwgcGF5bG9hZCwgb3B0cyk7XG4gICAgICAgICAgICByZXR1cm4gcm93cztcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tIEh1YiBmYWNhZGUgKHByZWZlcnMgbHQtdWktaHViOyBtb3VudHMgb24gZmlyc3QgdXNlKSAtLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS5odWIgPSBjb3JlLmh1YiB8fCAoKCkgPT4ge1xuICAgICAgICAvLyAtLS0gc21hbGwgcGlsbCBmYWxsYmFjayAodXNlZCBvbmx5IGlmIGx0LXVpLWh1YiBtaXNzaW5nKSAtLS1cbiAgICAgICAgY29uc3QgZmFsbGJhY2sgPSAoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYXBpID0ge307XG4gICAgICAgICAgICBhcGkuX3N0aWNreSA9IGZhbHNlO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBlbnN1cmVQaWxsKCkge1xuICAgICAgICAgICAgICAgIGxldCBwaWxsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2x0LWh1Yi1waWxsJyk7XG4gICAgICAgICAgICAgICAgaWYgKCFwaWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHBpbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgICAgICAgICAgcGlsbC5pZCA9ICdsdC1odWItcGlsbCc7XG4gICAgICAgICAgICAgICAgICAgIHBpbGwuc3R5bGUuY3NzVGV4dCA9IGBcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvcDogMTBweDsgcmlnaHQ6IDEwcHg7XG4gICAgICAgICAgICAgICAgICAgICAgICB6LWluZGV4OiAyMTQ3NDgzMDAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgwLDAsMCwuOCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogI2ZmZjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbnQ6IDEzcHggc3lzdGVtLXVpLCAtYXBwbGUtc3lzdGVtLCBTZWdvZSBVSSwgUm9ib3RvLCBzYW5zLXNlcmlmO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogNnB4IDEwcHg7IGJvcmRlci1yYWRpdXM6IDk5OXB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgYm94LXNoYWRvdzogMCA4cHggMjRweCByZ2JhKDAsMCwwLDAuMjUpO1xuICAgICAgICAgICAgICAgICAgICBgO1xuICAgICAgICAgICAgICAgICAgICBwaWxsLnRleHRDb250ZW50ID0gJ1x1MjAyNic7XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5hcHBlbmRDaGlsZChwaWxsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBpbGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGFwaS5zZXRTdGF0dXMgPSAodGV4dCwgdG9uZSA9ICdpbmZvJywgeyBzdGlja3kgPSBmYWxzZSB9ID0ge30pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbCA9IGVuc3VyZVBpbGwoKTtcbiAgICAgICAgICAgICAgICBlbC50ZXh0Q29udGVudCA9IHRleHQgfHwgJyc7XG4gICAgICAgICAgICAgICAgYXBpLl9zdGlja3kgPSAhIXN0aWNreTtcbiAgICAgICAgICAgICAgICBpZiAoIWFwaS5fc3RpY2t5KSBzZXRUaW1lb3V0KCgpID0+IHsgdHJ5IHsgZWwucmVtb3ZlKCk7IH0gY2F0Y2ggeyB9IH0sIDIwMDApO1xuICAgICAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBhcGkubm90aWZ5ID0gKF9sZXZlbCwgdGV4dCwgeyBtcyA9IDUwMDAgfSA9IHt9KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZWwgPSBlbnN1cmVQaWxsKCk7XG4gICAgICAgICAgICAgICAgZWwudGV4dENvbnRlbnQgPSB0ZXh0IHx8ICcnO1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyB0cnkgeyBlbC5yZW1vdmUoKTsgfSBjYXRjaCB7IH0gfSwgTWF0aC5tYXgoNTAwLCBtcyB8IDApKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgYXBpLnRvYXN0ID0gKG1zZywgbXMgPSA1MDAwKSA9PiBhcGkubm90aWZ5KCdpbmZvJywgbXNnLCB7IG1zIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgICB9KSgpO1xuXG4gICAgICAgIC8vIC0tLSBxdWV1ZSB1bnRpbCBsdC11aS1odWIgbW91bnRzIC0tLVxuICAgICAgICBsZXQgbW91bnRlZCA9IGZhbHNlO1xuICAgICAgICBsZXQgbW91bnRpbmcgPSBudWxsOyAgICAgICAgICAgICAgIC8vIFByb21pc2VcbiAgICAgICAgY29uc3QgcXVldWUgPSBbXTsgICAgICAgICAgICAgICAgICAvLyBbe2ZuLCBhcmdzfV1cblxuICAgICAgICBhc3luYyBmdW5jdGlvbiBtb3VudFVpSHViT25jZSgpIHtcbiAgICAgICAgICAgIGlmIChtb3VudGVkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGlmIChtb3VudGluZykgcmV0dXJuIG1vdW50aW5nO1xuXG4gICAgICAgICAgICBtb3VudGluZyA9IChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgZW5zdXJlTFRIdWIgaXMgYXZhaWxhYmxlLCBtb3VudCB0aGUgZnVsbC13aWR0aCBiYXJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZW5zdXJlRm4gPVxuICAgICAgICAgICAgICAgICAgICAgICAgKHR5cGVvZiBlbnN1cmVMVEh1YiA9PT0gJ2Z1bmN0aW9uJykgPyBlbnN1cmVMVEh1YiA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKHR5cGVvZiBST09ULmVuc3VyZUxUSHViID09PSAnZnVuY3Rpb24nID8gUk9PVC5lbnN1cmVMVEh1YiA6IG51bGwpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChlbnN1cmVGbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgZW5zdXJlRm4oe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoZW1lOiB7IG5hbWU6ICdPbmVNb25yb2UnIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZGVmYXVsdCB0byBib2R5OyBob25vciBhbnkgZWFybGllciBzZWxlY3Rpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb3VudDogKFJPT1QuX19MVF9IVUJfTU9VTlQgfHwgJ25hdicpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhZ2VSb290U2VsZWN0b3JzOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICcjcGxleFNpZGV0YWJzTWVudVBhZ2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnLnBsZXgtc2lkZXRhYnMtbWVudS1wYWdlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50LWNvbnRhaW5lcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICcucGxleC1hY3Rpb25zLXdyYXBwZXInXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB3aGVuIGxpdmluZyBpbiB0aGUgbmF2YmFyIHdlIG5ldmVyIHdhbnQgdG8gYWx0ZXIgcGFnZSBsYXlvdXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGljazogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2FwOiA4XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGh1Yk9iaiA9ICh0eXBlb2YgbHRVSUh1YiAhPT0gJ3VuZGVmaW5lZCcpID8gbHRVSUh1YiA6IFJPT1QubHRVSUh1YjtcbiAgICAgICAgICAgICAgICAgICAgbW91bnRlZCA9ICEhaHViT2JqO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbW91bnRlZDtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgbW91bnRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZmx1c2ggcXVldWVkIGNhbGxzIHRocm91Z2ggZWl0aGVyIHVpLWh1YiAoaWYgbW91bnRlZCkgb3IgZmFsbGJhY2tcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaHViID0gbW91bnRlZCA/IFJPT1QubHRVSUh1YiA6IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgeyBmbiwgYXJncyB9IG9mIHF1ZXVlLnNwbGljZSgwKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaHViICYmIHR5cGVvZiBodWJbZm5dID09PSAnZnVuY3Rpb24nKSBodWJbZm5dKC4uLmFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgZmFsbGJhY2tbZm5dKC4uLmFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KSgpO1xuXG4gICAgICAgICAgICByZXR1cm4gbW91bnRpbmc7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBkZWxlZ2F0ZU9yUXVldWUoZm4sIC4uLmFyZ3MpIHtcbiAgICAgICAgICAgIC8vIElmIGx0LXVpLWh1YiBpcyBhbHJlYWR5IG1vdW50ZWQsIGRlbGVnYXRlIGltbWVkaWF0ZWx5XG4gICAgICAgICAgICBjb25zdCBodWJOb3cgPSBtb3VudGVkXG4gICAgICAgICAgICAgICAgPyAoKHR5cGVvZiBsdFVJSHViICE9PSAndW5kZWZpbmVkJykgPyBsdFVJSHViIDogUk9PVC5sdFVJSHViKVxuICAgICAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICAgICAgaWYgKGh1Yk5vdyAmJiB0eXBlb2YgaHViTm93W2ZuXSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIHRyeSB7IGh1Yk5vd1tmbl0oLi4uYXJncyk7IH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSWYgd2UgY2FuIG1vdW50IChzYW5kYm94IG9yIHdpbmRvdyksIHF1ZXVlIGFuZCBraWNrIGl0IG9mZlxuICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmVMVEh1YiA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgUk9PVC5lbnN1cmVMVEh1YiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIHF1ZXVlLnB1c2goeyBmbiwgYXJncyB9KTtcbiAgICAgICAgICAgICAgICBtb3VudFVpSHViT25jZSgpOyAgLy8gZmlyZSAmIGZvcmdldFxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTm8gdWktaHViIGF2YWlsYWJsZSBcdTIxOTIgZmFsbGJhY2sgaW1tZWRpYXRlbHlcbiAgICAgICAgICAgIGZhbGxiYWNrW2ZuXSguLi5hcmdzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFB1YmxpYyBBUEkgKHN5bmMgbG9va2luZzsgaW50ZXJuYWxseSBxdWV1ZXMvZGVsZWdhdGVzKVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc2V0U3RhdHVzKHRleHQsIHRvbmUgPSAnaW5mbycsIG9wdHMgPSB7fSkgeyBkZWxlZ2F0ZU9yUXVldWUoJ3NldFN0YXR1cycsIHRleHQsIHRvbmUsIG9wdHMpOyByZXR1cm4gdGhpczsgfSxcblxuICAgICAgICAgICAgbm90aWZ5KHRleHQsIHRvbmUgPSAnaW5mbycsIG9wdHMgPSB7fSkge1xuICAgICAgICAgICAgICAgIC8vIGx0LXVpLWh1YiBzaWduYXR1cmU6IG5vdGlmeShraW5kLCB0ZXh0LCB7bXMsIHN0aWNreSwgdG9hc3R9KVxuICAgICAgICAgICAgICAgIGNvbnN0IG1zID0gb3B0cz8udGltZW91dCA/PyBvcHRzPy5tcyA/PyA1MDAwO1xuICAgICAgICAgICAgICAgIGRlbGVnYXRlT3JRdWV1ZSgnbm90aWZ5JywgdG9uZSwgdGV4dCwgeyBtcywgc3RpY2t5OiAhIW9wdHM/LnN0aWNreSwgdG9hc3Q6ICEhb3B0cz8udG9hc3QgfSk7XG4gICAgICAgICAgICAgICAgaWYgKCFtb3VudGVkICYmIHR5cGVvZiBST09ULmVuc3VyZUxUSHViICE9PSAnZnVuY3Rpb24nKSBmYWxsYmFjay5ub3RpZnkodGV4dCwgdG9uZSwgb3B0cyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdG9hc3QobXNnLCB0aW1lb3V0ID0gNTAwMCkge1xuICAgICAgICAgICAgICAgIGRlbGVnYXRlT3JRdWV1ZSgnbm90aWZ5JywgJ2luZm8nLCBtc2csIHsgbXM6IHRpbWVvdXQsIHRvYXN0OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgIGlmICghbW91bnRlZCAmJiB0eXBlb2YgUk9PVC5lbnN1cmVMVEh1YiAhPT0gJ2Z1bmN0aW9uJykgZmFsbGJhY2sudG9hc3QobXNnLCB0aW1lb3V0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB1cGRhdGVCdXR0b24oaWQsIHBhdGNoID0ge30pIHtcbiAgICAgICAgICAgICAgICBkZWxlZ2F0ZU9yUXVldWUoJ3VwZGF0ZUJ1dHRvbicsIGlkLCBwYXRjaCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYmVnaW5UYXNrKGxhYmVsLCB0b25lID0gJ2luZm8nKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1vdW50ZWQgJiYgUk9PVC5sdFVJSHViPy5iZWdpblRhc2spIHJldHVybiBST09ULmx0VUlIdWIuYmVnaW5UYXNrKGxhYmVsLCB0b25lKTtcbiAgICAgICAgICAgICAgICAvLyBxdWV1ZSBhIHN5bnRoZXRpYyBiZWdpblRhc2sgdXNpbmcgc3RhdHVzICsgc3VjY2Vzcy9lcnJvciBoZWxwZXJzXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0dXMobGFiZWwsIHRvbmUsIHsgc3RpY2t5OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGN0bCA9IHtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlOiAodHh0LCB0ID0gdG9uZSkgPT4geyB0aGlzLnNldFN0YXR1cyh0eHQsIHQsIHsgc3RpY2t5OiB0cnVlIH0pOyByZXR1cm4gY3RsOyB9LFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiAobXNnID0gJ0RvbmUnLCBtcyA9IDUwMDApID0+IHsgdGhpcy5zZXRTdGF0dXMoJycsICdpbmZvJywgeyBzdGlja3k6IGZhbHNlIH0pOyB0aGlzLm5vdGlmeShtc2csICdzdWNjZXNzJywgeyB0aW1lb3V0OiBtcyB9KTsgcmV0dXJuIGN0bDsgfSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IChtc2cgPSAnRmFpbGVkJykgPT4geyB0aGlzLnNldFN0YXR1cygnJywgJ2luZm8nLCB7IHN0aWNreTogZmFsc2UgfSk7IHRoaXMubm90aWZ5KG1zZywgJ2Vycm9yJywgeyB0aW1lb3V0OiA1MDAwIH0pOyByZXR1cm4gY3RsOyB9LFxuICAgICAgICAgICAgICAgICAgICBjbGVhcjogKCkgPT4geyB0aGlzLnNldFN0YXR1cygnJywgJ2luZm8nLCB7IHN0aWNreTogZmFsc2UgfSk7IHJldHVybiBjdGw7IH0sXG4gICAgICAgICAgICAgICAgICAgIGRvbmU6IChtc2csIG1zKSA9PiBjdGwuc3VjY2Vzcyhtc2csIG1zKVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgLy8gdHJ5IHRvIHVwZ3JhZGUgdG8gbHQtdWktaHViIHJlYWwgdGFzayBhZnRlciBtb3VudFxuICAgICAgICAgICAgICAgIG1vdW50VWlIdWJPbmNlKCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGh1Yk5vdyA9ICh0eXBlb2YgbHRVSUh1YiAhPT0gJ3VuZGVmaW5lZCcpID8gbHRVSUh1YiA6IFJPT1QubHRVSUh1YjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGh1Yk5vdz8uYmVnaW5UYXNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkgeyBodWJOb3cuYmVnaW5UYXNrKGxhYmVsLCB0b25lKTsgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY3RsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH0pKCk7XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gVGhlbWUgYnJpZGdlIChAcmVzb3VyY2UgVEhFTUVfQ1NTIFx1MjE5MiBHTV9hZGRTdHlsZSlcbiAgICAvLyBHcmFudHMgYXJlIGV4cGVjdGVkIGluIHRoZSBwYXJlbnQgKGVudHJ5KSBiYW5uZXI7IHRoaXMgaXMgc2FmZSBuby1vcC5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS50aGVtZSA9IGNvcmUudGhlbWUgfHwge1xuICAgICAgICBhcHBseSgpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gT25seSBtYWluIHNjcmlwdCdzIEBncmFudCBtYXR0ZXJzOyBAcmVxdWlyZSBtZXRhZGF0YSBpcyBpZ25vcmVkIGJ5IFRNXG4gICAgICAgICAgICAgICAgY29uc3QgY3NzID0gKHR5cGVvZiBHTV9nZXRSZXNvdXJjZVRleHQgPT09ICdmdW5jdGlvbicpID8gR01fZ2V0UmVzb3VyY2VUZXh0KCdUSEVNRV9DU1MnKSA6ICcnO1xuICAgICAgICAgICAgICAgIGlmIChjc3MgJiYgdHlwZW9mIEdNX2FkZFN0eWxlID09PSAnZnVuY3Rpb24nKSBHTV9hZGRTdHlsZShjc3MpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHRyeSB7IGNvbnNvbGUud2FybignW2x0LWNvcmVdIHRoZW1lLmFwcGx5IGZhaWxlZCcsIGUpOyB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gU21hbGwgdXRpbGl0aWVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUudXRpbCA9IGNvcmUudXRpbCB8fCB7XG4gICAgICAgIHNsZWVwKG1zKSB7IHJldHVybiBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgTWF0aC5tYXgoMCwgbXMgfCAwKSkpOyB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSdW4gYSBmdW5jdGlvbiBvbmx5IG9uY2UgcGVyIGtleSAocGVyIHBhZ2UgbG9hZCkuXG4gICAgICAgICAqL1xuICAgICAgICBvbmNlKGtleSwgZm4pIHtcbiAgICAgICAgICAgIGNvbnN0IHN0b3JlID0gKGNvcmUuX19vbmNlID0gY29yZS5fX29uY2UgfHwgbmV3IFNldCgpKTtcbiAgICAgICAgICAgIGlmIChzdG9yZS5oYXMoa2V5KSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHN0b3JlLmFkZChrZXkpO1xuICAgICAgICAgICAgcmV0dXJuIGZuKCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIERhdGEgKGludGVudGlvbmFsbHkgYmxhbmsgaW4gY29yZSlcbiAgICAvLyBEbyBOT1QgZGVmaW5lIGNvcmUuZGF0YSBoZXJlOyBsdC1kYXRhLWNvcmUgLyB5b3VyIHJlcG9zIGF1Z21lbnQgaXQuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBRVCBoZWxwZXJzOiByZXBvcyArIHByb21vdGlvbiArIHF1b3RlIGNvbnRleHQgKyBodWIgYnV0dG9uXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS5xdCA9IGNvcmUucXQgfHwgKCgpID0+IHtcbiAgICAgICAgY29uc3QgUk9PVCA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJykgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3c7XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0VGFiU2NvcGVJZChucyA9ICdRVCcpIHtcbiAgICAgICAgICAgIHRyeSB7IGlmICh0eXBlb2YgUk9PVC5nZXRUYWJTY29wZUlkID09PSAnZnVuY3Rpb24nKSByZXR1cm4gUk9PVC5nZXRUYWJTY29wZUlkKG5zKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RvcmFnZSA9IFJPT1Quc2Vzc2lvblN0b3JhZ2U7XG4gICAgICAgICAgICAgICAgY29uc3QgSyA9IGBsdDoke25zfTpfX3Njb3BlSWRgO1xuICAgICAgICAgICAgICAgIGxldCB2ID0gc3RvcmFnZS5nZXRJdGVtKEspO1xuICAgICAgICAgICAgICAgIGlmICghdikge1xuICAgICAgICAgICAgICAgICAgICB2ID0gU3RyaW5nKE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDIxNDc0ODM2NDcpKTtcbiAgICAgICAgICAgICAgICAgICAgc3RvcmFnZS5zZXRJdGVtKEssIHYpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBuID0gTnVtYmVyKHYpO1xuICAgICAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pIHx8IG4gPD0gMCkgdGhyb3cgbmV3IEVycm9yKCdiYWQgc2NvcGUnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9ICdfX0xUX1FUX1NDT1BFX0lEX18nO1xuICAgICAgICAgICAgICAgIGlmICghUk9PVFtrZXldKSBST09UW2tleV0gPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAyMTQ3NDgzNjQ3KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gUk9PVFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0UVRGKCkge1xuICAgICAgICAgICAgY29uc3QgbWFrZSA9IFJPT1QubHQ/LmNvcmU/LmRhdGE/Lm1ha2VGbGF0U2NvcGVkUmVwbztcbiAgICAgICAgICAgIHJldHVybiAodHlwZW9mIG1ha2UgPT09ICdmdW5jdGlvbicpID8gbWFrZSh7IG5zOiAnUVQnLCBlbnRpdHk6ICdxdW90ZScsIGxlZ2FjeUVudGl0eTogJ1F1b3RlSGVhZGVyJyB9KSA6IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBhc3luYyBmdW5jdGlvbiB1c2VEcmFmdFJlcG8oKSB7XG4gICAgICAgICAgICBjb25zdCBRVEYgPSBnZXRRVEYoKTtcbiAgICAgICAgICAgIGlmICghUVRGKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShnZXRUYWJTY29wZUlkKCdRVCcpKTtcbiAgICAgICAgICAgIHJldHVybiByZXBvIHx8IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBhc3luYyBmdW5jdGlvbiB1c2VRdW90ZVJlcG8ocWspIHtcbiAgICAgICAgICAgIGNvbnN0IFFURiA9IGdldFFURigpO1xuICAgICAgICAgICAgaWYgKCFRVEYgfHwgIXFrIHx8ICFOdW1iZXIuaXNGaW5pdGUocWspIHx8IHFrIDw9IDApIHJldHVybiBudWxsO1xuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSBRVEYudXNlKE51bWJlcihxaykpO1xuICAgICAgICAgICAgcmV0dXJuIHJlcG8gfHwgbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIC0tLS0tLS0tLS0gUHJvbW90aW9uIChBKSAtLS0tLS0tLS0tXG4gICAgICAgIGZ1bmN0aW9uIG5lZWRzTWVyZ2UoY3VycmVudCA9IHt9LCBkcmFmdCA9IHt9KSB7XG4gICAgICAgICAgICBjb25zdCBjdXJVcGQgPSBOdW1iZXIoY3VycmVudC5VcGRhdGVkX0F0ID8/IDApO1xuICAgICAgICAgICAgY29uc3QgZFVwZCA9IE51bWJlcihkcmFmdD8uVXBkYXRlZF9BdCA/PyAwKTtcbiAgICAgICAgICAgIGNvbnN0IGN1ckN1c3QgPSBTdHJpbmcoY3VycmVudC5DdXN0b21lcl9ObyA/PyAnJyk7XG4gICAgICAgICAgICBjb25zdCBuZXdDdXN0ID0gU3RyaW5nKGRyYWZ0Py5DdXN0b21lcl9ObyA/PyAnJyk7XG4gICAgICAgICAgICBjb25zdCBrZXlDaGFuZ2VkID0gU3RyaW5nKGN1cnJlbnQuQ2F0YWxvZ19LZXkgPz8gJycpICE9PSBTdHJpbmcoZHJhZnQ/LkNhdGFsb2dfS2V5ID8/ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IGNvZGVDaGFuZ2VkID0gU3RyaW5nKGN1cnJlbnQuQ2F0YWxvZ19Db2RlID8/ICcnKSAhPT0gU3RyaW5nKGRyYWZ0Py5DYXRhbG9nX0NvZGUgPz8gJycpO1xuICAgICAgICAgICAgcmV0dXJuIChkVXBkID4gY3VyVXBkKSB8fCBrZXlDaGFuZ2VkIHx8IGNvZGVDaGFuZ2VkIHx8IChjdXJDdXN0ICE9PSBuZXdDdXN0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFzeW5jIGZ1bmN0aW9uIG1lcmdlT25jZShxaykge1xuICAgICAgICAgICAgY29uc3QgZHJhZnRSZXBvID0gYXdhaXQgdXNlRHJhZnRSZXBvKCk7XG4gICAgICAgICAgICBpZiAoIWRyYWZ0UmVwbykgcmV0dXJuICduby1kYyc7XG4gICAgICAgICAgICBsZXQgZHJhZnQgPSAoYXdhaXQgZHJhZnRSZXBvLmdldEhlYWRlcj8uKCkpIHx8IChhd2FpdCBkcmFmdFJlcG8uZ2V0Py4oKSk7XG5cbiAgICAgICAgICAgIC8vIElmIGVtcHR5LCB0cnkgbGVnYWN5IFwiZHJhZnRcIiBzY29wZSBhbmQgbWlncmF0ZSBpdCBmb3J3YXJkXG4gICAgICAgICAgICBpZiAoIWRyYWZ0IHx8ICFPYmplY3Qua2V5cyhkcmFmdCkubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeyByZXBvOiBsZWdhY3kgfSA9IGdldFFURigpLnVzZSgnZHJhZnQnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGVnYWN5RHJhZnQgPSAoYXdhaXQgbGVnYWN5LmdldEhlYWRlcj8uKCkpIHx8IChhd2FpdCBsZWdhY3kuZ2V0Py4oKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChsZWdhY3lEcmFmdCAmJiBPYmplY3Qua2V5cyhsZWdhY3lEcmFmdCkubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBkcmFmdFJlcG8ucGF0Y2hIZWFkZXI/LihsZWdhY3lEcmFmdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkcmFmdCA9IGxlZ2FjeURyYWZ0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghZHJhZnQgfHwgIU9iamVjdC5rZXlzKGRyYWZ0KS5sZW5ndGgpIHJldHVybiAnbm8tZHJhZnQnO1xuXG4gICAgICAgICAgICBjb25zdCBxdW90ZVJlcG8gPSBhd2FpdCB1c2VRdW90ZVJlcG8ocWspO1xuICAgICAgICAgICAgaWYgKCFxdW90ZVJlcG8pIHJldHVybiAnbm8tcXVvdGUnO1xuXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gKGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXI/LigpKSB8fCB7fTtcbiAgICAgICAgICAgIGlmICghbmVlZHNNZXJnZShjdXJyZW50LCBkcmFmdCkpIHJldHVybiAnbm9vcCc7XG5cbiAgICAgICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcj8uKHtcbiAgICAgICAgICAgICAgICAuLi5kcmFmdCxcbiAgICAgICAgICAgICAgICBRdW90ZV9LZXk6IE51bWJlcihxayksXG4gICAgICAgICAgICAgICAgUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQ6IERhdGUubm93KCksXG4gICAgICAgICAgICAgICAgUHJvbW90ZWRfRnJvbTogJ2RyYWZ0JyxcbiAgICAgICAgICAgICAgICBQcm9tb3RlZF9BdDogRGF0ZS5ub3coKVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRyeSB7IGF3YWl0IGRyYWZ0UmVwby5jbGVhcj8uKCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB0cnkgeyBjb25zdCB7IHJlcG86IGxlZ2FjeSB9ID0gZ2V0UVRGKCkudXNlKCdkcmFmdCcpOyBhd2FpdCBsZWdhY3kuY2xlYXI/LigpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgcmV0dXJuICdtZXJnZWQnO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgUkVUUlkgPSB7IHRpbWVyOiBudWxsLCB0cmllczogMCwgbWF4OiAyMCwgbXM6IDI1MCB9O1xuICAgICAgICBmdW5jdGlvbiBzdG9wUmV0cnkoKSB7IGlmIChSRVRSWS50aW1lcikgY2xlYXJJbnRlcnZhbChSRVRSWS50aW1lcik7IFJFVFJZLnRpbWVyID0gbnVsbDsgUkVUUlkudHJpZXMgPSAwOyB9XG4gICAgICAgIGZ1bmN0aW9uIHByb21vdGVEcmFmdFRvUXVvdGUoeyBxaywgc3RyYXRlZ3kgPSAnb25jZScgfSA9IHt9KSB7XG4gICAgICAgICAgICBpZiAoc3RyYXRlZ3kgPT09ICdyZXRyeScpIHtcbiAgICAgICAgICAgICAgICBzdG9wUmV0cnkoKTtcbiAgICAgICAgICAgICAgICBSRVRSWS50aW1lciA9IHNldEludGVydmFsKGFzeW5jICgpID0+IHsgUkVUUlkudHJpZXMrKzsgY29uc3QgcmVzID0gYXdhaXQgbWVyZ2VPbmNlKHFrKTsgaWYgKHJlcyA9PT0gJ21lcmdlZCcgfHwgUkVUUlkudHJpZXMgPj0gUkVUUlkubWF4KSBzdG9wUmV0cnkoKTsgfSwgUkVUUlkubXMpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtZXJnZU9uY2UocWspO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gLS0tLS0tLS0tLSBRdW90ZSBDb250ZXh0IChCKSAtLS0tLS0tLS0tXG4gICAgICAgIGZ1bmN0aW9uIGdldE51bWJlcih2KSB7IGNvbnN0IG4gPSBOdW1iZXIodik7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUobikgPyBuIDogMDsgfVxuICAgICAgICBmdW5jdGlvbiBmcm9tVXJsKCkgeyB0cnkgeyBjb25zdCB1ID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTsgcmV0dXJuIHsgcXVvdGVLZXk6IGdldE51bWJlcih1LnNlYXJjaFBhcmFtcy5nZXQoJ1F1b3RlS2V5JykgfHwgdS5zZWFyY2hQYXJhbXMuZ2V0KCdxdW90ZUtleScpKSB9OyB9IGNhdGNoIHsgcmV0dXJuIHsgcXVvdGVLZXk6IDAgfTsgfSB9XG4gICAgICAgIGZ1bmN0aW9uIGZyb21Eb20oKSB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXF1b3RlLWtleV0sI1F1b3RlS2V5LFtuYW1lPVwiUXVvdGVLZXlcIl0nKTtcbiAgICAgICAgICAgIGNvbnN0IHFrID0gZWwgPyBnZXROdW1iZXIoZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXF1b3RlLWtleScpID8/IGVsLnZhbHVlKSA6IDA7XG4gICAgICAgICAgICBjb25zdCBwbiA9IChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcud2l6YXJkLXN0ZXBzIC5hY3RpdmUsIC53aXphcmQgLmFjdGl2ZSwgLnBsZXgtc2lkZXRhYnMgLmFjdGl2ZScpPy50ZXh0Q29udGVudFxuICAgICAgICAgICAgICAgIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wYWdlLXRpdGxlLCAuY29udGVudC1oZWFkZXIgaDEsIC5wbGV4LW5hdmJhci10aXRsZScpPy50ZXh0Q29udGVudFxuICAgICAgICAgICAgICAgIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1thcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICByZXR1cm4geyBxdW90ZUtleTogcWssIHBhZ2VOYW1lOiBwbiB9O1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGZyb21LbygpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qga29Sb290ID0gKHdpbmRvdy5rbyAmJiB0eXBlb2Ygd2luZG93LmtvLmRhdGFGb3IgPT09ICdmdW5jdGlvbicpID8gd2luZG93LmtvLmRhdGFGb3IoZG9jdW1lbnQuYm9keSkgOiBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IHFrID0gZ2V0TnVtYmVyKGtvUm9vdD8uUXVvdGVLZXkgPz8ga29Sb290Py5xdW90ZUtleSA/PyBrb1Jvb3Q/LlF1b3RlPy5RdW90ZUtleSkgfHwgMDtcbiAgICAgICAgICAgICAgICBjb25zdCBwbiA9IFN0cmluZyhrb1Jvb3Q/LkN1cnJlbnRQYWdlTmFtZSA/PyBrb1Jvb3Q/LmN1cnJlbnRQYWdlTmFtZSA/PyBrb1Jvb3Q/LldpemFyZD8uQ3VycmVudFBhZ2VOYW1lID8/ICcnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgcXVvdGVLZXk6IHFrLCBwYWdlTmFtZTogcG4gfTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4geyBxdW90ZUtleTogMCwgcGFnZU5hbWU6ICcnIH07IH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBjb2FsZXNjZSgpIHtcbiAgICAgICAgICAgIGNvbnN0IGEgPSBmcm9tS28oKSwgYiA9IGZyb21Eb20oKSwgYyA9IGZyb21VcmwoKTtcbiAgICAgICAgICAgIGNvbnN0IHF1b3RlS2V5ID0gYS5xdW90ZUtleSB8fCBiLnF1b3RlS2V5IHx8IGMucXVvdGVLZXkgfHwgMDtcbiAgICAgICAgICAgIGNvbnN0IHBhZ2VOYW1lID0gKGEucGFnZU5hbWUgfHwgYi5wYWdlTmFtZSB8fCBkb2N1bWVudC50aXRsZSB8fCAnJykucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcbiAgICAgICAgICAgIGNvbnN0IGlzT25QYXJ0U3VtbWFyeSA9ICgoKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRE9NIHNpZ25hbCBmcm9tIFBhcnQgU3VtbWFyeTogSURzIGxpa2UgXCJRdW90ZVBhcnRTdW1tYXJ5Rm9ybV8qXCJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzUFNGb3JtID1cbiAgICAgICAgICAgICAgICAgICAgICAgICEhZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI1F1b3RlUGFydFN1bW1hcnlGb3JtLFtpZF49XCJRdW90ZVBhcnRTdW1tYXJ5Rm9ybV9cIl0nKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhhc1BTRm9ybSkgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gKE9wdGlvbmFsKSBhY3RpdmUgd2l6YXJkIHN0ZXAgbGFiZWwgZXF1YWxzIFwiUGFydCBTdW1tYXJ5XCJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWN0aXZlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZS5hY3RpdmUnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFjdGl2ZSAmJiBhY3RpdmUudGV4dENvbnRlbnQgJiYgYWN0aXZlLnRleHRDb250ZW50LnRyaW0oKS50b0xvd2VyQ2FzZSgpID09PSAncGFydCBzdW1tYXJ5JylcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXG4gICAgICAgICAgICAgICAgLy8gRmFsbGJhY2tzIChVUkwvdGl0bGUgaGV1cmlzdGljcylcbiAgICAgICAgICAgICAgICByZXR1cm4gL3BhcnRcXHMqc3VtbWFyeS9pLnRlc3QocGFnZU5hbWUpIHx8XG4gICAgICAgICAgICAgICAgICAgIC9wYXJ0KD86JTIwfFxcc3wtKT9zdW1tYXJ5fHN1bW1hcnkoPzolMjB8XFxzfC0pP3BhcnQvaS50ZXN0KGxvY2F0aW9uLmhyZWYpO1xuICAgICAgICAgICAgfSkoKTtcblxuICAgICAgICAgICAgcmV0dXJuIHsgcXVvdGVLZXksIHBhZ2VOYW1lLCBpc09uUGFydFN1bW1hcnkgfTtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBnZXRRdW90ZUNvbnRleHQoKSB7XG4gICAgICAgICAgICBjb25zdCB7IHF1b3RlS2V5LCBwYWdlTmFtZSwgaXNPblBhcnRTdW1tYXJ5IH0gPSBjb2FsZXNjZSgpO1xuICAgICAgICAgICAgcmV0dXJuIHsgcXVvdGVLZXksIHBhZ2VOYW1lLCBpc09uUGFydFN1bW1hcnksIGhhc1F1b3RlS2V5OiBxdW90ZUtleSA+IDAsIGlzUGFnZTogKG4pID0+IG5ldyBSZWdFeHAoU3RyaW5nKG4pLnJlcGxhY2UoL1xccysvZywgJ1xcXFxzKicpLCAnaScpLnRlc3QocGFnZU5hbWUpIH07XG4gICAgICAgIH1cblxuICAgICAgICAvLyAtLS0tLS0tLS0tIEh1YiBoZWxwZXJzIChDKSAtLS0tLS0tLS0tXG4gICAgICAgIGFzeW5jIGZ1bmN0aW9uIGdldEh1YihvcHRzID0geyBtb3VudDogJ25hdicgfSkge1xuICAgICAgICAgICAgY29uc3QgUiA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJykgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3c7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDUwOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbnN1cmUgPSAoUi5lbnN1cmVMVEh1YiB8fCB3aW5kb3cuZW5zdXJlTFRIdWIpO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZW5zdXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmUob3B0cyk7IC8vIG1heSByZXR1cm4gdm9pZFxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaHViTm93ID0gKHR5cGVvZiBsdFVJSHViICE9PSAndW5kZWZpbmVkJykgPyBsdFVJSHViIDogUi5sdFVJSHViO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGh1Yk5vdykgcmV0dXJuIGh1Yk5vdztcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgaHViTm93ID0gKHR5cGVvZiBsdFVJSHViICE9PSAndW5kZWZpbmVkJykgPyBsdFVJSHViIDogUi5sdFVJSHViO1xuICAgICAgICAgICAgICAgIGlmIChodWJOb3cpIHJldHVybiBodWJOb3c7XG4gICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgX19mYWxsYmFjazogdHJ1ZSB9OyAvLyBmYWxsYmFjayBzZW50aW5lbFxuICAgICAgICB9XG5cbiAgICAgICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlSHViQnV0dG9uKHtcbiAgICAgICAgICAgIGlkLCBsYWJlbCwgdGl0bGUsIHNpZGUgPSAnbGVmdCcsIHdlaWdodCA9IDEyMCwgb25DbGljaywgc2hvd1doZW4sIGZvcmNlID0gZmFsc2UsIG1vdW50ID0gJ25hdidcbiAgICAgICAgfSA9IHt9KSB7XG4gICAgICAgICAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoeyBtb3VudCB9KTtcbiAgICAgICAgICAgIGNvbnN0IHVzaW5nVWlIdWIgPSAhIShodWIgJiYgIWh1Yi5fX2ZhbGxiYWNrICYmIHR5cGVvZiBodWIucmVnaXN0ZXJCdXR0b24gPT09ICdmdW5jdGlvbicpO1xuXG4gICAgICAgICAgICBjb25zdCBzaG91bGRTaG93Tm93ID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7IGNvbnN0IGN0eCA9IGdldFF1b3RlQ29udGV4dCgpOyByZXR1cm4gISEoZm9yY2UgfHwgKHR5cGVvZiBzaG93V2hlbiA9PT0gJ2Z1bmN0aW9uJyA/IHNob3dXaGVuKGN0eCkgOiB0cnVlKSk7IH1cbiAgICAgICAgICAgICAgICBjYXRjaCB7IHJldHVybiAhIWZvcmNlOyB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAodXNpbmdVaUh1Yikge1xuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGxpc3RJZHMoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2ID0gaHViLmxpc3Q/LigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHYpKSByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBTdXBwb3J0IGFycmF5cyBvZiBzdHJpbmdzIE9SIGFycmF5cyBvZiB7IGlkLCAuLi4gfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHYubWFwKHggPT4gKHggJiYgdHlwZW9mIHggPT09ICdvYmplY3QnKSA/IHguaWQgOiB4KS5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gW107IH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBpc1ByZXNlbnQoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGh1Yi5oYXMgPT09ICdmdW5jdGlvbicpIHJldHVybiAhIWh1Yi5oYXMoaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGxpc3RJZHMoKS5pbmNsdWRlcyhpZCk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBhc3luYyBmdW5jdGlvbiByZWdpc3RlcigpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVmID0geyBpZCwgbGFiZWwsIHRpdGxlLCB3ZWlnaHQsIG9uQ2xpY2sgfTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQWx3YXlzIHByZWZlciB0aGUgMi1hcmcgZm9ybTsgZmFsbCBiYWNrIHRvIDEtYXJnXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IGh1Yi5yZWdpc3RlckJ1dHRvbj8uKHNpZGUsIGRlZik7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IDA7XG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNQcmVzZW50KCkpIHsgdHJ5IHsgaHViLnJlZ2lzdGVyQnV0dG9uPy4oeyAuLi5kZWYsIHNlY3Rpb246IHNpZGUgfSk7IH0gY2F0Y2ggeyB9IH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBJZiBzdGlsbCBub3QgcHJlc2VudCwgdHJ5IHRoZSBhbHRlcm5hdGUgZm9ybSBleHBsaWNpdGx5XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IDA7IC8vIHlpZWxkXG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNQcmVzZW50KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKHsgLi4uZGVmLCBzZWN0aW9uOiBzaWRlIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgMDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc1ByZXNlbnQoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oc2lkZSwgZGVmKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpc1ByZXNlbnQoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBlbnN1cmVSZWcoKSB7IGlmIChpc1ByZXNlbnQoKSkgcmV0dXJuIGZhbHNlOyByZXR1cm4gcmVnaXN0ZXIoKTsgfVxuICAgICAgICAgICAgICAgIGVuc3VyZVJlZygpO1xuXG4gICAgICAgICAgICAgICAgYXN5bmMgZnVuY3Rpb24gcmVjb25jaWxlKCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2hvdyA9IHNob3VsZFNob3dOb3coKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByZXNlbnQgPSBpc1ByZXNlbnQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzaG93KSB7IGlmICghcHJlc2VudCkgZW5zdXJlUmVnKCk7IHJldHVybiB0cnVlOyB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJlc2VudCkgaHViLnJlbW92ZT8uKGlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGVuc3VyZUh1YkJ1dHRvbi5fX3N0YXRlID0gZW5zdXJlSHViQnV0dG9uLl9fc3RhdGUgfHwge307XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhdGUgPSBlbnN1cmVIdWJCdXR0b24uX19zdGF0ZVtpZF0gfHw9IHsgb2JzOiBudWxsLCBvZmZVcmw6IG51bGwgfTtcblxuICAgICAgICAgICAgICAgIGF3YWl0IHJlY29uY2lsZSgpO1xuICAgICAgICAgICAgICAgIGlmICghc3RhdGUub2JzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0JykgfHwgZG9jdW1lbnQuYm9keTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJvb3QgJiYgd2luZG93Lk11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHsgcmVjb25jaWxlKCk7IH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub2JzLm9ic2VydmUocm9vdCwgeyBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS5vZmZVcmwgJiYgd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLm9mZlVybCA9IHdpbmRvdy5UTVV0aWxzLm9uVXJsQ2hhbmdlKCgpID0+IHsgcmVjb25jaWxlKCk7IH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IHN5bnRoZXNpemUgYSBzaW1wbGUgbmF2YmFyIGJ1dHRvbiAob25seSBpZiBsdC11aS1odWIgbm90IHByZXNlbnQpXG4gICAgICAgICAgICBjb25zdCBkb21JZCA9IGBsdC1uYXZidG4tJHtpZH1gO1xuICAgICAgICAgICAgZnVuY3Rpb24gbmF2UmlnaHQoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNuYXZCYXIgLm5hdmJhci1yaWdodCcpIHx8XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LW5hdmJhci1jb250YWluZXIgLm5hdmJhci1yaWdodCcpIHx8XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5uYXZiYXItcmlnaHQnKSB8fFxuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmF2QmFyJykgfHwgZG9jdW1lbnQuYm9keTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bmN0aW9uIGVuc3VyZURvbSgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBob3N0ID0gbmF2UmlnaHQoKTsgaWYgKCFob3N0KSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICBsZXQgYnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZG9tSWQpO1xuICAgICAgICAgICAgICAgIGlmICghYnRuKSB7XG4gICAgICAgICAgICAgICAgICAgIGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgICAgICAgICAgICAgICBidG4uaWQgPSBkb21JZDsgYnRuLnR5cGUgPSAnYnV0dG9uJzsgYnRuLmNsYXNzTmFtZSA9ICdidG4gYnRuLXByaW1hcnknO1xuICAgICAgICAgICAgICAgICAgICBidG4udGl0bGUgPSB0aXRsZSB8fCAnJzsgYnRuLnRleHRDb250ZW50ID0gbGFiZWwgfHwgaWQ7IGJ0bi5zdHlsZS5tYXJnaW5MZWZ0ID0gJzhweCc7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldikgPT4geyB0cnkgeyBvbkNsaWNrPy4oZXYpOyB9IGNhdGNoIHsgfSB9KTtcbiAgICAgICAgICAgICAgICAgICAgaG9zdC5hcHBlbmRDaGlsZChidG4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYnRuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZnVuY3Rpb24gcmVtb3ZlRG9tKCkgeyBjb25zdCBuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZG9tSWQpOyBpZiAobikgdHJ5IHsgbi5yZW1vdmUoKTsgfSBjYXRjaCB7IH0gfVxuXG4gICAgICAgICAgICBhc3luYyBmdW5jdGlvbiByZWNvbmNpbGVEb20oKSB7IGNvbnN0IHNob3cgPSBzaG91bGRTaG93Tm93KCk7IGlmIChzaG93KSBlbnN1cmVEb20oKTsgZWxzZSByZW1vdmVEb20oKTsgfVxuXG4gICAgICAgICAgICBlbnN1cmVIdWJCdXR0b24uX19zdGF0ZSA9IGVuc3VyZUh1YkJ1dHRvbi5fX3N0YXRlIHx8IHt9O1xuICAgICAgICAgICAgY29uc3Qgc3RhdGUgPSBlbnN1cmVIdWJCdXR0b24uX19zdGF0ZVtpZF0gfHw9IHsgb2JzOiBudWxsLCBvZmZVcmw6IG51bGwgfTtcblxuICAgICAgICAgICAgYXdhaXQgcmVjb25jaWxlRG9tKCk7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLm9icykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0JykgfHwgZG9jdW1lbnQuYm9keTtcbiAgICAgICAgICAgICAgICBpZiAocm9vdCAmJiB3aW5kb3cuTXV0YXRpb25PYnNlcnZlcikge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7IHJlY29uY2lsZURvbSgpOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUub2JzLm9ic2VydmUocm9vdCwgeyBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzdGF0ZS5vZmZVcmwgJiYgd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUub2ZmVXJsID0gd2luZG93LlRNVXRpbHMub25VcmxDaGFuZ2UoKCkgPT4geyByZWNvbmNpbGVEb20oKTsgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7IHByb21vdGVEcmFmdFRvUXVvdGUsIHN0b3BSZXRyeSwgdXNlRHJhZnRSZXBvLCB1c2VRdW90ZVJlcG8sIGdldFF1b3RlQ29udGV4dCwgZ2V0SHViLCBlbnN1cmVIdWJCdXR0b24gfTtcbiAgICB9KSgpO1xuXG4gICAgLy8gQXV0by1hcHBseSBUSEVNRV9DU1MgaWYgcHJvdmlkZWQgKHNhZmUgbm8tb3Agb3RoZXJ3aXNlKVxuICAgIHRyeSB7IGNvcmUudGhlbWUuYXBwbHkoKTsgfSBjYXRjaCB7IH1cblxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBU0EsR0FBQyxNQUFNO0FBRUgsVUFBTSxPQUFRLE9BQU8saUJBQWlCLGNBQWMsZUFBZTtBQUNuRSxVQUFNLEtBQU0sS0FBSyxLQUFLLEtBQUssTUFBTSxDQUFDO0FBQ2xDLFVBQU0sT0FBUSxHQUFHLE9BQU8sR0FBRyxRQUFRLENBQUM7QUFLcEMsU0FBSyxPQUFPLEtBQUssUUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BSXJCLE1BQU0sU0FBUztBQUNYLFlBQUk7QUFDQSxjQUFJLEtBQUssVUFBVSxPQUFRLFFBQU8sTUFBTSxLQUFLLFNBQVMsT0FBTztBQUM3RCxjQUFJLEtBQUssU0FBUyxPQUFRLFFBQU8sTUFBTSxLQUFLLFFBQVEsT0FBTztBQUFBLFFBQy9ELFFBQVE7QUFBQSxRQUFrQjtBQUMxQixlQUFPO0FBQUEsTUFDWDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQU9BLE1BQU0sY0FBYyxJQUFJO0FBQ3BCLFlBQUksTUFBTSxNQUFNLEtBQUssS0FBSyxPQUFPO0FBQ2pDLFlBQUksQ0FBQyxLQUFLO0FBQ04sY0FBSTtBQUNBLGdCQUFJLEtBQUssVUFBVSxTQUFTO0FBQ3hCLG9CQUFNLEtBQUssU0FBUyxRQUFRO0FBQzVCLG9CQUFNLE1BQU0sS0FBSyxLQUFLLE9BQU87QUFBQSxZQUNqQyxXQUFX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TSxLQUFLO0FBQ1osZ0JBQU0sT0FBTyxTQUFTLGNBQWMsd0JBQXdCLEtBQUssU0FBUztBQUMxRSxjQUFJLFFBQVEsT0FBTyxrQkFBa0I7QUFDakMsa0JBQU0sTUFBTSxJQUFJLGlCQUFpQixNQUFNO0FBQUUsMkJBQWE7QUFBQSxZQUFHLENBQUM7QUFDMUQsa0JBQU0sSUFBSSxRQUFRLE1BQU0sRUFBRSxTQUFTLE1BQU0sWUFBWSxNQUFNLFdBQVcsS0FBSyxDQUFDO0FBQUEsVUFDaEY7QUFBQSxRQUNKO0FBQ0EsWUFBSSxDQUFDLE1BQU0sVUFBVSxPQUFPLFNBQVMsYUFBYTtBQUM5QyxnQkFBTSxTQUFTLE9BQU8sUUFBUSxZQUFZLE1BQU07QUFBRSx5QkFBYTtBQUFBLFVBQUcsQ0FBQztBQUFBLFFBQ3ZFO0FBQ0EsZUFBTztBQUFBLE1BQ1g7QUFFQSxhQUFPLEVBQUUscUJBQXFCLFdBQVcsY0FBYyxjQUFjLGlCQUFpQixRQUFRLGdCQUFnQjtBQUFBLElBQ2xILEdBQUc7QUFHSCxRQUFJO0FBQUUsV0FBSyxNQUFNLE1BQU07QUFBQSxJQUFHLFFBQVE7QUFBQSxJQUFFO0FBQUEsRUFFeEMsR0FBRzsiLAogICJuYW1lcyI6IFsiUk9PVCIsICJodWJOb3ciLCAibGlzdElkcyIsICJpc1ByZXNlbnQiLCAiZW5zdXJlUmVnIiwgInN0YXRlIl0KfQo=
