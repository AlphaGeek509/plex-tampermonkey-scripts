(() => {
  // tm-scripts/src/shared/lt-core.user.js
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LWNvcmUudXNlci5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gPT1Vc2VyU2NyaXB0PT1cbi8vIEBuYW1lICAgICAgICAgbHQtY29yZVxuLy8gQG5hbWVzcGFjZSAgICBsdFxuLy8gQHZlcnNpb24gICAgICAyMDI2LjA1LjE5LjIxXG4vLyBAZGVzY3JpcHRpb24gIFNoYXJlZCBjb3JlOiBhdXRoICsgaHR0cCArIHBsZXggRFMgKyBodWIgKHN0YXR1cy90b2FzdCkgKyB0aGVtZSBicmlkZ2UgKyB0aW55IHV0aWxzXG4vLyBAcnVuLWF0ICAgICAgIGRvY3VtZW50LXN0YXJ0XG4vLyBAZ3JhbnQgICAgICAgIG5vbmVcbi8vID09L1VzZXJTY3JpcHQ9PVxuXG4oKCkgPT4ge1xuICAgIC8vIFByZWZlciB0aGUgcGFnZSBjb250ZXh0IGlmIGF2YWlsYWJsZSAoc28gZ2xvYmFscyBhcmUgc2hhcmVkIHdpdGggdGhlIGFwcClcbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICBjb25zdCBMVCA9IChST09ULmx0ID0gUk9PVC5sdCB8fCB7fSk7XG4gICAgY29uc3QgY29yZSA9IChMVC5jb3JlID0gTFQuY29yZSB8fCB7fSk7XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gQXV0aCAoZnJvbSB5b3VyIHBsZXgtYXV0aClcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS5hdXRoID0gY29yZS5hdXRoIHx8IHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRyeSBQbGV4QXV0aCBmaXJzdCwgdGhlbiBQbGV4QVBJOyByZXR1cm4gYmVhcmVyIHRva2VuIHN0cmluZyBvciBudWxsLlxuICAgICAgICAgKi9cbiAgICAgICAgYXN5bmMgZ2V0S2V5KCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpZiAoUk9PVC5QbGV4QXV0aD8uZ2V0S2V5KSByZXR1cm4gYXdhaXQgUk9PVC5QbGV4QXV0aC5nZXRLZXkoKTtcbiAgICAgICAgICAgICAgICBpZiAoUk9PVC5QbGV4QVBJPy5nZXRLZXkpIHJldHVybiBhd2FpdCBST09ULlBsZXhBUEkuZ2V0S2V5KCk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSdW4gYSBmdW5jdGlvbiBhZnRlciBlbnN1cmluZyB3ZSBoYXZlIGFuIGF1dGgga2V5LlxuICAgICAgICAgKiBJZiBhIHJlZnJlc2ggaG9vayBleGlzdHMgd2UnbGwgYXR0ZW1wdCBpdCBvbmNlLlxuICAgICAgICAgKiBUaHJvd3MgaWYgbm8ga2V5IGlzIGF2YWlsYWJsZSBhZnRlciB0aGUgcmVmcmVzaCBhdHRlbXB0LlxuICAgICAgICAgKi9cbiAgICAgICAgYXN5bmMgd2l0aEZyZXNoQXV0aChmbikge1xuICAgICAgICAgICAgbGV0IGtleSA9IGF3YWl0IGNvcmUuYXV0aC5nZXRLZXkoKTtcbiAgICAgICAgICAgIGlmICgha2V5KSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKFJPT1QuUGxleEF1dGg/LnJlZnJlc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IFJPT1QuUGxleEF1dGgucmVmcmVzaCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gYXdhaXQgY29yZS5hdXRoLmdldEtleSgpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFJPT1QuUGxleEFQST8ucmVmcmVzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgUk9PVC5QbGV4QVBJLnJlZnJlc2goKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGF3YWl0IGNvcmUuYXV0aC5nZXRLZXkoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFrZXkpIHRocm93IG5ldyBFcnJvcignTm8gUGxleCBBUEkga2V5IGNvbmZpZ3VyZWQuIFVzZSB0aGUgVGFtcGVyTW9ua2V5IG1lbnUgKFx1MjY5OVx1RkUwRiBTZXQgUGxleCBBUEkgS2V5KSB0byBzZXQgb25lLicpO1xuICAgICAgICAgICAgcmV0dXJuIGZuKGtleSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIEhUVFBcbiAgICAvLyBEZWxlZ2F0ZXMgdG8gVE1VdGlscy5mZXRjaERhdGEgd2hlbiBhdmFpbGFibGU7IGZhbGxzIGJhY2sgdG8gZmV0Y2goKVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBjb3JlLmh0dHAgPSBjb3JlLmh0dHAgfHwge1xuICAgICAgICBhc3luYyBmZXRjaCh1cmwsIHsgbWV0aG9kID0gJ0dFVCcsIGhlYWRlcnMgPSB7fSwgYm9keSwgdGltZW91dE1zID0gMTUwMDAsIHVzZVhIUiA9IGZhbHNlIH0gPSB7fSkge1xuICAgICAgICAgICAgaWYgKFJPT1QuVE1VdGlscz8uZmV0Y2hEYXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IFJPT1QuVE1VdGlscy5mZXRjaERhdGEodXJsLCB7IG1ldGhvZCwgaGVhZGVycywgYm9keSwgdGltZW91dE1zLCB1c2VYSFIgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBuYXRpdmUgZmV0Y2ggd2l0aCBBdXRob3JpemF0aW9uIChmcm9tIHBsZXgtYXV0aClcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGF3YWl0IGNvcmUuYXV0aC5nZXRLZXkoKTtcbiAgICAgICAgICAgIGNvbnN0IGggPSBuZXcgSGVhZGVycyhoZWFkZXJzIHx8IHt9KTtcbiAgICAgICAgICAgIGlmIChrZXkgJiYgIWguaGFzKCdBdXRob3JpemF0aW9uJykpIGguc2V0KCdBdXRob3JpemF0aW9uJywgYEJlYXJlciAke2tleX1gKTtcbiAgICAgICAgICAgIGlmIChib2R5ICYmICFoLmhhcygnQ29udGVudC1UeXBlJykpIGguc2V0KCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbicpO1xuXG4gICAgICAgICAgICBjb25zdCBjdGwgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgICAgICAgICBjb25zdCB0ID0gc2V0VGltZW91dCgoKSA9PiBjdGwuYWJvcnQoKSwgdGltZW91dE1zKTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaCh1cmwsIHtcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kLFxuICAgICAgICAgICAgICAgICAgICBoZWFkZXJzOiBoLFxuICAgICAgICAgICAgICAgICAgICBib2R5OiBib2R5ICYmIHR5cGVvZiBib2R5ICE9PSAnc3RyaW5nJyA/IEpTT04uc3RyaW5naWZ5KGJvZHkpIDogYm9keSxcbiAgICAgICAgICAgICAgICAgICAgc2lnbmFsOiBjdGwuc2lnbmFsLFxuICAgICAgICAgICAgICAgICAgICBjcmVkZW50aWFsczogJ2luY2x1ZGUnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29uc3QgY3QgPSByZXMuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpIHx8ICcnO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBjdC5pbmNsdWRlcygnYXBwbGljYXRpb24vanNvbicpID8gYXdhaXQgcmVzLmpzb24oKSA6IGF3YWl0IHJlcy50ZXh0KCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXMub2spIHRocm93IG5ldyBFcnJvcihgSFRUUCAke3Jlcy5zdGF0dXN9ICR7cmVzLnN0YXR1c1RleHR9YCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBhc3luYyBnZXQodXJsLCBvcHRzID0ge30pIHsgcmV0dXJuIHRoaXMuZmV0Y2godXJsLCB7IC4uLihvcHRzIHx8IHt9KSwgbWV0aG9kOiAnR0VUJyB9KTsgfSxcbiAgICAgICAgYXN5bmMgcG9zdCh1cmwsIGJvZHksIG9wdHMgPSB7fSkgeyByZXR1cm4gdGhpcy5mZXRjaCh1cmwsIHsgLi4uKG9wdHMgfHwge30pLCBtZXRob2Q6ICdQT1NUJywgYm9keSB9KTsgfVxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFBsZXggRFMgaGVscGVyc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS5wbGV4ID0gY29yZS5wbGV4IHx8IHtcbiAgICAgICAgYXN5bmMgZHMoc291cmNlSWQsIHBheWxvYWQgPSB7fSwgb3B0cyA9IHt9KSB7XG4gICAgICAgICAgICBpZiAoUk9PVC5UTVV0aWxzPy5kcykgcmV0dXJuIGF3YWl0IFJPT1QuVE1VdGlscy5kcyhzb3VyY2VJZCwgcGF5bG9hZCwgb3B0cyk7XG5cbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBkaXJlY3QgUE9TVCB0byBEUyBlbmRwb2ludCAoZm9ybWF0PTIgXHUyMTkyIHJvd3MgaW4gYXJyYXkpXG4gICAgICAgICAgICBjb25zdCBiYXNlID0gbG9jYXRpb24ub3JpZ2luLnJlcGxhY2UoL1xcLyQvLCAnJyk7XG4gICAgICAgICAgICBjb25zdCB1cmwgPSBgJHtiYXNlfS9hcGkvZGF0YXNvdXJjZXMvJHtzb3VyY2VJZH0vZXhlY3V0ZT9mb3JtYXQ9MmA7XG4gICAgICAgICAgICBjb25zdCBqc29uID0gYXdhaXQgY29yZS5odHRwLnBvc3QodXJsLCBwYXlsb2FkLCBvcHRzKTtcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBBcnJheS5pc0FycmF5KGpzb24/LnJvd3MpID8ganNvbi5yb3dzIDogW107XG4gICAgICAgICAgICByZXR1cm4geyAuLi5qc29uLCByb3dzIH07XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXN5bmMgZHNSb3dzKHNvdXJjZUlkLCBwYXlsb2FkID0ge30sIG9wdHMgPSB7fSkge1xuICAgICAgICAgICAgaWYgKFJPT1QuVE1VdGlscz8uZHNSb3dzKSByZXR1cm4gYXdhaXQgUk9PVC5UTVV0aWxzLmRzUm93cyhzb3VyY2VJZCwgcGF5bG9hZCwgb3B0cyk7XG4gICAgICAgICAgICBjb25zdCB7IHJvd3MgfSA9IGF3YWl0IHRoaXMuZHMoc291cmNlSWQsIHBheWxvYWQsIG9wdHMpO1xuICAgICAgICAgICAgcmV0dXJuIHJvd3M7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLSBIdWIgZmFjYWRlIChwcmVmZXJzIGx0LXVpLWh1YjsgbW91bnRzIG9uIGZpcnN0IHVzZSkgLS0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUuaHViID0gY29yZS5odWIgfHwgKCgpID0+IHtcbiAgICAgICAgLy8gLS0tIHNtYWxsIHBpbGwgZmFsbGJhY2sgKHVzZWQgb25seSBpZiBsdC11aS1odWIgbWlzc2luZykgLS0tXG4gICAgICAgIGNvbnN0IGZhbGxiYWNrID0gKCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGFwaSA9IHt9O1xuICAgICAgICAgICAgYXBpLl9zdGlja3kgPSBmYWxzZTtcblxuICAgICAgICAgICAgZnVuY3Rpb24gZW5zdXJlUGlsbCgpIHtcbiAgICAgICAgICAgICAgICBsZXQgcGlsbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNsdC1odWItcGlsbCcpO1xuICAgICAgICAgICAgICAgIGlmICghcGlsbCkge1xuICAgICAgICAgICAgICAgICAgICBwaWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgICAgIHBpbGwuaWQgPSAnbHQtaHViLXBpbGwnO1xuICAgICAgICAgICAgICAgICAgICBwaWxsLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b3A6IDEwcHg7IHJpZ2h0OiAxMHB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgei1pbmRleDogMjE0NzQ4MzAwMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6ICNmZmY7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250OiAxM3B4IHN5c3RlbS11aSwgLWFwcGxlLXN5c3RlbSwgU2Vnb2UgVUksIFJvYm90bywgc2Fucy1zZXJpZjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhZGRpbmc6IDZweCAxMHB4OyBib3JkZXItcmFkaXVzOiA5OTlweDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgOHB4IDI0cHggcmdiYSgwLDAsMCwwLjI1KTtcbiAgICAgICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgICAgICAgICAgcGlsbC50ZXh0Q29udGVudCA9ICdcdTIwMjYnO1xuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuYXBwZW5kQ2hpbGQocGlsbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBwaWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBhcGkuc2V0U3RhdHVzID0gKHRleHQsIHRvbmUgPSAnaW5mbycsIHsgc3RpY2t5ID0gZmFsc2UgfSA9IHt9KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZWwgPSBlbnN1cmVQaWxsKCk7XG4gICAgICAgICAgICAgICAgZWwudGV4dENvbnRlbnQgPSB0ZXh0IHx8ICcnO1xuICAgICAgICAgICAgICAgIGFwaS5fc3RpY2t5ID0gISFzdGlja3k7XG4gICAgICAgICAgICAgICAgaWYgKCFhcGkuX3N0aWNreSkgc2V0VGltZW91dCgoKSA9PiB7IHRyeSB7IGVsLnJlbW92ZSgpOyB9IGNhdGNoIHsgfSB9LCAyMDAwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgYXBpLm5vdGlmeSA9IChfbGV2ZWwsIHRleHQsIHsgbXMgPSA1MDAwIH0gPSB7fSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVsID0gZW5zdXJlUGlsbCgpO1xuICAgICAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gdGV4dCB8fCAnJztcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgdHJ5IHsgZWwucmVtb3ZlKCk7IH0gY2F0Y2ggeyB9IH0sIE1hdGgubWF4KDUwMCwgbXMgfCAwKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGFwaS50b2FzdCA9IChtc2csIG1zID0gNTAwMCkgPT4gYXBpLm5vdGlmeSgnaW5mbycsIG1zZywgeyBtcyB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgfSkoKTtcblxuICAgICAgICAvLyAtLS0gcXVldWUgdW50aWwgbHQtdWktaHViIG1vdW50cyAtLS1cbiAgICAgICAgbGV0IG1vdW50ZWQgPSBmYWxzZTtcbiAgICAgICAgbGV0IG1vdW50aW5nID0gbnVsbDsgICAgICAgICAgICAgICAvLyBQcm9taXNlXG4gICAgICAgIGNvbnN0IHF1ZXVlID0gW107ICAgICAgICAgICAgICAgICAgLy8gW3tmbiwgYXJnc31dXG5cbiAgICAgICAgYXN5bmMgZnVuY3Rpb24gbW91bnRVaUh1Yk9uY2UoKSB7XG4gICAgICAgICAgICBpZiAobW91bnRlZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICBpZiAobW91bnRpbmcpIHJldHVybiBtb3VudGluZztcblxuICAgICAgICAgICAgbW91bnRpbmcgPSAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIGVuc3VyZUxUSHViIGlzIGF2YWlsYWJsZSwgbW91bnQgdGhlIGZ1bGwtd2lkdGggYmFyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVuc3VyZUZuID1cbiAgICAgICAgICAgICAgICAgICAgICAgICh0eXBlb2YgZW5zdXJlTFRIdWIgPT09ICdmdW5jdGlvbicpID8gZW5zdXJlTFRIdWIgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICh0eXBlb2YgUk9PVC5lbnN1cmVMVEh1YiA9PT0gJ2Z1bmN0aW9uJyA/IFJPT1QuZW5zdXJlTFRIdWIgOiBudWxsKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZW5zdXJlRm4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGVuc3VyZUZuKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGVtZTogeyBuYW1lOiAnT25lTW9ucm9lJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGRlZmF1bHQgdG8gYm9keTsgaG9ub3IgYW55IGVhcmxpZXIgc2VsZWN0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbW91bnQ6IChST09ULl9fTFRfSFVCX01PVU5UIHx8ICduYXYnKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYWdlUm9vdFNlbGVjdG9yczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnI3BsZXhTaWRldGFic01lbnVQYWdlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICcucGxleC1zaWRldGFicy1tZW51LXBhZ2UtY29udGVudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICcucGxleC1zaWRldGFicy1tZW51LXBhZ2UtY29udGVudC1jb250YWluZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnLnBsZXgtYWN0aW9ucy13cmFwcGVyJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2hlbiBsaXZpbmcgaW4gdGhlIG5hdmJhciB3ZSBuZXZlciB3YW50IHRvIGFsdGVyIHBhZ2UgbGF5b3V0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RpY2s6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdhcDogOFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBodWJPYmogPSAodHlwZW9mIGx0VUlIdWIgIT09ICd1bmRlZmluZWQnKSA/IGx0VUlIdWIgOiBST09ULmx0VUlIdWI7XG4gICAgICAgICAgICAgICAgICAgIG1vdW50ZWQgPSAhIWh1Yk9iajtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1vdW50ZWQ7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgIG1vdW50ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGZsdXNoIHF1ZXVlZCBjYWxscyB0aHJvdWdoIGVpdGhlciB1aS1odWIgKGlmIG1vdW50ZWQpIG9yIGZhbGxiYWNrXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGh1YiA9IG1vdW50ZWQgPyBST09ULmx0VUlIdWIgOiBudWxsO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHsgZm4sIGFyZ3MgfSBvZiBxdWV1ZS5zcGxpY2UoMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGh1YiAmJiB0eXBlb2YgaHViW2ZuXSA9PT0gJ2Z1bmN0aW9uJykgaHViW2ZuXSguLi5hcmdzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGZhbGxiYWNrW2ZuXSguLi5hcmdzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkoKTtcblxuICAgICAgICAgICAgcmV0dXJuIG1vdW50aW5nO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZGVsZWdhdGVPclF1ZXVlKGZuLCAuLi5hcmdzKSB7XG4gICAgICAgICAgICAvLyBJZiBsdC11aS1odWIgaXMgYWxyZWFkeSBtb3VudGVkLCBkZWxlZ2F0ZSBpbW1lZGlhdGVseVxuICAgICAgICAgICAgY29uc3QgaHViTm93ID0gbW91bnRlZFxuICAgICAgICAgICAgICAgID8gKCh0eXBlb2YgbHRVSUh1YiAhPT0gJ3VuZGVmaW5lZCcpID8gbHRVSUh1YiA6IFJPT1QubHRVSUh1YilcbiAgICAgICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgICAgIGlmIChodWJOb3cgJiYgdHlwZW9mIGh1Yk5vd1tmbl0gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyBodWJOb3dbZm5dKC4uLmFyZ3MpOyB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIElmIHdlIGNhbiBtb3VudCAoc2FuZGJveCBvciB3aW5kb3cpLCBxdWV1ZSBhbmQga2ljayBpdCBvZmZcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZW5zdXJlTFRIdWIgPT09ICdmdW5jdGlvbicgfHwgdHlwZW9mIFJPT1QuZW5zdXJlTFRIdWIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBxdWV1ZS5wdXNoKHsgZm4sIGFyZ3MgfSk7XG4gICAgICAgICAgICAgICAgbW91bnRVaUh1Yk9uY2UoKTsgIC8vIGZpcmUgJiBmb3JnZXRcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE5vIHVpLWh1YiBhdmFpbGFibGUgXHUyMTkyIGZhbGxiYWNrIGltbWVkaWF0ZWx5XG4gICAgICAgICAgICBmYWxsYmFja1tmbl0oLi4uYXJncyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQdWJsaWMgQVBJIChzeW5jIGxvb2tpbmc7IGludGVybmFsbHkgcXVldWVzL2RlbGVnYXRlcylcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHNldFN0YXR1cyh0ZXh0LCB0b25lID0gJ2luZm8nLCBvcHRzID0ge30pIHsgZGVsZWdhdGVPclF1ZXVlKCdzZXRTdGF0dXMnLCB0ZXh0LCB0b25lLCBvcHRzKTsgcmV0dXJuIHRoaXM7IH0sXG5cbiAgICAgICAgICAgIG5vdGlmeSh0ZXh0LCB0b25lID0gJ2luZm8nLCBvcHRzID0ge30pIHtcbiAgICAgICAgICAgICAgICAvLyBsdC11aS1odWIgc2lnbmF0dXJlOiBub3RpZnkoa2luZCwgdGV4dCwge21zLCBzdGlja3ksIHRvYXN0fSlcbiAgICAgICAgICAgICAgICBjb25zdCBtcyA9IG9wdHM/LnRpbWVvdXQgPz8gb3B0cz8ubXMgPz8gNTAwMDtcbiAgICAgICAgICAgICAgICBkZWxlZ2F0ZU9yUXVldWUoJ25vdGlmeScsIHRvbmUsIHRleHQsIHsgbXMsIHN0aWNreTogISFvcHRzPy5zdGlja3ksIHRvYXN0OiAhIW9wdHM/LnRvYXN0IH0pO1xuICAgICAgICAgICAgICAgIGlmICghbW91bnRlZCAmJiB0eXBlb2YgUk9PVC5lbnN1cmVMVEh1YiAhPT0gJ2Z1bmN0aW9uJykgZmFsbGJhY2subm90aWZ5KHRleHQsIHRvbmUsIG9wdHMpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRvYXN0KG1zZywgdGltZW91dCA9IDUwMDApIHtcbiAgICAgICAgICAgICAgICBkZWxlZ2F0ZU9yUXVldWUoJ25vdGlmeScsICdpbmZvJywgbXNnLCB7IG1zOiB0aW1lb3V0LCB0b2FzdDogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICBpZiAoIW1vdW50ZWQgJiYgdHlwZW9mIFJPT1QuZW5zdXJlTFRIdWIgIT09ICdmdW5jdGlvbicpIGZhbGxiYWNrLnRvYXN0KG1zZywgdGltZW91dCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdXBkYXRlQnV0dG9uKGlkLCBwYXRjaCA9IHt9KSB7XG4gICAgICAgICAgICAgICAgZGVsZWdhdGVPclF1ZXVlKCd1cGRhdGVCdXR0b24nLCBpZCwgcGF0Y2gpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJlZ2luVGFzayhsYWJlbCwgdG9uZSA9ICdpbmZvJykge1xuICAgICAgICAgICAgICAgIGlmIChtb3VudGVkICYmIFJPT1QubHRVSUh1Yj8uYmVnaW5UYXNrKSByZXR1cm4gUk9PVC5sdFVJSHViLmJlZ2luVGFzayhsYWJlbCwgdG9uZSk7XG4gICAgICAgICAgICAgICAgLy8gcXVldWUgYSBzeW50aGV0aWMgYmVnaW5UYXNrIHVzaW5nIHN0YXR1cyArIHN1Y2Nlc3MvZXJyb3IgaGVscGVyc1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdHVzKGxhYmVsLCB0b25lLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBjdGwgPSB7XG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZTogKHR4dCwgdCA9IHRvbmUpID0+IHsgdGhpcy5zZXRTdGF0dXModHh0LCB0LCB7IHN0aWNreTogdHJ1ZSB9KTsgcmV0dXJuIGN0bDsgfSxcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogKG1zZyA9ICdEb25lJywgbXMgPSA1MDAwKSA9PiB7IHRoaXMuc2V0U3RhdHVzKCcnLCAnaW5mbycsIHsgc3RpY2t5OiBmYWxzZSB9KTsgdGhpcy5ub3RpZnkobXNnLCAnc3VjY2VzcycsIHsgdGltZW91dDogbXMgfSk7IHJldHVybiBjdGw7IH0sXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiAobXNnID0gJ0ZhaWxlZCcpID0+IHsgdGhpcy5zZXRTdGF0dXMoJycsICdpbmZvJywgeyBzdGlja3k6IGZhbHNlIH0pOyB0aGlzLm5vdGlmeShtc2csICdlcnJvcicsIHsgdGltZW91dDogNTAwMCB9KTsgcmV0dXJuIGN0bDsgfSxcbiAgICAgICAgICAgICAgICAgICAgY2xlYXI6ICgpID0+IHsgdGhpcy5zZXRTdGF0dXMoJycsICdpbmZvJywgeyBzdGlja3k6IGZhbHNlIH0pOyByZXR1cm4gY3RsOyB9LFxuICAgICAgICAgICAgICAgICAgICBkb25lOiAobXNnLCBtcykgPT4gY3RsLnN1Y2Nlc3MobXNnLCBtcylcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIC8vIHRyeSB0byB1cGdyYWRlIHRvIGx0LXVpLWh1YiByZWFsIHRhc2sgYWZ0ZXIgbW91bnRcbiAgICAgICAgICAgICAgICBtb3VudFVpSHViT25jZSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBodWJOb3cgPSAodHlwZW9mIGx0VUlIdWIgIT09ICd1bmRlZmluZWQnKSA/IGx0VUlIdWIgOiBST09ULmx0VUlIdWI7XG4gICAgICAgICAgICAgICAgICAgIGlmIChodWJOb3c/LmJlZ2luVGFzaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHsgaHViTm93LmJlZ2luVGFzayhsYWJlbCwgdG9uZSk7IH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGN0bDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9KSgpO1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFRoZW1lIGJyaWRnZSAoQHJlc291cmNlIFRIRU1FX0NTUyBcdTIxOTIgR01fYWRkU3R5bGUpXG4gICAgLy8gR3JhbnRzIGFyZSBleHBlY3RlZCBpbiB0aGUgcGFyZW50IChlbnRyeSkgYmFubmVyOyB0aGlzIGlzIHNhZmUgbm8tb3AuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUudGhlbWUgPSBjb3JlLnRoZW1lIHx8IHtcbiAgICAgICAgYXBwbHkoKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIE9ubHkgbWFpbiBzY3JpcHQncyBAZ3JhbnQgbWF0dGVyczsgQHJlcXVpcmUgbWV0YWRhdGEgaXMgaWdub3JlZCBieSBUTVxuICAgICAgICAgICAgICAgIGNvbnN0IGNzcyA9ICh0eXBlb2YgR01fZ2V0UmVzb3VyY2VUZXh0ID09PSAnZnVuY3Rpb24nKSA/IEdNX2dldFJlc291cmNlVGV4dCgnVEhFTUVfQ1NTJykgOiAnJztcbiAgICAgICAgICAgICAgICBpZiAoY3NzICYmIHR5cGVvZiBHTV9hZGRTdHlsZSA9PT0gJ2Z1bmN0aW9uJykgR01fYWRkU3R5bGUoY3NzKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyBjb25zb2xlLndhcm4oJ1tsdC1jb3JlXSB0aGVtZS5hcHBseSBmYWlsZWQnLCBlKTsgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFNtYWxsIHV0aWxpdGllc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBjb3JlLnV0aWwgPSBjb3JlLnV0aWwgfHwge1xuICAgICAgICBzbGVlcChtcykgeyByZXR1cm4gbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIE1hdGgubWF4KDAsIG1zIHwgMCkpKTsgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUnVuIGEgZnVuY3Rpb24gb25seSBvbmNlIHBlciBrZXkgKHBlciBwYWdlIGxvYWQpLlxuICAgICAgICAgKi9cbiAgICAgICAgb25jZShrZXksIGZuKSB7XG4gICAgICAgICAgICBjb25zdCBzdG9yZSA9IChjb3JlLl9fb25jZSA9IGNvcmUuX19vbmNlIHx8IG5ldyBTZXQoKSk7XG4gICAgICAgICAgICBpZiAoc3RvcmUuaGFzKGtleSkpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICBzdG9yZS5hZGQoa2V5KTtcbiAgICAgICAgICAgIHJldHVybiBmbigpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBEYXRhIChpbnRlbnRpb25hbGx5IGJsYW5rIGluIGNvcmUpXG4gICAgLy8gRG8gTk9UIGRlZmluZSBjb3JlLmRhdGEgaGVyZTsgbHQtZGF0YS1jb3JlIC8geW91ciByZXBvcyBhdWdtZW50IGl0LlxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gUVQgaGVscGVyczogcmVwb3MgKyBwcm9tb3Rpb24gKyBxdW90ZSBjb250ZXh0ICsgaHViIGJ1dHRvblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUucXQgPSBjb3JlLnF0IHx8ICgoKSA9PiB7XG4gICAgICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpID8gdW5zYWZlV2luZG93IDogd2luZG93O1xuXG4gICAgICAgIGZ1bmN0aW9uIGdldFRhYlNjb3BlSWQobnMgPSAnUVQnKSB7XG4gICAgICAgICAgICB0cnkgeyBpZiAodHlwZW9mIFJPT1QuZ2V0VGFiU2NvcGVJZCA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIFJPT1QuZ2V0VGFiU2NvcGVJZChucyk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHN0b3JhZ2UgPSBST09ULnNlc3Npb25TdG9yYWdlO1xuICAgICAgICAgICAgICAgIGNvbnN0IEsgPSBgbHQ6JHtuc306X19zY29wZUlkYDtcbiAgICAgICAgICAgICAgICBsZXQgdiA9IHN0b3JhZ2UuZ2V0SXRlbShLKTtcbiAgICAgICAgICAgICAgICBpZiAoIXYpIHtcbiAgICAgICAgICAgICAgICAgICAgdiA9IFN0cmluZyhNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAyMTQ3NDgzNjQ3KSk7XG4gICAgICAgICAgICAgICAgICAgIHN0b3JhZ2Uuc2V0SXRlbShLLCB2KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgbiA9IE51bWJlcih2KTtcbiAgICAgICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSB8fCBuIDw9IDApIHRocm93IG5ldyBFcnJvcignYmFkIHNjb3BlJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG47XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSAnX19MVF9RVF9TQ09QRV9JRF9fJztcbiAgICAgICAgICAgICAgICBpZiAoIVJPT1Rba2V5XSkgUk9PVFtrZXldID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjE0NzQ4MzY0Nyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFJPT1Rba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGdldFFURigpIHtcbiAgICAgICAgICAgIGNvbnN0IG1ha2UgPSBST09ULmx0Py5jb3JlPy5kYXRhPy5tYWtlRmxhdFNjb3BlZFJlcG87XG4gICAgICAgICAgICByZXR1cm4gKHR5cGVvZiBtYWtlID09PSAnZnVuY3Rpb24nKSA/IG1ha2UoeyBuczogJ1FUJywgZW50aXR5OiAncXVvdGUnLCBsZWdhY3lFbnRpdHk6ICdRdW90ZUhlYWRlcicgfSkgOiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgYXN5bmMgZnVuY3Rpb24gdXNlRHJhZnRSZXBvKCkge1xuICAgICAgICAgICAgY29uc3QgUVRGID0gZ2V0UVRGKCk7XG4gICAgICAgICAgICBpZiAoIVFURikgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICBjb25zdCB7IHJlcG8gfSA9IFFURi51c2UoZ2V0VGFiU2NvcGVJZCgnUVQnKSk7XG4gICAgICAgICAgICByZXR1cm4gcmVwbyB8fCBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgYXN5bmMgZnVuY3Rpb24gdXNlUXVvdGVSZXBvKHFrKSB7XG4gICAgICAgICAgICBjb25zdCBRVEYgPSBnZXRRVEYoKTtcbiAgICAgICAgICAgIGlmICghUVRGIHx8ICFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShOdW1iZXIocWspKTtcbiAgICAgICAgICAgIHJldHVybiByZXBvIHx8IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyAtLS0tLS0tLS0tIFByb21vdGlvbiAoQSkgLS0tLS0tLS0tLVxuICAgICAgICBmdW5jdGlvbiBuZWVkc01lcmdlKGN1cnJlbnQgPSB7fSwgZHJhZnQgPSB7fSkge1xuICAgICAgICAgICAgY29uc3QgY3VyVXBkID0gTnVtYmVyKGN1cnJlbnQuVXBkYXRlZF9BdCA/PyAwKTtcbiAgICAgICAgICAgIGNvbnN0IGRVcGQgPSBOdW1iZXIoZHJhZnQ/LlVwZGF0ZWRfQXQgPz8gMCk7XG4gICAgICAgICAgICBjb25zdCBjdXJDdXN0ID0gU3RyaW5nKGN1cnJlbnQuQ3VzdG9tZXJfTm8gPz8gJycpO1xuICAgICAgICAgICAgY29uc3QgbmV3Q3VzdCA9IFN0cmluZyhkcmFmdD8uQ3VzdG9tZXJfTm8gPz8gJycpO1xuICAgICAgICAgICAgY29uc3Qga2V5Q2hhbmdlZCA9IFN0cmluZyhjdXJyZW50LkNhdGFsb2dfS2V5ID8/ICcnKSAhPT0gU3RyaW5nKGRyYWZ0Py5DYXRhbG9nX0tleSA/PyAnJyk7XG4gICAgICAgICAgICBjb25zdCBjb2RlQ2hhbmdlZCA9IFN0cmluZyhjdXJyZW50LkNhdGFsb2dfQ29kZSA/PyAnJykgIT09IFN0cmluZyhkcmFmdD8uQ2F0YWxvZ19Db2RlID8/ICcnKTtcbiAgICAgICAgICAgIHJldHVybiAoZFVwZCA+IGN1clVwZCkgfHwga2V5Q2hhbmdlZCB8fCBjb2RlQ2hhbmdlZCB8fCAoY3VyQ3VzdCAhPT0gbmV3Q3VzdCk7XG4gICAgICAgIH1cblxuICAgICAgICBhc3luYyBmdW5jdGlvbiBtZXJnZU9uY2UocWspIHtcbiAgICAgICAgICAgIGNvbnN0IGRyYWZ0UmVwbyA9IGF3YWl0IHVzZURyYWZ0UmVwbygpO1xuICAgICAgICAgICAgaWYgKCFkcmFmdFJlcG8pIHJldHVybiAnbm8tZGMnO1xuICAgICAgICAgICAgbGV0IGRyYWZ0ID0gKGF3YWl0IGRyYWZ0UmVwby5nZXRIZWFkZXI/LigpKSB8fCAoYXdhaXQgZHJhZnRSZXBvLmdldD8uKCkpO1xuXG4gICAgICAgICAgICAvLyBJZiBlbXB0eSwgdHJ5IGxlZ2FjeSBcImRyYWZ0XCIgc2NvcGUgYW5kIG1pZ3JhdGUgaXQgZm9yd2FyZFxuICAgICAgICAgICAgaWYgKCFkcmFmdCB8fCAhT2JqZWN0LmtleXMoZHJhZnQpLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgcmVwbzogbGVnYWN5IH0gPSBnZXRRVEYoKS51c2UoJ2RyYWZ0Jyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxlZ2FjeURyYWZ0ID0gKGF3YWl0IGxlZ2FjeS5nZXRIZWFkZXI/LigpKSB8fCAoYXdhaXQgbGVnYWN5LmdldD8uKCkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobGVnYWN5RHJhZnQgJiYgT2JqZWN0LmtleXMobGVnYWN5RHJhZnQpLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgZHJhZnRSZXBvLnBhdGNoSGVhZGVyPy4obGVnYWN5RHJhZnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZHJhZnQgPSBsZWdhY3lEcmFmdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWRyYWZ0IHx8ICFPYmplY3Qua2V5cyhkcmFmdCkubGVuZ3RoKSByZXR1cm4gJ25vLWRyYWZ0JztcblxuICAgICAgICAgICAgY29uc3QgcXVvdGVSZXBvID0gYXdhaXQgdXNlUXVvdGVSZXBvKHFrKTtcbiAgICAgICAgICAgIGlmICghcXVvdGVSZXBvKSByZXR1cm4gJ25vLXF1b3RlJztcblxuICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IChhd2FpdCBxdW90ZVJlcG8uZ2V0SGVhZGVyPy4oKSkgfHwge307XG4gICAgICAgICAgICBpZiAoIW5lZWRzTWVyZ2UoY3VycmVudCwgZHJhZnQpKSByZXR1cm4gJ25vb3AnO1xuXG4gICAgICAgICAgICBhd2FpdCBxdW90ZVJlcG8ucGF0Y2hIZWFkZXI/Lih7XG4gICAgICAgICAgICAgICAgLi4uZHJhZnQsXG4gICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBOdW1iZXIocWspLFxuICAgICAgICAgICAgICAgIFF1b3RlX0hlYWRlcl9GZXRjaGVkX0F0OiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgICAgIFByb21vdGVkX0Zyb206ICdkcmFmdCcsXG4gICAgICAgICAgICAgICAgUHJvbW90ZWRfQXQ6IERhdGUubm93KClcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0cnkgeyBhd2FpdCBkcmFmdFJlcG8uY2xlYXI/LigpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgdHJ5IHsgY29uc3QgeyByZXBvOiBsZWdhY3kgfSA9IGdldFFURigpLnVzZSgnZHJhZnQnKTsgYXdhaXQgbGVnYWN5LmNsZWFyPy4oKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIHJldHVybiAnbWVyZ2VkJztcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IFJFVFJZID0geyB0aW1lcjogbnVsbCwgdHJpZXM6IDAsIG1heDogMjAsIG1zOiAyNTAgfTtcbiAgICAgICAgZnVuY3Rpb24gc3RvcFJldHJ5KCkgeyBpZiAoUkVUUlkudGltZXIpIGNsZWFySW50ZXJ2YWwoUkVUUlkudGltZXIpOyBSRVRSWS50aW1lciA9IG51bGw7IFJFVFJZLnRyaWVzID0gMDsgfVxuICAgICAgICBmdW5jdGlvbiBwcm9tb3RlRHJhZnRUb1F1b3RlKHsgcWssIHN0cmF0ZWd5ID0gJ29uY2UnIH0gPSB7fSkge1xuICAgICAgICAgICAgaWYgKHN0cmF0ZWd5ID09PSAncmV0cnknKSB7XG4gICAgICAgICAgICAgICAgc3RvcFJldHJ5KCk7XG4gICAgICAgICAgICAgICAgUkVUUlkudGltZXIgPSBzZXRJbnRlcnZhbChhc3luYyAoKSA9PiB7IFJFVFJZLnRyaWVzKys7IGNvbnN0IHJlcyA9IGF3YWl0IG1lcmdlT25jZShxayk7IGlmIChyZXMgPT09ICdtZXJnZWQnIHx8IFJFVFJZLnRyaWVzID49IFJFVFJZLm1heCkgc3RvcFJldHJ5KCk7IH0sIFJFVFJZLm1zKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWVyZ2VPbmNlKHFrKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIC0tLS0tLS0tLS0gUXVvdGUgQ29udGV4dCAoQikgLS0tLS0tLS0tLVxuICAgICAgICBmdW5jdGlvbiBnZXROdW1iZXIodikgeyBjb25zdCBuID0gTnVtYmVyKHYpOyByZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gbiA6IDA7IH1cbiAgICAgICAgZnVuY3Rpb24gZnJvbVVybCgpIHsgdHJ5IHsgY29uc3QgdSA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7IHJldHVybiB7IHF1b3RlS2V5OiBnZXROdW1iZXIodS5zZWFyY2hQYXJhbXMuZ2V0KCdRdW90ZUtleScpIHx8IHUuc2VhcmNoUGFyYW1zLmdldCgncXVvdGVLZXknKSkgfTsgfSBjYXRjaCB7IHJldHVybiB7IHF1b3RlS2V5OiAwIH07IH0gfVxuICAgICAgICBmdW5jdGlvbiBmcm9tRG9tKCkge1xuICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1xdW90ZS1rZXldLCNRdW90ZUtleSxbbmFtZT1cIlF1b3RlS2V5XCJdJyk7XG4gICAgICAgICAgICBjb25zdCBxayA9IGVsID8gZ2V0TnVtYmVyKGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1xdW90ZS1rZXknKSA/PyBlbC52YWx1ZSkgOiAwO1xuICAgICAgICAgICAgY29uc3QgcG4gPSAoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLndpemFyZC1zdGVwcyAuYWN0aXZlLCAud2l6YXJkIC5hY3RpdmUsIC5wbGV4LXNpZGV0YWJzIC5hY3RpdmUnKT8udGV4dENvbnRlbnRcbiAgICAgICAgICAgICAgICB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGFnZS10aXRsZSwgLmNvbnRlbnQtaGVhZGVyIGgxLCAucGxleC1uYXZiYXItdGl0bGUnKT8udGV4dENvbnRlbnRcbiAgICAgICAgICAgICAgICB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpPy50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgcmV0dXJuIHsgcXVvdGVLZXk6IHFrLCBwYWdlTmFtZTogcG4gfTtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBmcm9tS28oKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGtvUm9vdCA9ICh3aW5kb3cua28gJiYgdHlwZW9mIHdpbmRvdy5rby5kYXRhRm9yID09PSAnZnVuY3Rpb24nKSA/IHdpbmRvdy5rby5kYXRhRm9yKGRvY3VtZW50LmJvZHkpIDogbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCBxayA9IGdldE51bWJlcihrb1Jvb3Q/LlF1b3RlS2V5ID8/IGtvUm9vdD8ucXVvdGVLZXkgPz8ga29Sb290Py5RdW90ZT8uUXVvdGVLZXkpIHx8IDA7XG4gICAgICAgICAgICAgICAgY29uc3QgcG4gPSBTdHJpbmcoa29Sb290Py5DdXJyZW50UGFnZU5hbWUgPz8ga29Sb290Py5jdXJyZW50UGFnZU5hbWUgPz8ga29Sb290Py5XaXphcmQ/LkN1cnJlbnRQYWdlTmFtZSA/PyAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHF1b3RlS2V5OiBxaywgcGFnZU5hbWU6IHBuIH07XG4gICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIHsgcXVvdGVLZXk6IDAsIHBhZ2VOYW1lOiAnJyB9OyB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gY29hbGVzY2UoKSB7XG4gICAgICAgICAgICBjb25zdCBhID0gZnJvbUtvKCksIGIgPSBmcm9tRG9tKCksIGMgPSBmcm9tVXJsKCk7XG4gICAgICAgICAgICBjb25zdCBxdW90ZUtleSA9IGEucXVvdGVLZXkgfHwgYi5xdW90ZUtleSB8fCBjLnF1b3RlS2V5IHx8IDA7XG4gICAgICAgICAgICBjb25zdCBwYWdlTmFtZSA9IChhLnBhZ2VOYW1lIHx8IGIucGFnZU5hbWUgfHwgZG9jdW1lbnQudGl0bGUgfHwgJycpLnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCk7XG4gICAgICAgICAgICBjb25zdCBpc09uUGFydFN1bW1hcnkgPSAoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERPTSBzaWduYWwgZnJvbSBQYXJ0IFN1bW1hcnk6IElEcyBsaWtlIFwiUXVvdGVQYXJ0U3VtbWFyeUZvcm1fKlwiXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc1BTRm9ybSA9XG4gICAgICAgICAgICAgICAgICAgICAgICAhIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNRdW90ZVBhcnRTdW1tYXJ5Rm9ybSxbaWRePVwiUXVvdGVQYXJ0U3VtbWFyeUZvcm1fXCJdJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChoYXNQU0Zvcm0pIHJldHVybiB0cnVlO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIChPcHRpb25hbCkgYWN0aXZlIHdpemFyZCBzdGVwIGxhYmVsIGVxdWFscyBcIlBhcnQgU3VtbWFyeVwiXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhY3RpdmUgJiYgYWN0aXZlLnRleHRDb250ZW50ICYmIGFjdGl2ZS50ZXh0Q29udGVudC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gJ3BhcnQgc3VtbWFyeScpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrcyAoVVJML3RpdGxlIGhldXJpc3RpY3MpXG4gICAgICAgICAgICAgICAgcmV0dXJuIC9wYXJ0XFxzKnN1bW1hcnkvaS50ZXN0KHBhZ2VOYW1lKSB8fFxuICAgICAgICAgICAgICAgICAgICAvcGFydCg/OiUyMHxcXHN8LSk/c3VtbWFyeXxzdW1tYXJ5KD86JTIwfFxcc3wtKT9wYXJ0L2kudGVzdChsb2NhdGlvbi5ocmVmKTtcbiAgICAgICAgICAgIH0pKCk7XG5cbiAgICAgICAgICAgIHJldHVybiB7IHF1b3RlS2V5LCBwYWdlTmFtZSwgaXNPblBhcnRTdW1tYXJ5IH07XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZ2V0UXVvdGVDb250ZXh0KCkge1xuICAgICAgICAgICAgY29uc3QgeyBxdW90ZUtleSwgcGFnZU5hbWUsIGlzT25QYXJ0U3VtbWFyeSB9ID0gY29hbGVzY2UoKTtcbiAgICAgICAgICAgIHJldHVybiB7IHF1b3RlS2V5LCBwYWdlTmFtZSwgaXNPblBhcnRTdW1tYXJ5LCBoYXNRdW90ZUtleTogcXVvdGVLZXkgPiAwLCBpc1BhZ2U6IChuKSA9PiBuZXcgUmVnRXhwKFN0cmluZyhuKS5yZXBsYWNlKC9cXHMrL2csICdcXFxccyonKSwgJ2knKS50ZXN0KHBhZ2VOYW1lKSB9O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gLS0tLS0tLS0tLSBIdWIgaGVscGVycyAoQykgLS0tLS0tLS0tLVxuICAgICAgICBhc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6ICduYXYnIH0pIHtcbiAgICAgICAgICAgIGNvbnN0IFIgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpID8gdW5zYWZlV2luZG93IDogd2luZG93O1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5zdXJlID0gKFIuZW5zdXJlTFRIdWIgfHwgd2luZG93LmVuc3VyZUxUSHViKTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGVuc3VyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgZW5zdXJlKG9wdHMpOyAvLyBtYXkgcmV0dXJuIHZvaWRcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGh1Yk5vdyA9ICh0eXBlb2YgbHRVSUh1YiAhPT0gJ3VuZGVmaW5lZCcpID8gbHRVSUh1YiA6IFIubHRVSUh1YjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChodWJOb3cpIHJldHVybiBodWJOb3c7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGh1Yk5vdyA9ICh0eXBlb2YgbHRVSUh1YiAhPT0gJ3VuZGVmaW5lZCcpID8gbHRVSUh1YiA6IFIubHRVSUh1YjtcbiAgICAgICAgICAgICAgICBpZiAoaHViTm93KSByZXR1cm4gaHViTm93O1xuICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IF9fZmFsbGJhY2s6IHRydWUgfTsgLy8gZmFsbGJhY2sgc2VudGluZWxcbiAgICAgICAgfVxuXG4gICAgICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZUh1YkJ1dHRvbih7XG4gICAgICAgICAgICBpZCwgbGFiZWwsIHRpdGxlLCBzaWRlID0gJ2xlZnQnLCB3ZWlnaHQgPSAxMjAsIG9uQ2xpY2ssIHNob3dXaGVuLCBmb3JjZSA9IGZhbHNlLCBtb3VudCA9ICduYXYnXG4gICAgICAgIH0gPSB7fSkge1xuICAgICAgICAgICAgY29uc3QgaHViID0gYXdhaXQgZ2V0SHViKHsgbW91bnQgfSk7XG4gICAgICAgICAgICBjb25zdCB1c2luZ1VpSHViID0gISEoaHViICYmICFodWIuX19mYWxsYmFjayAmJiB0eXBlb2YgaHViLnJlZ2lzdGVyQnV0dG9uID09PSAnZnVuY3Rpb24nKTtcblxuICAgICAgICAgICAgY29uc3Qgc2hvdWxkU2hvd05vdyA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkgeyBjb25zdCBjdHggPSBnZXRRdW90ZUNvbnRleHQoKTsgcmV0dXJuICEhKGZvcmNlIHx8ICh0eXBlb2Ygc2hvd1doZW4gPT09ICdmdW5jdGlvbicgPyBzaG93V2hlbihjdHgpIDogdHJ1ZSkpOyB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggeyByZXR1cm4gISFmb3JjZTsgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKHVzaW5nVWlIdWIpIHtcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBsaXN0SWRzKCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdiA9IGh1Yi5saXN0Py4oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheSh2KSkgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU3VwcG9ydCBhcnJheXMgb2Ygc3RyaW5ncyBPUiBhcnJheXMgb2YgeyBpZCwgLi4uIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2Lm1hcCh4ID0+ICh4ICYmIHR5cGVvZiB4ID09PSAnb2JqZWN0JykgPyB4LmlkIDogeCkuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIFtdOyB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gaXNQcmVzZW50KCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBodWIuaGFzID09PSAnZnVuY3Rpb24nKSByZXR1cm4gISFodWIuaGFzKGlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBsaXN0SWRzKCkuaW5jbHVkZXMoaWQpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgYXN5bmMgZnVuY3Rpb24gcmVnaXN0ZXIoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlZiA9IHsgaWQsIGxhYmVsLCB0aXRsZSwgd2VpZ2h0LCBvbkNsaWNrIH07XG4gICAgICAgICAgICAgICAgICAgIC8vIEFsd2F5cyBwcmVmZXIgdGhlIDItYXJnIGZvcm07IGZhbGwgYmFjayB0byAxLWFyZ1xuICAgICAgICAgICAgICAgICAgICB0cnkgeyBodWIucmVnaXN0ZXJCdXR0b24/LihzaWRlLCBkZWYpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgICAgICBhd2FpdCAwO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzUHJlc2VudCgpKSB7IHRyeSB7IGh1Yi5yZWdpc3RlckJ1dHRvbj8uKHsgLi4uZGVmLCBzZWN0aW9uOiBzaWRlIH0pOyB9IGNhdGNoIHsgfSB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgc3RpbGwgbm90IHByZXNlbnQsIHRyeSB0aGUgYWx0ZXJuYXRlIGZvcm0gZXhwbGljaXRseVxuICAgICAgICAgICAgICAgICAgICBhd2FpdCAwOyAvLyB5aWVsZFxuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzUHJlc2VudCgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGh1Yi5yZWdpc3RlckJ1dHRvbih7IC4uLmRlZiwgc2VjdGlvbjogc2lkZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IDA7XG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNQcmVzZW50KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKHNpZGUsIGRlZik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaXNQcmVzZW50KCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gZW5zdXJlUmVnKCkgeyBpZiAoaXNQcmVzZW50KCkpIHJldHVybiBmYWxzZTsgcmV0dXJuIHJlZ2lzdGVyKCk7IH1cbiAgICAgICAgICAgICAgICBlbnN1cmVSZWcoKTtcblxuICAgICAgICAgICAgICAgIGFzeW5jIGZ1bmN0aW9uIHJlY29uY2lsZSgpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHNob3cgPSBzaG91bGRTaG93Tm93KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcmVzZW50ID0gaXNQcmVzZW50KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2hvdykgeyBpZiAoIXByZXNlbnQpIGVuc3VyZVJlZygpOyByZXR1cm4gdHJ1ZTsgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXNlbnQpIGh1Yi5yZW1vdmU/LihpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBlbnN1cmVIdWJCdXR0b24uX19zdGF0ZSA9IGVuc3VyZUh1YkJ1dHRvbi5fX3N0YXRlIHx8IHt9O1xuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gZW5zdXJlSHViQnV0dG9uLl9fc3RhdGVbaWRdIHx8PSB7IG9iczogbnVsbCwgb2ZmVXJsOiBudWxsIH07XG5cbiAgICAgICAgICAgICAgICBhd2FpdCByZWNvbmNpbGUoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLm9icykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCcpIHx8IGRvY3VtZW50LmJvZHk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyb290ICYmIHdpbmRvdy5NdXRhdGlvbk9ic2VydmVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7IHJlY29uY2lsZSgpOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9icy5vYnNlcnZlKHJvb3QsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghc3RhdGUub2ZmVXJsICYmIHdpbmRvdy5UTVV0aWxzPy5vblVybENoYW5nZSkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vZmZVcmwgPSB3aW5kb3cuVE1VdGlscy5vblVybENoYW5nZSgoKSA9PiB7IHJlY29uY2lsZSgpOyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBzeW50aGVzaXplIGEgc2ltcGxlIG5hdmJhciBidXR0b24gKG9ubHkgaWYgbHQtdWktaHViIG5vdCBwcmVzZW50KVxuICAgICAgICAgICAgY29uc3QgZG9tSWQgPSBgbHQtbmF2YnRuLSR7aWR9YDtcbiAgICAgICAgICAgIGZ1bmN0aW9uIG5hdlJpZ2h0KCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjbmF2QmFyIC5uYXZiYXItcmlnaHQnKSB8fFxuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1uYXZiYXItY29udGFpbmVyIC5uYXZiYXItcmlnaHQnKSB8fFxuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubmF2YmFyLXJpZ2h0JykgfHxcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25hdkJhcicpIHx8IGRvY3VtZW50LmJvZHk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmdW5jdGlvbiBlbnN1cmVEb20oKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaG9zdCA9IG5hdlJpZ2h0KCk7IGlmICghaG9zdCkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgbGV0IGJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGRvbUlkKTtcbiAgICAgICAgICAgICAgICBpZiAoIWJ0bikge1xuICAgICAgICAgICAgICAgICAgICBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgICAgICAgICAgICAgYnRuLmlkID0gZG9tSWQ7IGJ0bi50eXBlID0gJ2J1dHRvbic7IGJ0bi5jbGFzc05hbWUgPSAnYnRuIGJ0bi1wcmltYXJ5JztcbiAgICAgICAgICAgICAgICAgICAgYnRuLnRpdGxlID0gdGl0bGUgfHwgJyc7IGJ0bi50ZXh0Q29udGVudCA9IGxhYmVsIHx8IGlkOyBidG4uc3R5bGUubWFyZ2luTGVmdCA9ICc4cHgnO1xuICAgICAgICAgICAgICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXYpID0+IHsgdHJ5IHsgb25DbGljaz8uKGV2KTsgfSBjYXRjaCB7IH0gfSk7XG4gICAgICAgICAgICAgICAgICAgIGhvc3QuYXBwZW5kQ2hpbGQoYnRuKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJ0bjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bmN0aW9uIHJlbW92ZURvbSgpIHsgY29uc3QgbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGRvbUlkKTsgaWYgKG4pIHRyeSB7IG4ucmVtb3ZlKCk7IH0gY2F0Y2ggeyB9IH1cblxuICAgICAgICAgICAgYXN5bmMgZnVuY3Rpb24gcmVjb25jaWxlRG9tKCkgeyBjb25zdCBzaG93ID0gc2hvdWxkU2hvd05vdygpOyBpZiAoc2hvdykgZW5zdXJlRG9tKCk7IGVsc2UgcmVtb3ZlRG9tKCk7IH1cblxuICAgICAgICAgICAgZW5zdXJlSHViQnV0dG9uLl9fc3RhdGUgPSBlbnN1cmVIdWJCdXR0b24uX19zdGF0ZSB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gZW5zdXJlSHViQnV0dG9uLl9fc3RhdGVbaWRdIHx8PSB7IG9iczogbnVsbCwgb2ZmVXJsOiBudWxsIH07XG5cbiAgICAgICAgICAgIGF3YWl0IHJlY29uY2lsZURvbSgpO1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5vYnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCcpIHx8IGRvY3VtZW50LmJvZHk7XG4gICAgICAgICAgICAgICAgaWYgKHJvb3QgJiYgd2luZG93Lk11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUub2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4geyByZWNvbmNpbGVEb20oKTsgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLm9icy5vYnNlcnZlKHJvb3QsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghc3RhdGUub2ZmVXJsICYmIHdpbmRvdy5UTVV0aWxzPy5vblVybENoYW5nZSkge1xuICAgICAgICAgICAgICAgIHN0YXRlLm9mZlVybCA9IHdpbmRvdy5UTVV0aWxzLm9uVXJsQ2hhbmdlKCgpID0+IHsgcmVjb25jaWxlRG9tKCk7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4geyBwcm9tb3RlRHJhZnRUb1F1b3RlLCBzdG9wUmV0cnksIHVzZURyYWZ0UmVwbywgdXNlUXVvdGVSZXBvLCBnZXRRdW90ZUNvbnRleHQsIGdldEh1YiwgZW5zdXJlSHViQnV0dG9uIH07XG4gICAgfSkoKTtcblxuICAgIC8vIEF1dG8tYXBwbHkgVEhFTUVfQ1NTIGlmIHByb3ZpZGVkIChzYWZlIG5vLW9wIG90aGVyd2lzZSlcbiAgICB0cnkgeyBjb3JlLnRoZW1lLmFwcGx5KCk7IH0gY2F0Y2ggeyB9XG5cbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOztBQVNBLEdBQUMsTUFBTTtBQUVILFVBQU0sT0FBUSxPQUFPLGlCQUFpQixjQUFjLGVBQWU7QUFDbkUsVUFBTSxLQUFNLEtBQUssS0FBSyxLQUFLLE1BQU0sQ0FBQztBQUNsQyxVQUFNLE9BQVEsR0FBRyxPQUFPLEdBQUcsUUFBUSxDQUFDO0FBS3BDLFNBQUssT0FBTyxLQUFLLFFBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUlyQixNQUFNLFNBQVM7QUFDWCxZQUFJO0FBQ0EsY0FBSSxLQUFLLFVBQVUsT0FBUSxRQUFPLE1BQU0sS0FBSyxTQUFTLE9BQU87QUFDN0QsY0FBSSxLQUFLLFNBQVMsT0FBUSxRQUFPLE1BQU0sS0FBSyxRQUFRLE9BQU87QUFBQSxRQUMvRCxRQUFRO0FBQUEsUUFBa0I7QUFDMUIsZUFBTztBQUFBLE1BQ1g7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFPQSxNQUFNLGNBQWMsSUFBSTtBQUNwQixZQUFJLE1BQU0sTUFBTSxLQUFLLEtBQUssT0FBTztBQUNqQyxZQUFJLENBQUMsS0FBSztBQUNOLGNBQUk7QUFDQSxnQkFBSSxLQUFLLFVBQVUsU0FBUztBQUN4QixvQkFBTSxLQUFLLFNBQVMsUUFBUTtBQUM1QixvQkFBTSxNQUFNLEtBQUssS0FBSyxPQUFPO0FBQUEsWUFDakMsV0FB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QU0sS0FBSztBQUNaLGdCQUFNLE9BQU8sU0FBUyxjQUFjLHdCQUF3QixLQUFLLFNBQVM7QUFDMUUsY0FBSSxRQUFRLE9BQU8sa0JBQWtCO0FBQ2pDLGtCQUFNLE1BQU0sSUFBSSxpQkFBaUIsTUFBTTtBQUFFLDJCQUFhO0FBQUEsWUFBRyxDQUFDO0FBQzFELGtCQUFNLElBQUksUUFBUSxNQUFNLEVBQUUsU0FBUyxNQUFNLFlBQVksTUFBTSxXQUFXLEtBQUssQ0FBQztBQUFBLFVBQ2hGO0FBQUEsUUFDSjtBQUNBLFlBQUksQ0FBQyxNQUFNLFVBQVUsT0FBTyxTQUFTLGFBQWE7QUFDOUMsZ0JBQU0sU0FBUyxPQUFPLFFBQVEsWUFBWSxNQUFNO0FBQUUseUJBQWE7QUFBQSxVQUFHLENBQUM7QUFBQSxRQUN2RTtBQUNBLGVBQU87QUFBQSxNQUNYO0FBRUEsYUFBTyxFQUFFLHFCQUFxQixXQUFXLGNBQWMsY0FBYyxpQkFBaUIsUUFBUSxnQkFBZ0I7QUFBQSxJQUNsSCxHQUFHO0FBR0gsUUFBSTtBQUFFLFdBQUssTUFBTSxNQUFNO0FBQUEsSUFBRyxRQUFRO0FBQUEsSUFBRTtBQUFBLEVBRXhDLEdBQUc7IiwKICAibmFtZXMiOiBbIlJPT1QiLCAiaHViTm93IiwgImxpc3RJZHMiLCAiaXNQcmVzZW50IiwgImVuc3VyZVJlZyIsICJzdGF0ZSJdCn0K
