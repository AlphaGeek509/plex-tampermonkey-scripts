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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LWNvcmUudXNlci5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gPT1Vc2VyU2NyaXB0PT1cbi8vIEBuYW1lICAgICAgICAgbHQtY29yZVxuLy8gQG5hbWVzcGFjZSAgICBsdFxuLy8gQHZlcnNpb24gICAgICAzLjguMTM2XG4vLyBAZGVzY3JpcHRpb24gIFNoYXJlZCBjb3JlOiBhdXRoICsgaHR0cCArIHBsZXggRFMgKyBodWIgKHN0YXR1cy90b2FzdCkgKyB0aGVtZSBicmlkZ2UgKyB0aW55IHV0aWxzXG4vLyBAcnVuLWF0ICAgICAgIGRvY3VtZW50LXN0YXJ0XG4vLyBAZ3JhbnQgICAgICAgIG5vbmVcbi8vID09L1VzZXJTY3JpcHQ9PVxuXG4oKCkgPT4ge1xuICAgIC8vIFByZWZlciB0aGUgcGFnZSBjb250ZXh0IGlmIGF2YWlsYWJsZSAoc28gZ2xvYmFscyBhcmUgc2hhcmVkIHdpdGggdGhlIGFwcClcbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICBjb25zdCBMVCA9IChST09ULmx0ID0gUk9PVC5sdCB8fCB7fSk7XG4gICAgY29uc3QgY29yZSA9IChMVC5jb3JlID0gTFQuY29yZSB8fCB7fSk7XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gQXV0aCAoZnJvbSB5b3VyIHBsZXgtYXV0aClcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS5hdXRoID0gY29yZS5hdXRoIHx8IHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRyeSBQbGV4QXV0aCBmaXJzdCwgdGhlbiBQbGV4QVBJOyByZXR1cm4gYmVhcmVyIHRva2VuIHN0cmluZyBvciBudWxsLlxuICAgICAgICAgKi9cbiAgICAgICAgYXN5bmMgZ2V0S2V5KCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpZiAoUk9PVC5QbGV4QXV0aD8uZ2V0S2V5KSByZXR1cm4gYXdhaXQgUk9PVC5QbGV4QXV0aC5nZXRLZXkoKTtcbiAgICAgICAgICAgICAgICBpZiAoUk9PVC5QbGV4QVBJPy5nZXRLZXkpIHJldHVybiBhd2FpdCBST09ULlBsZXhBUEkuZ2V0S2V5KCk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSdW4gYSBmdW5jdGlvbiBhZnRlciBlbnN1cmluZyB3ZSBoYXZlIGFuIGF1dGgga2V5LlxuICAgICAgICAgKiBJZiBhIHJlZnJlc2ggaG9vayBleGlzdHMgd2VcdTIwMTlsbCBhdHRlbXB0IGl0IG9uY2UuXG4gICAgICAgICAqL1xuICAgICAgICBhc3luYyB3aXRoRnJlc2hBdXRoKGZuKSB7XG4gICAgICAgICAgICBsZXQga2V5ID0gYXdhaXQgY29yZS5hdXRoLmdldEtleSgpO1xuICAgICAgICAgICAgaWYgKCFrZXkpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoUk9PVC5QbGV4QXV0aD8ucmVmcmVzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgUk9PVC5QbGV4QXV0aC5yZWZyZXNoKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSBhd2FpdCBjb3JlLmF1dGguZ2V0S2V5KCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoUk9PVC5QbGV4QVBJPy5yZWZyZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBST09ULlBsZXhBUEkucmVmcmVzaCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gYXdhaXQgY29yZS5hdXRoLmdldEtleSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZm4oa2V5IHx8IHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIEhUVFBcbiAgICAvLyBEZWxlZ2F0ZXMgdG8gVE1VdGlscy5mZXRjaERhdGEgd2hlbiBhdmFpbGFibGU7IGZhbGxzIGJhY2sgdG8gZmV0Y2goKVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBjb3JlLmh0dHAgPSBjb3JlLmh0dHAgfHwge1xuICAgICAgICBhc3luYyBmZXRjaCh1cmwsIHsgbWV0aG9kID0gJ0dFVCcsIGhlYWRlcnMgPSB7fSwgYm9keSwgdGltZW91dE1zID0gMTUwMDAsIHVzZVhIUiA9IGZhbHNlIH0gPSB7fSkge1xuICAgICAgICAgICAgaWYgKFJPT1QuVE1VdGlscz8uZmV0Y2hEYXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IFJPT1QuVE1VdGlscy5mZXRjaERhdGEodXJsLCB7IG1ldGhvZCwgaGVhZGVycywgYm9keSwgdGltZW91dE1zLCB1c2VYSFIgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBuYXRpdmUgZmV0Y2ggd2l0aCBBdXRob3JpemF0aW9uIChmcm9tIHBsZXgtYXV0aClcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGF3YWl0IGNvcmUuYXV0aC5nZXRLZXkoKTtcbiAgICAgICAgICAgIGNvbnN0IGggPSBuZXcgSGVhZGVycyhoZWFkZXJzIHx8IHt9KTtcbiAgICAgICAgICAgIGlmIChrZXkgJiYgIWguaGFzKCdBdXRob3JpemF0aW9uJykpIGguc2V0KCdBdXRob3JpemF0aW9uJywgYEJlYXJlciAke2tleX1gKTtcbiAgICAgICAgICAgIGlmIChib2R5ICYmICFoLmhhcygnQ29udGVudC1UeXBlJykpIGguc2V0KCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbicpO1xuXG4gICAgICAgICAgICBjb25zdCBjdGwgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgICAgICAgICBjb25zdCB0ID0gc2V0VGltZW91dCgoKSA9PiBjdGwuYWJvcnQoKSwgdGltZW91dE1zKTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaCh1cmwsIHtcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kLFxuICAgICAgICAgICAgICAgICAgICBoZWFkZXJzOiBoLFxuICAgICAgICAgICAgICAgICAgICBib2R5OiBib2R5ICYmIHR5cGVvZiBib2R5ICE9PSAnc3RyaW5nJyA/IEpTT04uc3RyaW5naWZ5KGJvZHkpIDogYm9keSxcbiAgICAgICAgICAgICAgICAgICAgc2lnbmFsOiBjdGwuc2lnbmFsLFxuICAgICAgICAgICAgICAgICAgICBjcmVkZW50aWFsczogJ2luY2x1ZGUnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29uc3QgY3QgPSByZXMuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpIHx8ICcnO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBjdC5pbmNsdWRlcygnYXBwbGljYXRpb24vanNvbicpID8gYXdhaXQgcmVzLmpzb24oKSA6IGF3YWl0IHJlcy50ZXh0KCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXMub2spIHRocm93IG5ldyBFcnJvcihgSFRUUCAke3Jlcy5zdGF0dXN9ICR7cmVzLnN0YXR1c1RleHR9YCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBhc3luYyBnZXQodXJsLCBvcHRzID0ge30pIHsgcmV0dXJuIHRoaXMuZmV0Y2godXJsLCB7IC4uLihvcHRzIHx8IHt9KSwgbWV0aG9kOiAnR0VUJyB9KTsgfSxcbiAgICAgICAgYXN5bmMgcG9zdCh1cmwsIGJvZHksIG9wdHMgPSB7fSkgeyByZXR1cm4gdGhpcy5mZXRjaCh1cmwsIHsgLi4uKG9wdHMgfHwge30pLCBtZXRob2Q6ICdQT1NUJywgYm9keSB9KTsgfVxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFBsZXggRFMgaGVscGVyc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS5wbGV4ID0gY29yZS5wbGV4IHx8IHtcbiAgICAgICAgYXN5bmMgZHMoc291cmNlSWQsIHBheWxvYWQgPSB7fSwgb3B0cyA9IHt9KSB7XG4gICAgICAgICAgICBpZiAoUk9PVC5UTVV0aWxzPy5kcykgcmV0dXJuIGF3YWl0IFJPT1QuVE1VdGlscy5kcyhzb3VyY2VJZCwgcGF5bG9hZCwgb3B0cyk7XG5cbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBkaXJlY3QgUE9TVCB0byBEUyBlbmRwb2ludCAoZm9ybWF0PTIgXHUyMTkyIHJvd3MgaW4gYXJyYXkpXG4gICAgICAgICAgICBjb25zdCBiYXNlID0gbG9jYXRpb24ub3JpZ2luLnJlcGxhY2UoL1xcLyQvLCAnJyk7XG4gICAgICAgICAgICBjb25zdCB1cmwgPSBgJHtiYXNlfS9hcGkvZGF0YXNvdXJjZXMvJHtzb3VyY2VJZH0vZXhlY3V0ZT9mb3JtYXQ9MmA7XG4gICAgICAgICAgICBjb25zdCBqc29uID0gYXdhaXQgY29yZS5odHRwLnBvc3QodXJsLCBwYXlsb2FkLCBvcHRzKTtcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBBcnJheS5pc0FycmF5KGpzb24/LnJvd3MpID8ganNvbi5yb3dzIDogW107XG4gICAgICAgICAgICByZXR1cm4geyAuLi5qc29uLCByb3dzIH07XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXN5bmMgZHNSb3dzKHNvdXJjZUlkLCBwYXlsb2FkID0ge30sIG9wdHMgPSB7fSkge1xuICAgICAgICAgICAgaWYgKFJPT1QuVE1VdGlscz8uZHNSb3dzKSByZXR1cm4gYXdhaXQgUk9PVC5UTVV0aWxzLmRzUm93cyhzb3VyY2VJZCwgcGF5bG9hZCwgb3B0cyk7XG4gICAgICAgICAgICBjb25zdCB7IHJvd3MgfSA9IGF3YWl0IHRoaXMuZHMoc291cmNlSWQsIHBheWxvYWQsIG9wdHMpO1xuICAgICAgICAgICAgcmV0dXJuIHJvd3M7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLSBIdWIgZmFjYWRlIChwcmVmZXJzIGx0LXVpLWh1YjsgbW91bnRzIG9uIGZpcnN0IHVzZSkgLS0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUuaHViID0gY29yZS5odWIgfHwgKCgpID0+IHtcbiAgICAgICAgLy8gLS0tIHNtYWxsIHBpbGwgZmFsbGJhY2sgKHVzZWQgb25seSBpZiBsdC11aS1odWIgbWlzc2luZykgLS0tXG4gICAgICAgIGNvbnN0IGZhbGxiYWNrID0gKCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGFwaSA9IHt9O1xuICAgICAgICAgICAgYXBpLl9zdGlja3kgPSBmYWxzZTtcblxuICAgICAgICAgICAgZnVuY3Rpb24gZW5zdXJlUGlsbCgpIHtcbiAgICAgICAgICAgICAgICBsZXQgcGlsbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNsdC1odWItcGlsbCcpO1xuICAgICAgICAgICAgICAgIGlmICghcGlsbCkge1xuICAgICAgICAgICAgICAgICAgICBwaWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgICAgIHBpbGwuaWQgPSAnbHQtaHViLXBpbGwnO1xuICAgICAgICAgICAgICAgICAgICBwaWxsLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b3A6IDEwcHg7IHJpZ2h0OiAxMHB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgei1pbmRleDogMjE0NzQ4MzAwMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6ICNmZmY7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250OiAxM3B4IHN5c3RlbS11aSwgLWFwcGxlLXN5c3RlbSwgU2Vnb2UgVUksIFJvYm90bywgc2Fucy1zZXJpZjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhZGRpbmc6IDZweCAxMHB4OyBib3JkZXItcmFkaXVzOiA5OTlweDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgOHB4IDI0cHggcmdiYSgwLDAsMCwwLjI1KTtcbiAgICAgICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgICAgICAgICAgcGlsbC50ZXh0Q29udGVudCA9ICdcdTIwMjYnO1xuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuYXBwZW5kQ2hpbGQocGlsbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBwaWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBhcGkuc2V0U3RhdHVzID0gKHRleHQsIHRvbmUgPSAnaW5mbycsIHsgc3RpY2t5ID0gZmFsc2UgfSA9IHt9KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZWwgPSBlbnN1cmVQaWxsKCk7XG4gICAgICAgICAgICAgICAgZWwudGV4dENvbnRlbnQgPSB0ZXh0IHx8ICcnO1xuICAgICAgICAgICAgICAgIGFwaS5fc3RpY2t5ID0gISFzdGlja3k7XG4gICAgICAgICAgICAgICAgaWYgKCFhcGkuX3N0aWNreSkgc2V0VGltZW91dCgoKSA9PiB7IHRyeSB7IGVsLnJlbW92ZSgpOyB9IGNhdGNoIHsgfSB9LCAyMDAwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgYXBpLm5vdGlmeSA9IChfbGV2ZWwsIHRleHQsIHsgbXMgPSAyNTAwIH0gPSB7fSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVsID0gZW5zdXJlUGlsbCgpO1xuICAgICAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gdGV4dCB8fCAnJztcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgdHJ5IHsgZWwucmVtb3ZlKCk7IH0gY2F0Y2ggeyB9IH0sIE1hdGgubWF4KDUwMCwgbXMgfCAwKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGFwaS50b2FzdCA9IChtc2csIG1zID0gMzAwMCkgPT4gYXBpLm5vdGlmeSgnaW5mbycsIG1zZywgeyBtcyB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgfSkoKTtcblxuICAgICAgICAvLyAtLS0gcXVldWUgdW50aWwgbHQtdWktaHViIG1vdW50cyAtLS1cbiAgICAgICAgbGV0IG1vdW50ZWQgPSBmYWxzZTtcbiAgICAgICAgbGV0IG1vdW50aW5nID0gbnVsbDsgICAgICAgICAgICAgICAvLyBQcm9taXNlXG4gICAgICAgIGNvbnN0IHF1ZXVlID0gW107ICAgICAgICAgICAgICAgICAgLy8gW3tmbiwgYXJnc31dXG5cbiAgICAgICAgYXN5bmMgZnVuY3Rpb24gbW91bnRVaUh1Yk9uY2UoKSB7XG4gICAgICAgICAgICBpZiAobW91bnRlZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICBpZiAobW91bnRpbmcpIHJldHVybiBtb3VudGluZztcblxuICAgICAgICAgICAgbW91bnRpbmcgPSAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIGVuc3VyZUxUSHViIGlzIGF2YWlsYWJsZSwgbW91bnQgdGhlIGZ1bGwtd2lkdGggYmFyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVuc3VyZUZuID1cbiAgICAgICAgICAgICAgICAgICAgICAgICh0eXBlb2YgZW5zdXJlTFRIdWIgPT09ICdmdW5jdGlvbicpID8gZW5zdXJlTFRIdWIgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICh0eXBlb2YgUk9PVC5lbnN1cmVMVEh1YiA9PT0gJ2Z1bmN0aW9uJyA/IFJPT1QuZW5zdXJlTFRIdWIgOiBudWxsKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZW5zdXJlRm4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGVuc3VyZUZuKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGVtZTogeyBuYW1lOiAnT25lTW9ucm9lJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGRlZmF1bHQgdG8gYm9keTsgaG9ub3IgYW55IGVhcmxpZXIgc2VsZWN0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbW91bnQ6IChST09ULl9fTFRfSFVCX01PVU5UIHx8ICduYXYnKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYWdlUm9vdFNlbGVjdG9yczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnI3BsZXhTaWRldGFic01lbnVQYWdlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICcucGxleC1zaWRldGFicy1tZW51LXBhZ2UtY29udGVudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICcucGxleC1zaWRldGFicy1tZW51LXBhZ2UtY29udGVudC1jb250YWluZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnLnBsZXgtYWN0aW9ucy13cmFwcGVyJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2hlbiBsaXZpbmcgaW4gdGhlIG5hdmJhciB3ZSBuZXZlciB3YW50IHRvIGFsdGVyIHBhZ2UgbGF5b3V0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RpY2s6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdhcDogOFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBodWJPYmogPSAodHlwZW9mIGx0VUlIdWIgIT09ICd1bmRlZmluZWQnKSA/IGx0VUlIdWIgOiBST09ULmx0VUlIdWI7XG4gICAgICAgICAgICAgICAgICAgIG1vdW50ZWQgPSAhIWh1Yk9iajtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1vdW50ZWQ7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgIG1vdW50ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGZsdXNoIHF1ZXVlZCBjYWxscyB0aHJvdWdoIGVpdGhlciB1aS1odWIgKGlmIG1vdW50ZWQpIG9yIGZhbGxiYWNrXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGh1YiA9IG1vdW50ZWQgPyBST09ULmx0VUlIdWIgOiBudWxsO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHsgZm4sIGFyZ3MgfSBvZiBxdWV1ZS5zcGxpY2UoMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGh1YiAmJiB0eXBlb2YgaHViW2ZuXSA9PT0gJ2Z1bmN0aW9uJykgaHViW2ZuXSguLi5hcmdzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGZhbGxiYWNrW2ZuXSguLi5hcmdzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkoKTtcblxuICAgICAgICAgICAgcmV0dXJuIG1vdW50aW5nO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZGVsZWdhdGVPclF1ZXVlKGZuLCAuLi5hcmdzKSB7XG4gICAgICAgICAgICAvLyBJZiBsdC11aS1odWIgaXMgYWxyZWFkeSBtb3VudGVkLCBkZWxlZ2F0ZSBpbW1lZGlhdGVseVxuICAgICAgICAgICAgY29uc3QgaHViTm93ID0gbW91bnRlZFxuICAgICAgICAgICAgICAgID8gKCh0eXBlb2YgbHRVSUh1YiAhPT0gJ3VuZGVmaW5lZCcpID8gbHRVSUh1YiA6IFJPT1QubHRVSUh1YilcbiAgICAgICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgICAgIGlmIChodWJOb3cgJiYgdHlwZW9mIGh1Yk5vd1tmbl0gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyBodWJOb3dbZm5dKC4uLmFyZ3MpOyB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIElmIHdlIGNhbiBtb3VudCAoc2FuZGJveCBvciB3aW5kb3cpLCBxdWV1ZSBhbmQga2ljayBpdCBvZmZcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZW5zdXJlTFRIdWIgPT09ICdmdW5jdGlvbicgfHwgdHlwZW9mIFJPT1QuZW5zdXJlTFRIdWIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBxdWV1ZS5wdXNoKHsgZm4sIGFyZ3MgfSk7XG4gICAgICAgICAgICAgICAgbW91bnRVaUh1Yk9uY2UoKTsgIC8vIGZpcmUgJiBmb3JnZXRcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE5vIHVpLWh1YiBhdmFpbGFibGUgXHUyMTkyIGZhbGxiYWNrIGltbWVkaWF0ZWx5XG4gICAgICAgICAgICBmYWxsYmFja1tmbl0oLi4uYXJncyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQdWJsaWMgQVBJIChzeW5jIGxvb2tpbmc7IGludGVybmFsbHkgcXVldWVzL2RlbGVnYXRlcylcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHNldFN0YXR1cyh0ZXh0LCB0b25lID0gJ2luZm8nLCBvcHRzID0ge30pIHsgZGVsZWdhdGVPclF1ZXVlKCdzZXRTdGF0dXMnLCB0ZXh0LCB0b25lLCBvcHRzKTsgcmV0dXJuIHRoaXM7IH0sXG5cbiAgICAgICAgICAgIG5vdGlmeSh0ZXh0LCB0b25lID0gJ2luZm8nLCBvcHRzID0ge30pIHtcbiAgICAgICAgICAgICAgICAvLyBsdC11aS1odWIgc2lnbmF0dXJlOiBub3RpZnkoa2luZCwgdGV4dCwge21zLCBzdGlja3ksIHRvYXN0fSlcbiAgICAgICAgICAgICAgICBjb25zdCBtcyA9IG9wdHM/LnRpbWVvdXQgPz8gb3B0cz8ubXMgPz8gMjUwMDtcbiAgICAgICAgICAgICAgICBkZWxlZ2F0ZU9yUXVldWUoJ25vdGlmeScsIHRvbmUsIHRleHQsIHsgbXMsIHN0aWNreTogISFvcHRzPy5zdGlja3ksIHRvYXN0OiAhIW9wdHM/LnRvYXN0IH0pO1xuICAgICAgICAgICAgICAgIGlmICghbW91bnRlZCAmJiB0eXBlb2YgUk9PVC5lbnN1cmVMVEh1YiAhPT0gJ2Z1bmN0aW9uJykgZmFsbGJhY2subm90aWZ5KHRleHQsIHRvbmUsIG9wdHMpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRvYXN0KG1zZywgdGltZW91dCA9IDMwMDApIHtcbiAgICAgICAgICAgICAgICBkZWxlZ2F0ZU9yUXVldWUoJ25vdGlmeScsICdpbmZvJywgbXNnLCB7IG1zOiB0aW1lb3V0LCB0b2FzdDogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICBpZiAoIW1vdW50ZWQgJiYgdHlwZW9mIFJPT1QuZW5zdXJlTFRIdWIgIT09ICdmdW5jdGlvbicpIGZhbGxiYWNrLnRvYXN0KG1zZywgdGltZW91dCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdXBkYXRlQnV0dG9uKGlkLCBwYXRjaCA9IHt9KSB7XG4gICAgICAgICAgICAgICAgZGVsZWdhdGVPclF1ZXVlKCd1cGRhdGVCdXR0b24nLCBpZCwgcGF0Y2gpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJlZ2luVGFzayhsYWJlbCwgdG9uZSA9ICdpbmZvJykge1xuICAgICAgICAgICAgICAgIGlmIChtb3VudGVkICYmIFJPT1QubHRVSUh1Yj8uYmVnaW5UYXNrKSByZXR1cm4gUk9PVC5sdFVJSHViLmJlZ2luVGFzayhsYWJlbCwgdG9uZSk7XG4gICAgICAgICAgICAgICAgLy8gcXVldWUgYSBzeW50aGV0aWMgYmVnaW5UYXNrIHVzaW5nIHN0YXR1cyArIHN1Y2Nlc3MvZXJyb3IgaGVscGVyc1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdHVzKGxhYmVsLCB0b25lLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBjdGwgPSB7XG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZTogKHR4dCwgdCA9IHRvbmUpID0+IHsgdGhpcy5zZXRTdGF0dXModHh0LCB0LCB7IHN0aWNreTogdHJ1ZSB9KTsgcmV0dXJuIGN0bDsgfSxcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogKG1zZyA9ICdEb25lJywgbXMgPSAyNTAwKSA9PiB7IHRoaXMuc2V0U3RhdHVzKCcnLCAnaW5mbycsIHsgc3RpY2t5OiBmYWxzZSB9KTsgdGhpcy5ub3RpZnkobXNnLCAnc3VjY2VzcycsIHsgdGltZW91dDogbXMgfSk7IHJldHVybiBjdGw7IH0sXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiAobXNnID0gJ0ZhaWxlZCcpID0+IHsgdGhpcy5zZXRTdGF0dXMoJycsICdpbmZvJywgeyBzdGlja3k6IGZhbHNlIH0pOyB0aGlzLm5vdGlmeShtc2csICdlcnJvcicsIHsgdGltZW91dDogMzUwMCB9KTsgcmV0dXJuIGN0bDsgfSxcbiAgICAgICAgICAgICAgICAgICAgY2xlYXI6ICgpID0+IHsgdGhpcy5zZXRTdGF0dXMoJycsICdpbmZvJywgeyBzdGlja3k6IGZhbHNlIH0pOyByZXR1cm4gY3RsOyB9LFxuICAgICAgICAgICAgICAgICAgICBkb25lOiAobXNnLCBtcykgPT4gY3RsLnN1Y2Nlc3MobXNnLCBtcylcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIC8vIHRyeSB0byB1cGdyYWRlIHRvIGx0LXVpLWh1YiByZWFsIHRhc2sgYWZ0ZXIgbW91bnRcbiAgICAgICAgICAgICAgICBtb3VudFVpSHViT25jZSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBodWJOb3cgPSAodHlwZW9mIGx0VUlIdWIgIT09ICd1bmRlZmluZWQnKSA/IGx0VUlIdWIgOiBST09ULmx0VUlIdWI7XG4gICAgICAgICAgICAgICAgICAgIGlmIChodWJOb3c/LmJlZ2luVGFzaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHsgaHViTm93LmJlZ2luVGFzayhsYWJlbCwgdG9uZSk7IH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGN0bDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9KSgpO1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFRoZW1lIGJyaWRnZSAoQHJlc291cmNlIFRIRU1FX0NTUyBcdTIxOTIgR01fYWRkU3R5bGUpXG4gICAgLy8gR3JhbnRzIGFyZSBleHBlY3RlZCBpbiB0aGUgcGFyZW50IChlbnRyeSkgYmFubmVyOyB0aGlzIGlzIHNhZmUgbm8tb3AuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUudGhlbWUgPSBjb3JlLnRoZW1lIHx8IHtcbiAgICAgICAgYXBwbHkoKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIE9ubHkgbWFpbiBzY3JpcHRcdTIwMTlzIEBncmFudCBtYXR0ZXJzOyBAcmVxdWlyZSBtZXRhZGF0YSBpcyBpZ25vcmVkIGJ5IFRNXG4gICAgICAgICAgICAgICAgY29uc3QgY3NzID0gKHR5cGVvZiBHTV9nZXRSZXNvdXJjZVRleHQgPT09ICdmdW5jdGlvbicpID8gR01fZ2V0UmVzb3VyY2VUZXh0KCdUSEVNRV9DU1MnKSA6ICcnO1xuICAgICAgICAgICAgICAgIGlmIChjc3MgJiYgdHlwZW9mIEdNX2FkZFN0eWxlID09PSAnZnVuY3Rpb24nKSBHTV9hZGRTdHlsZShjc3MpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHRyeSB7IGNvbnNvbGUud2FybignW2x0LWNvcmVdIHRoZW1lLmFwcGx5IGZhaWxlZCcsIGUpOyB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gU21hbGwgdXRpbGl0aWVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUudXRpbCA9IGNvcmUudXRpbCB8fCB7XG4gICAgICAgIHNsZWVwKG1zKSB7IHJldHVybiBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgTWF0aC5tYXgoMCwgbXMgfCAwKSkpOyB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSdW4gYSBmdW5jdGlvbiBvbmx5IG9uY2UgcGVyIGtleSAocGVyIHBhZ2UgbG9hZCkuXG4gICAgICAgICAqL1xuICAgICAgICBvbmNlKGtleSwgZm4pIHtcbiAgICAgICAgICAgIGNvbnN0IHN0b3JlID0gKGNvcmUuX19vbmNlID0gY29yZS5fX29uY2UgfHwgbmV3IFNldCgpKTtcbiAgICAgICAgICAgIGlmIChzdG9yZS5oYXMoa2V5KSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHN0b3JlLmFkZChrZXkpO1xuICAgICAgICAgICAgcmV0dXJuIGZuKCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIERhdGEgKGludGVudGlvbmFsbHkgYmxhbmsgaW4gY29yZSlcbiAgICAvLyBEbyBOT1QgZGVmaW5lIGNvcmUuZGF0YSBoZXJlOyBsdC1kYXRhLWNvcmUgLyB5b3VyIHJlcG9zIGF1Z21lbnQgaXQuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBRVCBoZWxwZXJzOiByZXBvcyArIHByb21vdGlvbiArIHF1b3RlIGNvbnRleHQgKyBodWIgYnV0dG9uXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS5xdCA9IGNvcmUucXQgfHwgKCgpID0+IHtcbiAgICAgICAgY29uc3QgUk9PVCA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJykgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3c7XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0VGFiU2NvcGVJZChucyA9ICdRVCcpIHtcbiAgICAgICAgICAgIHRyeSB7IGlmICh0eXBlb2YgUk9PVC5nZXRUYWJTY29wZUlkID09PSAnZnVuY3Rpb24nKSByZXR1cm4gUk9PVC5nZXRUYWJTY29wZUlkKG5zKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RvcmFnZSA9IFJPT1Quc2Vzc2lvblN0b3JhZ2U7XG4gICAgICAgICAgICAgICAgY29uc3QgSyA9IGBsdDoke25zfTpfX3Njb3BlSWRgO1xuICAgICAgICAgICAgICAgIGxldCB2ID0gc3RvcmFnZS5nZXRJdGVtKEspO1xuICAgICAgICAgICAgICAgIGlmICghdikge1xuICAgICAgICAgICAgICAgICAgICB2ID0gU3RyaW5nKE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDIxNDc0ODM2NDcpKTtcbiAgICAgICAgICAgICAgICAgICAgc3RvcmFnZS5zZXRJdGVtKEssIHYpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBuID0gTnVtYmVyKHYpO1xuICAgICAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pIHx8IG4gPD0gMCkgdGhyb3cgbmV3IEVycm9yKCdiYWQgc2NvcGUnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9ICdfX0xUX1FUX1NDT1BFX0lEX18nO1xuICAgICAgICAgICAgICAgIGlmICghUk9PVFtrZXldKSBST09UW2tleV0gPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAyMTQ3NDgzNjQ3KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gUk9PVFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0UVRGKCkge1xuICAgICAgICAgICAgY29uc3QgbWFrZSA9IFJPT1QubHQ/LmNvcmU/LmRhdGE/Lm1ha2VGbGF0U2NvcGVkUmVwbztcbiAgICAgICAgICAgIHJldHVybiAodHlwZW9mIG1ha2UgPT09ICdmdW5jdGlvbicpID8gbWFrZSh7IG5zOiAnUVQnLCBlbnRpdHk6ICdxdW90ZScsIGxlZ2FjeUVudGl0eTogJ1F1b3RlSGVhZGVyJyB9KSA6IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBhc3luYyBmdW5jdGlvbiB1c2VEcmFmdFJlcG8oKSB7XG4gICAgICAgICAgICBjb25zdCBRVEYgPSBnZXRRVEYoKTtcbiAgICAgICAgICAgIGlmICghUVRGKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShnZXRUYWJTY29wZUlkKCdRVCcpKTtcbiAgICAgICAgICAgIHJldHVybiByZXBvIHx8IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBhc3luYyBmdW5jdGlvbiB1c2VRdW90ZVJlcG8ocWspIHtcbiAgICAgICAgICAgIGNvbnN0IFFURiA9IGdldFFURigpO1xuICAgICAgICAgICAgaWYgKCFRVEYgfHwgIXFrIHx8ICFOdW1iZXIuaXNGaW5pdGUocWspIHx8IHFrIDw9IDApIHJldHVybiBudWxsO1xuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSBRVEYudXNlKE51bWJlcihxaykpO1xuICAgICAgICAgICAgcmV0dXJuIHJlcG8gfHwgbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIC0tLS0tLS0tLS0gUHJvbW90aW9uIChBKSAtLS0tLS0tLS0tXG4gICAgICAgIGZ1bmN0aW9uIG5lZWRzTWVyZ2UoY3VycmVudCA9IHt9LCBkcmFmdCA9IHt9KSB7XG4gICAgICAgICAgICBjb25zdCBjdXJVcGQgPSBOdW1iZXIoY3VycmVudC5VcGRhdGVkX0F0ID8/IDApO1xuICAgICAgICAgICAgY29uc3QgZFVwZCA9IE51bWJlcihkcmFmdD8uVXBkYXRlZF9BdCA/PyAwKTtcbiAgICAgICAgICAgIGNvbnN0IGN1ckN1c3QgPSBTdHJpbmcoY3VycmVudC5DdXN0b21lcl9ObyA/PyAnJyk7XG4gICAgICAgICAgICBjb25zdCBuZXdDdXN0ID0gU3RyaW5nKGRyYWZ0Py5DdXN0b21lcl9ObyA/PyAnJyk7XG4gICAgICAgICAgICBjb25zdCBrZXlDaGFuZ2VkID0gU3RyaW5nKGN1cnJlbnQuQ2F0YWxvZ19LZXkgPz8gJycpICE9PSBTdHJpbmcoZHJhZnQ/LkNhdGFsb2dfS2V5ID8/ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IGNvZGVDaGFuZ2VkID0gU3RyaW5nKGN1cnJlbnQuQ2F0YWxvZ19Db2RlID8/ICcnKSAhPT0gU3RyaW5nKGRyYWZ0Py5DYXRhbG9nX0NvZGUgPz8gJycpO1xuICAgICAgICAgICAgcmV0dXJuIChkVXBkID4gY3VyVXBkKSB8fCBrZXlDaGFuZ2VkIHx8IGNvZGVDaGFuZ2VkIHx8IChjdXJDdXN0ICE9PSBuZXdDdXN0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFzeW5jIGZ1bmN0aW9uIG1lcmdlT25jZShxaykge1xuICAgICAgICAgICAgY29uc3QgZHJhZnRSZXBvID0gYXdhaXQgdXNlRHJhZnRSZXBvKCk7XG4gICAgICAgICAgICBpZiAoIWRyYWZ0UmVwbykgcmV0dXJuICduby1kYyc7XG4gICAgICAgICAgICBsZXQgZHJhZnQgPSAoYXdhaXQgZHJhZnRSZXBvLmdldEhlYWRlcj8uKCkpIHx8IChhd2FpdCBkcmFmdFJlcG8uZ2V0Py4oKSk7XG5cbiAgICAgICAgICAgIC8vIElmIGVtcHR5LCB0cnkgbGVnYWN5IFwiZHJhZnRcIiBzY29wZSBhbmQgbWlncmF0ZSBpdCBmb3J3YXJkXG4gICAgICAgICAgICBpZiAoIWRyYWZ0IHx8ICFPYmplY3Qua2V5cyhkcmFmdCkubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeyByZXBvOiBsZWdhY3kgfSA9IGdldFFURigpLnVzZSgnZHJhZnQnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGVnYWN5RHJhZnQgPSAoYXdhaXQgbGVnYWN5LmdldEhlYWRlcj8uKCkpIHx8IChhd2FpdCBsZWdhY3kuZ2V0Py4oKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChsZWdhY3lEcmFmdCAmJiBPYmplY3Qua2V5cyhsZWdhY3lEcmFmdCkubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBkcmFmdFJlcG8ucGF0Y2hIZWFkZXI/LihsZWdhY3lEcmFmdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkcmFmdCA9IGxlZ2FjeURyYWZ0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghZHJhZnQgfHwgIU9iamVjdC5rZXlzKGRyYWZ0KS5sZW5ndGgpIHJldHVybiAnbm8tZHJhZnQnO1xuXG4gICAgICAgICAgICBjb25zdCBxdW90ZVJlcG8gPSBhd2FpdCB1c2VRdW90ZVJlcG8ocWspO1xuICAgICAgICAgICAgaWYgKCFxdW90ZVJlcG8pIHJldHVybiAnbm8tcXVvdGUnO1xuXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gKGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXI/LigpKSB8fCB7fTtcbiAgICAgICAgICAgIGlmICghbmVlZHNNZXJnZShjdXJyZW50LCBkcmFmdCkpIHJldHVybiAnbm9vcCc7XG5cbiAgICAgICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcj8uKHtcbiAgICAgICAgICAgICAgICAuLi5kcmFmdCxcbiAgICAgICAgICAgICAgICBRdW90ZV9LZXk6IE51bWJlcihxayksXG4gICAgICAgICAgICAgICAgUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQ6IERhdGUubm93KCksXG4gICAgICAgICAgICAgICAgUHJvbW90ZWRfRnJvbTogJ2RyYWZ0JyxcbiAgICAgICAgICAgICAgICBQcm9tb3RlZF9BdDogRGF0ZS5ub3coKVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRyeSB7IGF3YWl0IGRyYWZ0UmVwby5jbGVhcj8uKCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB0cnkgeyBjb25zdCB7IHJlcG86IGxlZ2FjeSB9ID0gZ2V0UVRGKCkudXNlKCdkcmFmdCcpOyBhd2FpdCBsZWdhY3kuY2xlYXI/LigpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgcmV0dXJuICdtZXJnZWQnO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgUkVUUlkgPSB7IHRpbWVyOiBudWxsLCB0cmllczogMCwgbWF4OiAyMCwgbXM6IDI1MCB9O1xuICAgICAgICBmdW5jdGlvbiBzdG9wUmV0cnkoKSB7IGlmIChSRVRSWS50aW1lcikgY2xlYXJJbnRlcnZhbChSRVRSWS50aW1lcik7IFJFVFJZLnRpbWVyID0gbnVsbDsgUkVUUlkudHJpZXMgPSAwOyB9XG4gICAgICAgIGZ1bmN0aW9uIHByb21vdGVEcmFmdFRvUXVvdGUoeyBxaywgc3RyYXRlZ3kgPSAnb25jZScgfSA9IHt9KSB7XG4gICAgICAgICAgICBpZiAoc3RyYXRlZ3kgPT09ICdyZXRyeScpIHtcbiAgICAgICAgICAgICAgICBzdG9wUmV0cnkoKTtcbiAgICAgICAgICAgICAgICBSRVRSWS50aW1lciA9IHNldEludGVydmFsKGFzeW5jICgpID0+IHsgUkVUUlkudHJpZXMrKzsgY29uc3QgcmVzID0gYXdhaXQgbWVyZ2VPbmNlKHFrKTsgaWYgKHJlcyA9PT0gJ21lcmdlZCcgfHwgUkVUUlkudHJpZXMgPj0gUkVUUlkubWF4KSBzdG9wUmV0cnkoKTsgfSwgUkVUUlkubXMpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtZXJnZU9uY2UocWspO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gLS0tLS0tLS0tLSBRdW90ZSBDb250ZXh0IChCKSAtLS0tLS0tLS0tXG4gICAgICAgIGZ1bmN0aW9uIGdldE51bWJlcih2KSB7IGNvbnN0IG4gPSBOdW1iZXIodik7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUobikgPyBuIDogMDsgfVxuICAgICAgICBmdW5jdGlvbiBmcm9tVXJsKCkgeyB0cnkgeyBjb25zdCB1ID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTsgcmV0dXJuIHsgcXVvdGVLZXk6IGdldE51bWJlcih1LnNlYXJjaFBhcmFtcy5nZXQoJ1F1b3RlS2V5JykgfHwgdS5zZWFyY2hQYXJhbXMuZ2V0KCdxdW90ZUtleScpKSB9OyB9IGNhdGNoIHsgcmV0dXJuIHsgcXVvdGVLZXk6IDAgfTsgfSB9XG4gICAgICAgIGZ1bmN0aW9uIGZyb21Eb20oKSB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXF1b3RlLWtleV0sI1F1b3RlS2V5LFtuYW1lPVwiUXVvdGVLZXlcIl0nKTtcbiAgICAgICAgICAgIGNvbnN0IHFrID0gZWwgPyBnZXROdW1iZXIoZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXF1b3RlLWtleScpID8/IGVsLnZhbHVlKSA6IDA7XG4gICAgICAgICAgICBjb25zdCBwbiA9IChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcud2l6YXJkLXN0ZXBzIC5hY3RpdmUsIC53aXphcmQgLmFjdGl2ZSwgLnBsZXgtc2lkZXRhYnMgLmFjdGl2ZScpPy50ZXh0Q29udGVudFxuICAgICAgICAgICAgICAgIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wYWdlLXRpdGxlLCAuY29udGVudC1oZWFkZXIgaDEsIC5wbGV4LW5hdmJhci10aXRsZScpPy50ZXh0Q29udGVudFxuICAgICAgICAgICAgICAgIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1thcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICByZXR1cm4geyBxdW90ZUtleTogcWssIHBhZ2VOYW1lOiBwbiB9O1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGZyb21LbygpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qga29Sb290ID0gKHdpbmRvdy5rbyAmJiB0eXBlb2Ygd2luZG93LmtvLmRhdGFGb3IgPT09ICdmdW5jdGlvbicpID8gd2luZG93LmtvLmRhdGFGb3IoZG9jdW1lbnQuYm9keSkgOiBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IHFrID0gZ2V0TnVtYmVyKGtvUm9vdD8uUXVvdGVLZXkgPz8ga29Sb290Py5xdW90ZUtleSA/PyBrb1Jvb3Q/LlF1b3RlPy5RdW90ZUtleSkgfHwgMDtcbiAgICAgICAgICAgICAgICBjb25zdCBwbiA9IFN0cmluZyhrb1Jvb3Q/LkN1cnJlbnRQYWdlTmFtZSA/PyBrb1Jvb3Q/LmN1cnJlbnRQYWdlTmFtZSA/PyBrb1Jvb3Q/LldpemFyZD8uQ3VycmVudFBhZ2VOYW1lID8/ICcnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgcXVvdGVLZXk6IHFrLCBwYWdlTmFtZTogcG4gfTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4geyBxdW90ZUtleTogMCwgcGFnZU5hbWU6ICcnIH07IH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBjb2FsZXNjZSgpIHtcbiAgICAgICAgICAgIGNvbnN0IGEgPSBmcm9tS28oKSwgYiA9IGZyb21Eb20oKSwgYyA9IGZyb21VcmwoKTtcbiAgICAgICAgICAgIGNvbnN0IHF1b3RlS2V5ID0gYS5xdW90ZUtleSB8fCBiLnF1b3RlS2V5IHx8IGMucXVvdGVLZXkgfHwgMDtcbiAgICAgICAgICAgIGNvbnN0IHBhZ2VOYW1lID0gKGEucGFnZU5hbWUgfHwgYi5wYWdlTmFtZSB8fCBkb2N1bWVudC50aXRsZSB8fCAnJykucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcbiAgICAgICAgICAgIGNvbnN0IGlzT25QYXJ0U3VtbWFyeSA9ICgoKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRE9NIHNpZ25hbCBmcm9tIFBhcnQgU3VtbWFyeTogSURzIGxpa2UgXCJRdW90ZVBhcnRTdW1tYXJ5Rm9ybV8qXCJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzUFNGb3JtID1cbiAgICAgICAgICAgICAgICAgICAgICAgICEhZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI1F1b3RlUGFydFN1bW1hcnlGb3JtLFtpZF49XCJRdW90ZVBhcnRTdW1tYXJ5Rm9ybV9cIl0nKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhhc1BTRm9ybSkgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gKE9wdGlvbmFsKSBhY3RpdmUgd2l6YXJkIHN0ZXAgbGFiZWwgZXF1YWxzIFwiUGFydCBTdW1tYXJ5XCJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWN0aXZlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZS5hY3RpdmUnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFjdGl2ZSAmJiBhY3RpdmUudGV4dENvbnRlbnQgJiYgYWN0aXZlLnRleHRDb250ZW50LnRyaW0oKS50b0xvd2VyQ2FzZSgpID09PSAncGFydCBzdW1tYXJ5JylcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXG4gICAgICAgICAgICAgICAgLy8gRmFsbGJhY2tzIChVUkwvdGl0bGUgaGV1cmlzdGljcylcbiAgICAgICAgICAgICAgICByZXR1cm4gL3BhcnRcXHMqc3VtbWFyeS9pLnRlc3QocGFnZU5hbWUpIHx8XG4gICAgICAgICAgICAgICAgICAgIC9wYXJ0KD86JTIwfFxcc3wtKT9zdW1tYXJ5fHN1bW1hcnkoPzolMjB8XFxzfC0pP3BhcnQvaS50ZXN0KGxvY2F0aW9uLmhyZWYpO1xuICAgICAgICAgICAgfSkoKTtcblxuICAgICAgICAgICAgcmV0dXJuIHsgcXVvdGVLZXksIHBhZ2VOYW1lLCBpc09uUGFydFN1bW1hcnkgfTtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBnZXRRdW90ZUNvbnRleHQoKSB7XG4gICAgICAgICAgICBjb25zdCB7IHF1b3RlS2V5LCBwYWdlTmFtZSwgaXNPblBhcnRTdW1tYXJ5IH0gPSBjb2FsZXNjZSgpO1xuICAgICAgICAgICAgcmV0dXJuIHsgcXVvdGVLZXksIHBhZ2VOYW1lLCBpc09uUGFydFN1bW1hcnksIGhhc1F1b3RlS2V5OiBxdW90ZUtleSA+IDAsIGlzUGFnZTogKG4pID0+IG5ldyBSZWdFeHAoU3RyaW5nKG4pLnJlcGxhY2UoL1xccysvZywgJ1xcXFxzKicpLCAnaScpLnRlc3QocGFnZU5hbWUpIH07XG4gICAgICAgIH1cblxuICAgICAgICAvLyAtLS0tLS0tLS0tIEh1YiBoZWxwZXJzIChDKSAtLS0tLS0tLS0tXG4gICAgICAgIGFzeW5jIGZ1bmN0aW9uIGdldEh1YihvcHRzID0geyBtb3VudDogJ25hdicgfSkge1xuICAgICAgICAgICAgY29uc3QgUiA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJykgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3c7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDUwOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbnN1cmUgPSAoUi5lbnN1cmVMVEh1YiB8fCB3aW5kb3cuZW5zdXJlTFRIdWIpO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZW5zdXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmUob3B0cyk7IC8vIG1heSByZXR1cm4gdm9pZFxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaHViTm93ID0gKHR5cGVvZiBsdFVJSHViICE9PSAndW5kZWZpbmVkJykgPyBsdFVJSHViIDogUi5sdFVJSHViO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGh1Yk5vdykgcmV0dXJuIGh1Yk5vdztcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgaHViTm93ID0gKHR5cGVvZiBsdFVJSHViICE9PSAndW5kZWZpbmVkJykgPyBsdFVJSHViIDogUi5sdFVJSHViO1xuICAgICAgICAgICAgICAgIGlmIChodWJOb3cpIHJldHVybiBodWJOb3c7XG4gICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgX19mYWxsYmFjazogdHJ1ZSB9OyAvLyBmYWxsYmFjayBzZW50aW5lbFxuICAgICAgICB9XG5cbiAgICAgICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlSHViQnV0dG9uKHtcbiAgICAgICAgICAgIGlkLCBsYWJlbCwgdGl0bGUsIHNpZGUgPSAnbGVmdCcsIHdlaWdodCA9IDEyMCwgb25DbGljaywgc2hvd1doZW4sIGZvcmNlID0gZmFsc2UsIG1vdW50ID0gJ25hdidcbiAgICAgICAgfSA9IHt9KSB7XG4gICAgICAgICAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoeyBtb3VudCB9KTtcbiAgICAgICAgICAgIGNvbnN0IHVzaW5nVWlIdWIgPSAhIShodWIgJiYgIWh1Yi5fX2ZhbGxiYWNrICYmIHR5cGVvZiBodWIucmVnaXN0ZXJCdXR0b24gPT09ICdmdW5jdGlvbicpO1xuXG4gICAgICAgICAgICBjb25zdCBzaG91bGRTaG93Tm93ID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7IGNvbnN0IGN0eCA9IGdldFF1b3RlQ29udGV4dCgpOyByZXR1cm4gISEoZm9yY2UgfHwgKHR5cGVvZiBzaG93V2hlbiA9PT0gJ2Z1bmN0aW9uJyA/IHNob3dXaGVuKGN0eCkgOiB0cnVlKSk7IH1cbiAgICAgICAgICAgICAgICBjYXRjaCB7IHJldHVybiAhIWZvcmNlOyB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAodXNpbmdVaUh1Yikge1xuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGxpc3RJZHMoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2ID0gaHViLmxpc3Q/LigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHYpKSByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBTdXBwb3J0IGFycmF5cyBvZiBzdHJpbmdzIE9SIGFycmF5cyBvZiB7IGlkLCAuLi4gfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHYubWFwKHggPT4gKHggJiYgdHlwZW9mIHggPT09ICdvYmplY3QnKSA/IHguaWQgOiB4KS5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gW107IH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBpc1ByZXNlbnQoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGh1Yi5oYXMgPT09ICdmdW5jdGlvbicpIHJldHVybiAhIWh1Yi5oYXMoaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGxpc3RJZHMoKS5pbmNsdWRlcyhpZCk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBhc3luYyBmdW5jdGlvbiByZWdpc3RlcigpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVmID0geyBpZCwgbGFiZWwsIHRpdGxlLCB3ZWlnaHQsIG9uQ2xpY2sgfTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQWx3YXlzIHByZWZlciB0aGUgMi1hcmcgZm9ybTsgZmFsbCBiYWNrIHRvIDEtYXJnXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IGh1Yi5yZWdpc3RlckJ1dHRvbj8uKHNpZGUsIGRlZik7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IDA7XG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNQcmVzZW50KCkpIHsgdHJ5IHsgaHViLnJlZ2lzdGVyQnV0dG9uPy4oeyAuLi5kZWYsIHNlY3Rpb246IHNpZGUgfSk7IH0gY2F0Y2ggeyB9IH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBJZiBzdGlsbCBub3QgcHJlc2VudCwgdHJ5IHRoZSBhbHRlcm5hdGUgZm9ybSBleHBsaWNpdGx5XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IDA7IC8vIHlpZWxkXG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNQcmVzZW50KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKHsgLi4uZGVmLCBzZWN0aW9uOiBzaWRlIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgMDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc1ByZXNlbnQoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oc2lkZSwgZGVmKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpc1ByZXNlbnQoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBlbnN1cmVSZWcoKSB7IGlmIChpc1ByZXNlbnQoKSkgcmV0dXJuIGZhbHNlOyByZXR1cm4gcmVnaXN0ZXIoKTsgfVxuICAgICAgICAgICAgICAgIGVuc3VyZVJlZygpO1xuXG4gICAgICAgICAgICAgICAgYXN5bmMgZnVuY3Rpb24gcmVjb25jaWxlKCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2hvdyA9IHNob3VsZFNob3dOb3coKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByZXNlbnQgPSBpc1ByZXNlbnQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzaG93KSB7IGlmICghcHJlc2VudCkgZW5zdXJlUmVnKCk7IHJldHVybiB0cnVlOyB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJlc2VudCkgaHViLnJlbW92ZT8uKGlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGVuc3VyZUh1YkJ1dHRvbi5fX3N0YXRlID0gZW5zdXJlSHViQnV0dG9uLl9fc3RhdGUgfHwge307XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhdGUgPSBlbnN1cmVIdWJCdXR0b24uX19zdGF0ZVtpZF0gfHw9IHsgb2JzOiBudWxsLCBvZmZVcmw6IG51bGwgfTtcblxuICAgICAgICAgICAgICAgIGF3YWl0IHJlY29uY2lsZSgpO1xuICAgICAgICAgICAgICAgIGlmICghc3RhdGUub2JzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0JykgfHwgZG9jdW1lbnQuYm9keTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJvb3QgJiYgd2luZG93Lk11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHsgcmVjb25jaWxlKCk7IH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub2JzLm9ic2VydmUocm9vdCwgeyBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS5vZmZVcmwgJiYgd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLm9mZlVybCA9IHdpbmRvdy5UTVV0aWxzLm9uVXJsQ2hhbmdlKCgpID0+IHsgcmVjb25jaWxlKCk7IH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IHN5bnRoZXNpemUgYSBzaW1wbGUgbmF2YmFyIGJ1dHRvbiAob25seSBpZiBsdC11aS1odWIgbm90IHByZXNlbnQpXG4gICAgICAgICAgICBjb25zdCBkb21JZCA9IGBsdC1uYXZidG4tJHtpZH1gO1xuICAgICAgICAgICAgZnVuY3Rpb24gbmF2UmlnaHQoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNuYXZCYXIgLm5hdmJhci1yaWdodCcpIHx8XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LW5hdmJhci1jb250YWluZXIgLm5hdmJhci1yaWdodCcpIHx8XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5uYXZiYXItcmlnaHQnKSB8fFxuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmF2QmFyJykgfHwgZG9jdW1lbnQuYm9keTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bmN0aW9uIGVuc3VyZURvbSgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBob3N0ID0gbmF2UmlnaHQoKTsgaWYgKCFob3N0KSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICBsZXQgYnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZG9tSWQpO1xuICAgICAgICAgICAgICAgIGlmICghYnRuKSB7XG4gICAgICAgICAgICAgICAgICAgIGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgICAgICAgICAgICAgICBidG4uaWQgPSBkb21JZDsgYnRuLnR5cGUgPSAnYnV0dG9uJzsgYnRuLmNsYXNzTmFtZSA9ICdidG4gYnRuLXByaW1hcnknO1xuICAgICAgICAgICAgICAgICAgICBidG4udGl0bGUgPSB0aXRsZSB8fCAnJzsgYnRuLnRleHRDb250ZW50ID0gbGFiZWwgfHwgaWQ7IGJ0bi5zdHlsZS5tYXJnaW5MZWZ0ID0gJzhweCc7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldikgPT4geyB0cnkgeyBvbkNsaWNrPy4oZXYpOyB9IGNhdGNoIHsgfSB9KTtcbiAgICAgICAgICAgICAgICAgICAgaG9zdC5hcHBlbmRDaGlsZChidG4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYnRuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZnVuY3Rpb24gcmVtb3ZlRG9tKCkgeyBjb25zdCBuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZG9tSWQpOyBpZiAobikgdHJ5IHsgbi5yZW1vdmUoKTsgfSBjYXRjaCB7IH0gfVxuXG4gICAgICAgICAgICBhc3luYyBmdW5jdGlvbiByZWNvbmNpbGVEb20oKSB7IGNvbnN0IHNob3cgPSBzaG91bGRTaG93Tm93KCk7IGlmIChzaG93KSBlbnN1cmVEb20oKTsgZWxzZSByZW1vdmVEb20oKTsgfVxuXG4gICAgICAgICAgICBlbnN1cmVIdWJCdXR0b24uX19zdGF0ZSA9IGVuc3VyZUh1YkJ1dHRvbi5fX3N0YXRlIHx8IHt9O1xuICAgICAgICAgICAgY29uc3Qgc3RhdGUgPSBlbnN1cmVIdWJCdXR0b24uX19zdGF0ZVtpZF0gfHw9IHsgb2JzOiBudWxsLCBvZmZVcmw6IG51bGwgfTtcblxuICAgICAgICAgICAgYXdhaXQgcmVjb25jaWxlRG9tKCk7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLm9icykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0JykgfHwgZG9jdW1lbnQuYm9keTtcbiAgICAgICAgICAgICAgICBpZiAocm9vdCAmJiB3aW5kb3cuTXV0YXRpb25PYnNlcnZlcikge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7IHJlY29uY2lsZURvbSgpOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUub2JzLm9ic2VydmUocm9vdCwgeyBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzdGF0ZS5vZmZVcmwgJiYgd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUub2ZmVXJsID0gd2luZG93LlRNVXRpbHMub25VcmxDaGFuZ2UoKCkgPT4geyByZWNvbmNpbGVEb20oKTsgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7IHByb21vdGVEcmFmdFRvUXVvdGUsIHN0b3BSZXRyeSwgdXNlRHJhZnRSZXBvLCB1c2VRdW90ZVJlcG8sIGdldFF1b3RlQ29udGV4dCwgZ2V0SHViLCBlbnN1cmVIdWJCdXR0b24gfTtcbiAgICB9KSgpO1xuXG4gICAgLy8gQXV0by1hcHBseSBUSEVNRV9DU1MgaWYgcHJvdmlkZWQgKHNhZmUgbm8tb3Agb3RoZXJ3aXNlKVxuICAgIHRyeSB7IGNvcmUudGhlbWUuYXBwbHkoKTsgfSBjYXRjaCB7IH1cblxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBU0EsR0FBQyxNQUFNO0FBRUgsVUFBTSxPQUFRLE9BQU8saUJBQWlCLGNBQWMsZUFBZTtBQUNuRSxVQUFNLEtBQU0sS0FBSyxLQUFLLEtBQUssTUFBTSxDQUFDO0FBQ2xDLFVBQU0sT0FBUSxHQUFHLE9BQU8sR0FBRyxRQUFRLENBQUM7QUFLcEMsU0FBSyxPQUFPLEtBQUssUUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BSXJCLE1BQU0sU0FBUztBQUNYLFlBQUk7QUFDQSxjQUFJLEtBQUssVUFBVSxPQUFRLFFBQU8sTUFBTSxLQUFLLFNBQVMsT0FBTztBQUM3RCxjQUFJLEtBQUssU0FBUyxPQUFRLFFBQU8sTUFBTSxLQUFLLFFBQVEsT0FBTztBQUFBLFFBQy9ELFFBQVE7QUFBQSxRQUFrQjtBQUMxQixlQUFPO0FBQUEsTUFDWDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFNQSxNQUFNLGNBQWMsSUFBSTtBQUNwQixZQUFJLE1BQU0sTUFBTSxLQUFLLEtBQUssT0FBTztBQUNqQyxZQUFJLENBQUMsS0FBSztBQUNOLGNBQUk7QUFDQSxnQkFBSSxLQUFLLFVBQVUsU0FBUztBQUN4QixvQkFBTSxLQUFLLFNBQVMsUUFBUTtBQUM1QixvQkFBTSxNQUFNLEtBQUssS0FBSyxPQUFPO0FBQUEsWUFDakMsV0FBVyxLQUFLLFNBQVMsU0FBUztBQUM5QixvQkFBTSxLQUFLLFFBQVEsUUFBUTtBQUMzQixvQkFBTSxNQUFNLEtBQUssS0FBSyxPQUFPO0FBQUEsWUFDakM7QUFBQSxVQUNKLFFBQVE7QUFBQSxVQUFrQjtBQUFBLFFBQzlCO0FBQ0EsZUFBTyxHQUFHLE9BQU8sTUFBUztBQUFBLE1BQzlCO0FBQUEsSUFDSjtBQU1BLFNBQUssT0FBTyxLQUFLLFFBQVE7QUFB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TSxTQUFTLGVBQWUsS0FBSztBQUN2QyxjQUFJLENBQUMsS0FBSztBQUNOLGtCQUFNLFNBQVMsY0FBYyxRQUFRO0FBQ3JDLGdCQUFJLEtBQUs7QUFBTyxnQkFBSSxPQUFPO0FBQVUsZ0JBQUksWUFBWTtBQUNyRCxnQkFBSSxRQUFRLFNBQVM7QUFBSSxnQkFBSSxjQUFjLFNBQVM7QUFBSSxnQkFBSSxNQUFNLGFBQWE7QUFDL0UsZ0JBQUksaUJBQWlCLFNBQVMsQ0FBQyxPQUFPO0FBQUUsa0JBQUk7QUFBRSwwQkFBVSxFQUFFO0FBQUEsY0FBRyxRQUFRO0FBQUEsY0FBRTtBQUFBLFlBQUUsQ0FBQztBQUMxRSxpQkFBSyxZQUFZLEdBQUc7QUFBQSxVQUN4QjtBQUNBLGlCQUFPO0FBQUEsUUFDWDtBQUNBLGlCQUFTLFlBQVk7QUFBRSxnQkFBTSxJQUFJLFNBQVMsZUFBZSxLQUFLO0FBQUcsY0FBSSxFQUFHLEtBQUk7QUFBRSxjQUFFLE9BQU87QUFBQSxVQUFHLFFBQVE7QUFBQSxVQUFFO0FBQUEsUUFBRTtBQUV0Ryx1QkFBZSxlQUFlO0FBQUUsZ0JBQU0sT0FBTyxjQUFjO0FBQUcsY0FBSSxLQUFNLFdBQVU7QUFBQSxjQUFRLFdBQVU7QUFBQSxRQUFHO0FBRXZHLHdCQUFnQixVQUFVLGdCQUFnQixXQUFXLENBQUM7QUFDdEQsY0FBTSxRQUFRLGdCQUFnQixRQUFRLEVBQUUsTUFBTSxFQUFFLEtBQUssTUFBTSxRQUFRLEtBQUs7QUFFeEUsY0FBTSxhQUFhO0FBQ25CLFlBQUksQ0FBQyxNQUFNLEtBQUs7QUFDWixnQkFBTSxPQUFPLFNBQVMsY0FBYyx3QkFBd0IsS0FBSyxTQUFTO0FBQzFFLGNBQUksUUFBUSxPQUFPLGtCQUFrQjtBQUNqQyxrQkFBTSxNQUFNLElBQUksaUJBQWlCLE1BQU07QUFBRSwyQkFBYTtBQUFBLFlBQUcsQ0FBQztBQUMxRCxrQkFBTSxJQUFJLFFBQVEsTUFBTSxFQUFFLFNBQVMsTUFBTSxZQUFZLE1BQU0sV0FBVyxLQUFLLENBQUM7QUFBQSxVQUNoRjtBQUFBLFFBQ0o7QUFDQSxZQUFJLENBQUMsTUFBTSxVQUFVLE9BQU8sU0FBUyxhQUFhO0FBQzlDLGdCQUFNLFNBQVMsT0FBTyxRQUFRLFlBQVksTUFBTTtBQUFFLHlCQUFhO0FBQUEsVUFBRyxDQUFDO0FBQUEsUUFDdkU7QUFDQSxlQUFPO0FBQUEsTUFDWDtBQUVBLGFBQU8sRUFBRSxxQkFBcUIsV0FBVyxjQUFjLGNBQWMsaUJBQWlCLFFBQVEsZ0JBQWdCO0FBQUEsSUFDbEgsR0FBRztBQUdILFFBQUk7QUFBRSxXQUFLLE1BQU0sTUFBTTtBQUFBLElBQUcsUUFBUTtBQUFBLElBQUU7QUFBQSxFQUV4QyxHQUFHOyIsCiAgIm5hbWVzIjogWyJST09UIiwgImh1Yk5vdyIsICJsaXN0SWRzIiwgImlzUHJlc2VudCIsICJlbnN1cmVSZWciLCAic3RhdGUiXQp9Cg==
