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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LWNvcmUudXNlci5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gPT1Vc2VyU2NyaXB0PT1cbi8vIEBuYW1lICAgICAgICAgbHQtY29yZVxuLy8gQG5hbWVzcGFjZSAgICBsdFxuLy8gQHZlcnNpb24gICAgICA0LjIuMlxuLy8gQGRlc2NyaXB0aW9uICBTaGFyZWQgY29yZTogYXV0aCArIGh0dHAgKyBwbGV4IERTICsgaHViIChzdGF0dXMvdG9hc3QpICsgdGhlbWUgYnJpZGdlICsgdGlueSB1dGlsc1xuLy8gQHJ1bi1hdCAgICAgICBkb2N1bWVudC1zdGFydFxuLy8gQGdyYW50ICAgICAgICBub25lXG4vLyA9PS9Vc2VyU2NyaXB0PT1cblxuKCgpID0+IHtcbiAgICAvLyBQcmVmZXIgdGhlIHBhZ2UgY29udGV4dCBpZiBhdmFpbGFibGUgKHNvIGdsb2JhbHMgYXJlIHNoYXJlZCB3aXRoIHRoZSBhcHApXG4gICAgY29uc3QgUk9PVCA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdyA6IHdpbmRvdyk7XG4gICAgY29uc3QgTFQgPSAoUk9PVC5sdCA9IFJPT1QubHQgfHwge30pO1xuICAgIGNvbnN0IGNvcmUgPSAoTFQuY29yZSA9IExULmNvcmUgfHwge30pO1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIEF1dGggKGZyb20geW91ciBwbGV4LWF1dGgpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUuYXV0aCA9IGNvcmUuYXV0aCB8fCB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUcnkgUGxleEF1dGggZmlyc3QsIHRoZW4gUGxleEFQSTsgcmV0dXJuIGJlYXJlciB0b2tlbiBzdHJpbmcgb3IgbnVsbC5cbiAgICAgICAgICovXG4gICAgICAgIGFzeW5jIGdldEtleSgpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgaWYgKFJPT1QuUGxleEF1dGg/LmdldEtleSkgcmV0dXJuIGF3YWl0IFJPT1QuUGxleEF1dGguZ2V0S2V5KCk7XG4gICAgICAgICAgICAgICAgaWYgKFJPT1QuUGxleEFQST8uZ2V0S2V5KSByZXR1cm4gYXdhaXQgUk9PVC5QbGV4QVBJLmdldEtleSgpO1xuICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUnVuIGEgZnVuY3Rpb24gYWZ0ZXIgZW5zdXJpbmcgd2UgaGF2ZSBhbiBhdXRoIGtleS5cbiAgICAgICAgICogSWYgYSByZWZyZXNoIGhvb2sgZXhpc3RzIHdlXHUyMDE5bGwgYXR0ZW1wdCBpdCBvbmNlLlxuICAgICAgICAgKi9cbiAgICAgICAgYXN5bmMgd2l0aEZyZXNoQXV0aChmbikge1xuICAgICAgICAgICAgbGV0IGtleSA9IGF3YWl0IGNvcmUuYXV0aC5nZXRLZXkoKTtcbiAgICAgICAgICAgIGlmICgha2V5KSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKFJPT1QuUGxleEF1dGg/LnJlZnJlc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IFJPT1QuUGxleEF1dGgucmVmcmVzaCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gYXdhaXQgY29yZS5hdXRoLmdldEtleSgpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFJPT1QuUGxleEFQST8ucmVmcmVzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgUk9PVC5QbGV4QVBJLnJlZnJlc2goKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGF3YWl0IGNvcmUuYXV0aC5nZXRLZXkoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZuKGtleSB8fCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBIVFRQXG4gICAgLy8gRGVsZWdhdGVzIHRvIFRNVXRpbHMuZmV0Y2hEYXRhIHdoZW4gYXZhaWxhYmxlOyBmYWxscyBiYWNrIHRvIGZldGNoKClcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgY29yZS5odHRwID0gY29yZS5odHRwIHx8IHtcbiAgICAgICAgYXN5bmMgZmV0Y2godXJsLCB7IG1ldGhvZCA9ICdHRVQnLCBoZWFkZXJzID0ge30sIGJvZHksIHRpbWVvdXRNcyA9IDE1MDAwLCB1c2VYSFIgPSBmYWxzZSB9ID0ge30pIHtcbiAgICAgICAgICAgIGlmIChST09ULlRNVXRpbHM/LmZldGNoRGF0YSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCBST09ULlRNVXRpbHMuZmV0Y2hEYXRhKHVybCwgeyBtZXRob2QsIGhlYWRlcnMsIGJvZHksIHRpbWVvdXRNcywgdXNlWEhSIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBGYWxsYmFjazogbmF0aXZlIGZldGNoIHdpdGggQXV0aG9yaXphdGlvbiAoZnJvbSBwbGV4LWF1dGgpXG4gICAgICAgICAgICBjb25zdCBrZXkgPSBhd2FpdCBjb3JlLmF1dGguZ2V0S2V5KCk7XG4gICAgICAgICAgICBjb25zdCBoID0gbmV3IEhlYWRlcnMoaGVhZGVycyB8fCB7fSk7XG4gICAgICAgICAgICBpZiAoa2V5ICYmICFoLmhhcygnQXV0aG9yaXphdGlvbicpKSBoLnNldCgnQXV0aG9yaXphdGlvbicsIGBCZWFyZXIgJHtrZXl9YCk7XG4gICAgICAgICAgICBpZiAoYm9keSAmJiAhaC5oYXMoJ0NvbnRlbnQtVHlwZScpKSBoLnNldCgnQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblxuICAgICAgICAgICAgY29uc3QgY3RsID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgICAgICAgICAgY29uc3QgdCA9IHNldFRpbWVvdXQoKCkgPT4gY3RsLmFib3J0KCksIHRpbWVvdXRNcyk7XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2godXJsLCB7XG4gICAgICAgICAgICAgICAgICAgIG1ldGhvZCxcbiAgICAgICAgICAgICAgICAgICAgaGVhZGVyczogaCxcbiAgICAgICAgICAgICAgICAgICAgYm9keTogYm9keSAmJiB0eXBlb2YgYm9keSAhPT0gJ3N0cmluZycgPyBKU09OLnN0cmluZ2lmeShib2R5KSA6IGJvZHksXG4gICAgICAgICAgICAgICAgICAgIHNpZ25hbDogY3RsLnNpZ25hbCxcbiAgICAgICAgICAgICAgICAgICAgY3JlZGVudGlhbHM6ICdpbmNsdWRlJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGN0ID0gcmVzLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKSB8fCAnJztcbiAgICAgICAgICAgICAgICBjb25zdCBkYXRhID0gY3QuaW5jbHVkZXMoJ2FwcGxpY2F0aW9uL2pzb24nKSA/IGF3YWl0IHJlcy5qc29uKCkgOiBhd2FpdCByZXMudGV4dCgpO1xuICAgICAgICAgICAgICAgIGlmICghcmVzLm9rKSB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgJHtyZXMuc3RhdHVzfSAke3Jlcy5zdGF0dXNUZXh0fWApO1xuICAgICAgICAgICAgICAgIHJldHVybiBkYXRhO1xuICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXN5bmMgZ2V0KHVybCwgb3B0cyA9IHt9KSB7IHJldHVybiB0aGlzLmZldGNoKHVybCwgeyAuLi4ob3B0cyB8fCB7fSksIG1ldGhvZDogJ0dFVCcgfSk7IH0sXG4gICAgICAgIGFzeW5jIHBvc3QodXJsLCBib2R5LCBvcHRzID0ge30pIHsgcmV0dXJuIHRoaXMuZmV0Y2godXJsLCB7IC4uLihvcHRzIHx8IHt9KSwgbWV0aG9kOiAnUE9TVCcsIGJvZHkgfSk7IH1cbiAgICB9O1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBQbGV4IERTIGhlbHBlcnNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUucGxleCA9IGNvcmUucGxleCB8fCB7XG4gICAgICAgIGFzeW5jIGRzKHNvdXJjZUlkLCBwYXlsb2FkID0ge30sIG9wdHMgPSB7fSkge1xuICAgICAgICAgICAgaWYgKFJPT1QuVE1VdGlscz8uZHMpIHJldHVybiBhd2FpdCBST09ULlRNVXRpbHMuZHMoc291cmNlSWQsIHBheWxvYWQsIG9wdHMpO1xuXG4gICAgICAgICAgICAvLyBGYWxsYmFjazogZGlyZWN0IFBPU1QgdG8gRFMgZW5kcG9pbnQgKGZvcm1hdD0yIFx1MjE5MiByb3dzIGluIGFycmF5KVxuICAgICAgICAgICAgY29uc3QgYmFzZSA9IGxvY2F0aW9uLm9yaWdpbi5yZXBsYWNlKC9cXC8kLywgJycpO1xuICAgICAgICAgICAgY29uc3QgdXJsID0gYCR7YmFzZX0vYXBpL2RhdGFzb3VyY2VzLyR7c291cmNlSWR9L2V4ZWN1dGU/Zm9ybWF0PTJgO1xuICAgICAgICAgICAgY29uc3QganNvbiA9IGF3YWl0IGNvcmUuaHR0cC5wb3N0KHVybCwgcGF5bG9hZCwgb3B0cyk7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gQXJyYXkuaXNBcnJheShqc29uPy5yb3dzKSA/IGpzb24ucm93cyA6IFtdO1xuICAgICAgICAgICAgcmV0dXJuIHsgLi4uanNvbiwgcm93cyB9O1xuICAgICAgICB9LFxuXG4gICAgICAgIGFzeW5jIGRzUm93cyhzb3VyY2VJZCwgcGF5bG9hZCA9IHt9LCBvcHRzID0ge30pIHtcbiAgICAgICAgICAgIGlmIChST09ULlRNVXRpbHM/LmRzUm93cykgcmV0dXJuIGF3YWl0IFJPT1QuVE1VdGlscy5kc1Jvd3Moc291cmNlSWQsIHBheWxvYWQsIG9wdHMpO1xuICAgICAgICAgICAgY29uc3QgeyByb3dzIH0gPSBhd2FpdCB0aGlzLmRzKHNvdXJjZUlkLCBwYXlsb2FkLCBvcHRzKTtcbiAgICAgICAgICAgIHJldHVybiByb3dzO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0gSHViIGZhY2FkZSAocHJlZmVycyBsdC11aS1odWI7IG1vdW50cyBvbiBmaXJzdCB1c2UpIC0tLS0tLS0tLS0tLS0tLS1cbiAgICBjb3JlLmh1YiA9IGNvcmUuaHViIHx8ICgoKSA9PiB7XG4gICAgICAgIC8vIC0tLSBzbWFsbCBwaWxsIGZhbGxiYWNrICh1c2VkIG9ubHkgaWYgbHQtdWktaHViIG1pc3NpbmcpIC0tLVxuICAgICAgICBjb25zdCBmYWxsYmFjayA9ICgoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhcGkgPSB7fTtcbiAgICAgICAgICAgIGFwaS5fc3RpY2t5ID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGVuc3VyZVBpbGwoKSB7XG4gICAgICAgICAgICAgICAgbGV0IHBpbGwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjbHQtaHViLXBpbGwnKTtcbiAgICAgICAgICAgICAgICBpZiAoIXBpbGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGlsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgICAgICAgICBwaWxsLmlkID0gJ2x0LWh1Yi1waWxsJztcbiAgICAgICAgICAgICAgICAgICAgcGlsbC5zdHlsZS5jc3NUZXh0ID0gYFxuICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgdG9wOiAxMHB4OyByaWdodDogMTBweDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHotaW5kZXg6IDIxNDc0ODMwMDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDAsMCwwLC44KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiAjZmZmO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udDogMTNweCBzeXN0ZW0tdWksIC1hcHBsZS1zeXN0ZW0sIFNlZ29lIFVJLCBSb2JvdG8sIHNhbnMtc2VyaWY7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA2cHggMTBweDsgYm9yZGVyLXJhZGl1czogOTk5cHg7XG4gICAgICAgICAgICAgICAgICAgICAgICBib3gtc2hhZG93OiAwIDhweCAyNHB4IHJnYmEoMCwwLDAsMC4yNSk7XG4gICAgICAgICAgICAgICAgICAgIGA7XG4gICAgICAgICAgICAgICAgICAgIHBpbGwudGV4dENvbnRlbnQgPSAnXHUyMDI2JztcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmFwcGVuZENoaWxkKHBpbGwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcGlsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYXBpLnNldFN0YXR1cyA9ICh0ZXh0LCB0b25lID0gJ2luZm8nLCB7IHN0aWNreSA9IGZhbHNlIH0gPSB7fSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVsID0gZW5zdXJlUGlsbCgpO1xuICAgICAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gdGV4dCB8fCAnJztcbiAgICAgICAgICAgICAgICBhcGkuX3N0aWNreSA9ICEhc3RpY2t5O1xuICAgICAgICAgICAgICAgIGlmICghYXBpLl9zdGlja3kpIHNldFRpbWVvdXQoKCkgPT4geyB0cnkgeyBlbC5yZW1vdmUoKTsgfSBjYXRjaCB7IH0gfSwgMjAwMCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGFwaS5ub3RpZnkgPSAoX2xldmVsLCB0ZXh0LCB7IG1zID0gNTAwMCB9ID0ge30pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbCA9IGVuc3VyZVBpbGwoKTtcbiAgICAgICAgICAgICAgICBlbC50ZXh0Q29udGVudCA9IHRleHQgfHwgJyc7XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7IHRyeSB7IGVsLnJlbW92ZSgpOyB9IGNhdGNoIHsgfSB9LCBNYXRoLm1heCg1MDAsIG1zIHwgMCkpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBhcGkudG9hc3QgPSAobXNnLCBtcyA9IDUwMDApID0+IGFwaS5ub3RpZnkoJ2luZm8nLCBtc2csIHsgbXMgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgIH0pKCk7XG5cbiAgICAgICAgLy8gLS0tIHF1ZXVlIHVudGlsIGx0LXVpLWh1YiBtb3VudHMgLS0tXG4gICAgICAgIGxldCBtb3VudGVkID0gZmFsc2U7XG4gICAgICAgIGxldCBtb3VudGluZyA9IG51bGw7ICAgICAgICAgICAgICAgLy8gUHJvbWlzZVxuICAgICAgICBjb25zdCBxdWV1ZSA9IFtdOyAgICAgICAgICAgICAgICAgIC8vIFt7Zm4sIGFyZ3N9XVxuXG4gICAgICAgIGFzeW5jIGZ1bmN0aW9uIG1vdW50VWlIdWJPbmNlKCkge1xuICAgICAgICAgICAgaWYgKG1vdW50ZWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgaWYgKG1vdW50aW5nKSByZXR1cm4gbW91bnRpbmc7XG5cbiAgICAgICAgICAgIG1vdW50aW5nID0gKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiBlbnN1cmVMVEh1YiBpcyBhdmFpbGFibGUsIG1vdW50IHRoZSBmdWxsLXdpZHRoIGJhclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbnN1cmVGbiA9XG4gICAgICAgICAgICAgICAgICAgICAgICAodHlwZW9mIGVuc3VyZUxUSHViID09PSAnZnVuY3Rpb24nKSA/IGVuc3VyZUxUSHViIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAodHlwZW9mIFJPT1QuZW5zdXJlTFRIdWIgPT09ICdmdW5jdGlvbicgPyBST09ULmVuc3VyZUxUSHViIDogbnVsbCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGVuc3VyZUZuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmVGbih7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlbWU6IHsgbmFtZTogJ09uZU1vbnJvZScgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBkZWZhdWx0IHRvIGJvZHk7IGhvbm9yIGFueSBlYXJsaWVyIHNlbGVjdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdW50OiAoUk9PVC5fX0xUX0hVQl9NT1VOVCB8fCAnbmF2JyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFnZVJvb3RTZWxlY3RvcnM6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJyNwbGV4U2lkZXRhYnNNZW51UGFnZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICcucGxleC1zaWRldGFicy1tZW51LXBhZ2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnLnBsZXgtc2lkZXRhYnMtbWVudS1wYWdlLWNvbnRlbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnLnBsZXgtc2lkZXRhYnMtbWVudS1wYWdlLWNvbnRlbnQtY29udGFpbmVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJy5wbGV4LWFjdGlvbnMtd3JhcHBlcidcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdoZW4gbGl2aW5nIGluIHRoZSBuYXZiYXIgd2UgbmV2ZXIgd2FudCB0byBhbHRlciBwYWdlIGxheW91dFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0aWNrOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnYXA6IDhcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaHViT2JqID0gKHR5cGVvZiBsdFVJSHViICE9PSAndW5kZWZpbmVkJykgPyBsdFVJSHViIDogUk9PVC5sdFVJSHViO1xuICAgICAgICAgICAgICAgICAgICBtb3VudGVkID0gISFodWJPYmo7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBtb3VudGVkO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICBtb3VudGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgICAgICAgICAvLyBmbHVzaCBxdWV1ZWQgY2FsbHMgdGhyb3VnaCBlaXRoZXIgdWktaHViIChpZiBtb3VudGVkKSBvciBmYWxsYmFja1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBodWIgPSBtb3VudGVkID8gUk9PVC5sdFVJSHViIDogbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCB7IGZuLCBhcmdzIH0gb2YgcXVldWUuc3BsaWNlKDApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChodWIgJiYgdHlwZW9mIGh1Yltmbl0gPT09ICdmdW5jdGlvbicpIGh1Yltmbl0oLi4uYXJncyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBmYWxsYmFja1tmbl0oLi4uYXJncyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pKCk7XG5cbiAgICAgICAgICAgIHJldHVybiBtb3VudGluZztcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRlbGVnYXRlT3JRdWV1ZShmbiwgLi4uYXJncykge1xuICAgICAgICAgICAgLy8gSWYgbHQtdWktaHViIGlzIGFscmVhZHkgbW91bnRlZCwgZGVsZWdhdGUgaW1tZWRpYXRlbHlcbiAgICAgICAgICAgIGNvbnN0IGh1Yk5vdyA9IG1vdW50ZWRcbiAgICAgICAgICAgICAgICA/ICgodHlwZW9mIGx0VUlIdWIgIT09ICd1bmRlZmluZWQnKSA/IGx0VUlIdWIgOiBST09ULmx0VUlIdWIpXG4gICAgICAgICAgICAgICAgOiBudWxsO1xuXG4gICAgICAgICAgICBpZiAoaHViTm93ICYmIHR5cGVvZiBodWJOb3dbZm5dID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgaHViTm93W2ZuXSguLi5hcmdzKTsgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBJZiB3ZSBjYW4gbW91bnQgKHNhbmRib3ggb3Igd2luZG93KSwgcXVldWUgYW5kIGtpY2sgaXQgb2ZmXG4gICAgICAgICAgICBpZiAodHlwZW9mIGVuc3VyZUxUSHViID09PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiBST09ULmVuc3VyZUxUSHViID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgcXVldWUucHVzaCh7IGZuLCBhcmdzIH0pO1xuICAgICAgICAgICAgICAgIG1vdW50VWlIdWJPbmNlKCk7ICAvLyBmaXJlICYgZm9yZ2V0XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBObyB1aS1odWIgYXZhaWxhYmxlIFx1MjE5MiBmYWxsYmFjayBpbW1lZGlhdGVseVxuICAgICAgICAgICAgZmFsbGJhY2tbZm5dKC4uLmFyZ3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUHVibGljIEFQSSAoc3luYyBsb29raW5nOyBpbnRlcm5hbGx5IHF1ZXVlcy9kZWxlZ2F0ZXMpXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzZXRTdGF0dXModGV4dCwgdG9uZSA9ICdpbmZvJywgb3B0cyA9IHt9KSB7IGRlbGVnYXRlT3JRdWV1ZSgnc2V0U3RhdHVzJywgdGV4dCwgdG9uZSwgb3B0cyk7IHJldHVybiB0aGlzOyB9LFxuXG4gICAgICAgICAgICBub3RpZnkodGV4dCwgdG9uZSA9ICdpbmZvJywgb3B0cyA9IHt9KSB7XG4gICAgICAgICAgICAgICAgLy8gbHQtdWktaHViIHNpZ25hdHVyZTogbm90aWZ5KGtpbmQsIHRleHQsIHttcywgc3RpY2t5LCB0b2FzdH0pXG4gICAgICAgICAgICAgICAgY29uc3QgbXMgPSBvcHRzPy50aW1lb3V0ID8/IG9wdHM/Lm1zID8/IDUwMDA7XG4gICAgICAgICAgICAgICAgZGVsZWdhdGVPclF1ZXVlKCdub3RpZnknLCB0b25lLCB0ZXh0LCB7IG1zLCBzdGlja3k6ICEhb3B0cz8uc3RpY2t5LCB0b2FzdDogISFvcHRzPy50b2FzdCB9KTtcbiAgICAgICAgICAgICAgICBpZiAoIW1vdW50ZWQgJiYgdHlwZW9mIFJPT1QuZW5zdXJlTFRIdWIgIT09ICdmdW5jdGlvbicpIGZhbGxiYWNrLm5vdGlmeSh0ZXh0LCB0b25lLCBvcHRzKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB0b2FzdChtc2csIHRpbWVvdXQgPSA1MDAwKSB7XG4gICAgICAgICAgICAgICAgZGVsZWdhdGVPclF1ZXVlKCdub3RpZnknLCAnaW5mbycsIG1zZywgeyBtczogdGltZW91dCwgdG9hc3Q6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgaWYgKCFtb3VudGVkICYmIHR5cGVvZiBST09ULmVuc3VyZUxUSHViICE9PSAnZnVuY3Rpb24nKSBmYWxsYmFjay50b2FzdChtc2csIHRpbWVvdXQpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHVwZGF0ZUJ1dHRvbihpZCwgcGF0Y2ggPSB7fSkge1xuICAgICAgICAgICAgICAgIGRlbGVnYXRlT3JRdWV1ZSgndXBkYXRlQnV0dG9uJywgaWQsIHBhdGNoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBiZWdpblRhc2sobGFiZWwsIHRvbmUgPSAnaW5mbycpIHtcbiAgICAgICAgICAgICAgICBpZiAobW91bnRlZCAmJiBST09ULmx0VUlIdWI/LmJlZ2luVGFzaykgcmV0dXJuIFJPT1QubHRVSUh1Yi5iZWdpblRhc2sobGFiZWwsIHRvbmUpO1xuICAgICAgICAgICAgICAgIC8vIHF1ZXVlIGEgc3ludGhldGljIGJlZ2luVGFzayB1c2luZyBzdGF0dXMgKyBzdWNjZXNzL2Vycm9yIGhlbHBlcnNcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXR1cyhsYWJlbCwgdG9uZSwgeyBzdGlja3k6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgY29uc3QgY3RsID0ge1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGU6ICh0eHQsIHQgPSB0b25lKSA9PiB7IHRoaXMuc2V0U3RhdHVzKHR4dCwgdCwgeyBzdGlja3k6IHRydWUgfSk7IHJldHVybiBjdGw7IH0sXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IChtc2cgPSAnRG9uZScsIG1zID0gNTAwMCkgPT4geyB0aGlzLnNldFN0YXR1cygnJywgJ2luZm8nLCB7IHN0aWNreTogZmFsc2UgfSk7IHRoaXMubm90aWZ5KG1zZywgJ3N1Y2Nlc3MnLCB7IHRpbWVvdXQ6IG1zIH0pOyByZXR1cm4gY3RsOyB9LFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogKG1zZyA9ICdGYWlsZWQnKSA9PiB7IHRoaXMuc2V0U3RhdHVzKCcnLCAnaW5mbycsIHsgc3RpY2t5OiBmYWxzZSB9KTsgdGhpcy5ub3RpZnkobXNnLCAnZXJyb3InLCB7IHRpbWVvdXQ6IDUwMDAgfSk7IHJldHVybiBjdGw7IH0sXG4gICAgICAgICAgICAgICAgICAgIGNsZWFyOiAoKSA9PiB7IHRoaXMuc2V0U3RhdHVzKCcnLCAnaW5mbycsIHsgc3RpY2t5OiBmYWxzZSB9KTsgcmV0dXJuIGN0bDsgfSxcbiAgICAgICAgICAgICAgICAgICAgZG9uZTogKG1zZywgbXMpID0+IGN0bC5zdWNjZXNzKG1zZywgbXMpXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAvLyB0cnkgdG8gdXBncmFkZSB0byBsdC11aS1odWIgcmVhbCB0YXNrIGFmdGVyIG1vdW50XG4gICAgICAgICAgICAgICAgbW91bnRVaUh1Yk9uY2UoKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaHViTm93ID0gKHR5cGVvZiBsdFVJSHViICE9PSAndW5kZWZpbmVkJykgPyBsdFVJSHViIDogUk9PVC5sdFVJSHViO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaHViTm93Py5iZWdpblRhc2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7IGh1Yk5vdy5iZWdpblRhc2sobGFiZWwsIHRvbmUpOyB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBjdGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfSkoKTtcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBUaGVtZSBicmlkZ2UgKEByZXNvdXJjZSBUSEVNRV9DU1MgXHUyMTkyIEdNX2FkZFN0eWxlKVxuICAgIC8vIEdyYW50cyBhcmUgZXhwZWN0ZWQgaW4gdGhlIHBhcmVudCAoZW50cnkpIGJhbm5lcjsgdGhpcyBpcyBzYWZlIG5vLW9wLlxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBjb3JlLnRoZW1lID0gY29yZS50aGVtZSB8fCB7XG4gICAgICAgIGFwcGx5KCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBPbmx5IG1haW4gc2NyaXB0XHUyMDE5cyBAZ3JhbnQgbWF0dGVyczsgQHJlcXVpcmUgbWV0YWRhdGEgaXMgaWdub3JlZCBieSBUTVxuICAgICAgICAgICAgICAgIGNvbnN0IGNzcyA9ICh0eXBlb2YgR01fZ2V0UmVzb3VyY2VUZXh0ID09PSAnZnVuY3Rpb24nKSA/IEdNX2dldFJlc291cmNlVGV4dCgnVEhFTUVfQ1NTJykgOiAnJztcbiAgICAgICAgICAgICAgICBpZiAoY3NzICYmIHR5cGVvZiBHTV9hZGRTdHlsZSA9PT0gJ2Z1bmN0aW9uJykgR01fYWRkU3R5bGUoY3NzKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyBjb25zb2xlLndhcm4oJ1tsdC1jb3JlXSB0aGVtZS5hcHBseSBmYWlsZWQnLCBlKTsgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFNtYWxsIHV0aWxpdGllc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBjb3JlLnV0aWwgPSBjb3JlLnV0aWwgfHwge1xuICAgICAgICBzbGVlcChtcykgeyByZXR1cm4gbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIE1hdGgubWF4KDAsIG1zIHwgMCkpKTsgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUnVuIGEgZnVuY3Rpb24gb25seSBvbmNlIHBlciBrZXkgKHBlciBwYWdlIGxvYWQpLlxuICAgICAgICAgKi9cbiAgICAgICAgb25jZShrZXksIGZuKSB7XG4gICAgICAgICAgICBjb25zdCBzdG9yZSA9IChjb3JlLl9fb25jZSA9IGNvcmUuX19vbmNlIHx8IG5ldyBTZXQoKSk7XG4gICAgICAgICAgICBpZiAoc3RvcmUuaGFzKGtleSkpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICBzdG9yZS5hZGQoa2V5KTtcbiAgICAgICAgICAgIHJldHVybiBmbigpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBEYXRhIChpbnRlbnRpb25hbGx5IGJsYW5rIGluIGNvcmUpXG4gICAgLy8gRG8gTk9UIGRlZmluZSBjb3JlLmRhdGEgaGVyZTsgbHQtZGF0YS1jb3JlIC8geW91ciByZXBvcyBhdWdtZW50IGl0LlxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gUVQgaGVscGVyczogcmVwb3MgKyBwcm9tb3Rpb24gKyBxdW90ZSBjb250ZXh0ICsgaHViIGJ1dHRvblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAgIGNvcmUucXQgPSBjb3JlLnF0IHx8ICgoKSA9PiB7XG4gICAgICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpID8gdW5zYWZlV2luZG93IDogd2luZG93O1xuXG4gICAgICAgIGZ1bmN0aW9uIGdldFRhYlNjb3BlSWQobnMgPSAnUVQnKSB7XG4gICAgICAgICAgICB0cnkgeyBpZiAodHlwZW9mIFJPT1QuZ2V0VGFiU2NvcGVJZCA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIFJPT1QuZ2V0VGFiU2NvcGVJZChucyk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHN0b3JhZ2UgPSBST09ULnNlc3Npb25TdG9yYWdlO1xuICAgICAgICAgICAgICAgIGNvbnN0IEsgPSBgbHQ6JHtuc306X19zY29wZUlkYDtcbiAgICAgICAgICAgICAgICBsZXQgdiA9IHN0b3JhZ2UuZ2V0SXRlbShLKTtcbiAgICAgICAgICAgICAgICBpZiAoIXYpIHtcbiAgICAgICAgICAgICAgICAgICAgdiA9IFN0cmluZyhNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAyMTQ3NDgzNjQ3KSk7XG4gICAgICAgICAgICAgICAgICAgIHN0b3JhZ2Uuc2V0SXRlbShLLCB2KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgbiA9IE51bWJlcih2KTtcbiAgICAgICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSB8fCBuIDw9IDApIHRocm93IG5ldyBFcnJvcignYmFkIHNjb3BlJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG47XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSAnX19MVF9RVF9TQ09QRV9JRF9fJztcbiAgICAgICAgICAgICAgICBpZiAoIVJPT1Rba2V5XSkgUk9PVFtrZXldID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjE0NzQ4MzY0Nyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFJPT1Rba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGdldFFURigpIHtcbiAgICAgICAgICAgIGNvbnN0IG1ha2UgPSBST09ULmx0Py5jb3JlPy5kYXRhPy5tYWtlRmxhdFNjb3BlZFJlcG87XG4gICAgICAgICAgICByZXR1cm4gKHR5cGVvZiBtYWtlID09PSAnZnVuY3Rpb24nKSA/IG1ha2UoeyBuczogJ1FUJywgZW50aXR5OiAncXVvdGUnLCBsZWdhY3lFbnRpdHk6ICdRdW90ZUhlYWRlcicgfSkgOiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgYXN5bmMgZnVuY3Rpb24gdXNlRHJhZnRSZXBvKCkge1xuICAgICAgICAgICAgY29uc3QgUVRGID0gZ2V0UVRGKCk7XG4gICAgICAgICAgICBpZiAoIVFURikgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICBjb25zdCB7IHJlcG8gfSA9IFFURi51c2UoZ2V0VGFiU2NvcGVJZCgnUVQnKSk7XG4gICAgICAgICAgICByZXR1cm4gcmVwbyB8fCBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgYXN5bmMgZnVuY3Rpb24gdXNlUXVvdGVSZXBvKHFrKSB7XG4gICAgICAgICAgICBjb25zdCBRVEYgPSBnZXRRVEYoKTtcbiAgICAgICAgICAgIGlmICghUVRGIHx8ICFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShOdW1iZXIocWspKTtcbiAgICAgICAgICAgIHJldHVybiByZXBvIHx8IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyAtLS0tLS0tLS0tIFByb21vdGlvbiAoQSkgLS0tLS0tLS0tLVxuICAgICAgICBmdW5jdGlvbiBuZWVkc01lcmdlKGN1cnJlbnQgPSB7fSwgZHJhZnQgPSB7fSkge1xuICAgICAgICAgICAgY29uc3QgY3VyVXBkID0gTnVtYmVyKGN1cnJlbnQuVXBkYXRlZF9BdCA/PyAwKTtcbiAgICAgICAgICAgIGNvbnN0IGRVcGQgPSBOdW1iZXIoZHJhZnQ/LlVwZGF0ZWRfQXQgPz8gMCk7XG4gICAgICAgICAgICBjb25zdCBjdXJDdXN0ID0gU3RyaW5nKGN1cnJlbnQuQ3VzdG9tZXJfTm8gPz8gJycpO1xuICAgICAgICAgICAgY29uc3QgbmV3Q3VzdCA9IFN0cmluZyhkcmFmdD8uQ3VzdG9tZXJfTm8gPz8gJycpO1xuICAgICAgICAgICAgY29uc3Qga2V5Q2hhbmdlZCA9IFN0cmluZyhjdXJyZW50LkNhdGFsb2dfS2V5ID8/ICcnKSAhPT0gU3RyaW5nKGRyYWZ0Py5DYXRhbG9nX0tleSA/PyAnJyk7XG4gICAgICAgICAgICBjb25zdCBjb2RlQ2hhbmdlZCA9IFN0cmluZyhjdXJyZW50LkNhdGFsb2dfQ29kZSA/PyAnJykgIT09IFN0cmluZyhkcmFmdD8uQ2F0YWxvZ19Db2RlID8/ICcnKTtcbiAgICAgICAgICAgIHJldHVybiAoZFVwZCA+IGN1clVwZCkgfHwga2V5Q2hhbmdlZCB8fCBjb2RlQ2hhbmdlZCB8fCAoY3VyQ3VzdCAhPT0gbmV3Q3VzdCk7XG4gICAgICAgIH1cblxuICAgICAgICBhc3luYyBmdW5jdGlvbiBtZXJnZU9uY2UocWspIHtcbiAgICAgICAgICAgIGNvbnN0IGRyYWZ0UmVwbyA9IGF3YWl0IHVzZURyYWZ0UmVwbygpO1xuICAgICAgICAgICAgaWYgKCFkcmFmdFJlcG8pIHJldHVybiAnbm8tZGMnO1xuICAgICAgICAgICAgbGV0IGRyYWZ0ID0gKGF3YWl0IGRyYWZ0UmVwby5nZXRIZWFkZXI/LigpKSB8fCAoYXdhaXQgZHJhZnRSZXBvLmdldD8uKCkpO1xuXG4gICAgICAgICAgICAvLyBJZiBlbXB0eSwgdHJ5IGxlZ2FjeSBcImRyYWZ0XCIgc2NvcGUgYW5kIG1pZ3JhdGUgaXQgZm9yd2FyZFxuICAgICAgICAgICAgaWYgKCFkcmFmdCB8fCAhT2JqZWN0LmtleXMoZHJhZnQpLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgcmVwbzogbGVnYWN5IH0gPSBnZXRRVEYoKS51c2UoJ2RyYWZ0Jyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxlZ2FjeURyYWZ0ID0gKGF3YWl0IGxlZ2FjeS5nZXRIZWFkZXI/LigpKSB8fCAoYXdhaXQgbGVnYWN5LmdldD8uKCkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobGVnYWN5RHJhZnQgJiYgT2JqZWN0LmtleXMobGVnYWN5RHJhZnQpLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgZHJhZnRSZXBvLnBhdGNoSGVhZGVyPy4obGVnYWN5RHJhZnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZHJhZnQgPSBsZWdhY3lEcmFmdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWRyYWZ0IHx8ICFPYmplY3Qua2V5cyhkcmFmdCkubGVuZ3RoKSByZXR1cm4gJ25vLWRyYWZ0JztcblxuICAgICAgICAgICAgY29uc3QgcXVvdGVSZXBvID0gYXdhaXQgdXNlUXVvdGVSZXBvKHFrKTtcbiAgICAgICAgICAgIGlmICghcXVvdGVSZXBvKSByZXR1cm4gJ25vLXF1b3RlJztcblxuICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IChhd2FpdCBxdW90ZVJlcG8uZ2V0SGVhZGVyPy4oKSkgfHwge307XG4gICAgICAgICAgICBpZiAoIW5lZWRzTWVyZ2UoY3VycmVudCwgZHJhZnQpKSByZXR1cm4gJ25vb3AnO1xuXG4gICAgICAgICAgICBhd2FpdCBxdW90ZVJlcG8ucGF0Y2hIZWFkZXI/Lih7XG4gICAgICAgICAgICAgICAgLi4uZHJhZnQsXG4gICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBOdW1iZXIocWspLFxuICAgICAgICAgICAgICAgIFF1b3RlX0hlYWRlcl9GZXRjaGVkX0F0OiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgICAgIFByb21vdGVkX0Zyb206ICdkcmFmdCcsXG4gICAgICAgICAgICAgICAgUHJvbW90ZWRfQXQ6IERhdGUubm93KClcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0cnkgeyBhd2FpdCBkcmFmdFJlcG8uY2xlYXI/LigpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgdHJ5IHsgY29uc3QgeyByZXBvOiBsZWdhY3kgfSA9IGdldFFURigpLnVzZSgnZHJhZnQnKTsgYXdhaXQgbGVnYWN5LmNsZWFyPy4oKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIHJldHVybiAnbWVyZ2VkJztcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IFJFVFJZID0geyB0aW1lcjogbnVsbCwgdHJpZXM6IDAsIG1heDogMjAsIG1zOiAyNTAgfTtcbiAgICAgICAgZnVuY3Rpb24gc3RvcFJldHJ5KCkgeyBpZiAoUkVUUlkudGltZXIpIGNsZWFySW50ZXJ2YWwoUkVUUlkudGltZXIpOyBSRVRSWS50aW1lciA9IG51bGw7IFJFVFJZLnRyaWVzID0gMDsgfVxuICAgICAgICBmdW5jdGlvbiBwcm9tb3RlRHJhZnRUb1F1b3RlKHsgcWssIHN0cmF0ZWd5ID0gJ29uY2UnIH0gPSB7fSkge1xuICAgICAgICAgICAgaWYgKHN0cmF0ZWd5ID09PSAncmV0cnknKSB7XG4gICAgICAgICAgICAgICAgc3RvcFJldHJ5KCk7XG4gICAgICAgICAgICAgICAgUkVUUlkudGltZXIgPSBzZXRJbnRlcnZhbChhc3luYyAoKSA9PiB7IFJFVFJZLnRyaWVzKys7IGNvbnN0IHJlcyA9IGF3YWl0IG1lcmdlT25jZShxayk7IGlmIChyZXMgPT09ICdtZXJnZWQnIHx8IFJFVFJZLnRyaWVzID49IFJFVFJZLm1heCkgc3RvcFJldHJ5KCk7IH0sIFJFVFJZLm1zKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWVyZ2VPbmNlKHFrKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIC0tLS0tLS0tLS0gUXVvdGUgQ29udGV4dCAoQikgLS0tLS0tLS0tLVxuICAgICAgICBmdW5jdGlvbiBnZXROdW1iZXIodikgeyBjb25zdCBuID0gTnVtYmVyKHYpOyByZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gbiA6IDA7IH1cbiAgICAgICAgZnVuY3Rpb24gZnJvbVVybCgpIHsgdHJ5IHsgY29uc3QgdSA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7IHJldHVybiB7IHF1b3RlS2V5OiBnZXROdW1iZXIodS5zZWFyY2hQYXJhbXMuZ2V0KCdRdW90ZUtleScpIHx8IHUuc2VhcmNoUGFyYW1zLmdldCgncXVvdGVLZXknKSkgfTsgfSBjYXRjaCB7IHJldHVybiB7IHF1b3RlS2V5OiAwIH07IH0gfVxuICAgICAgICBmdW5jdGlvbiBmcm9tRG9tKCkge1xuICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1xdW90ZS1rZXldLCNRdW90ZUtleSxbbmFtZT1cIlF1b3RlS2V5XCJdJyk7XG4gICAgICAgICAgICBjb25zdCBxayA9IGVsID8gZ2V0TnVtYmVyKGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1xdW90ZS1rZXknKSA/PyBlbC52YWx1ZSkgOiAwO1xuICAgICAgICAgICAgY29uc3QgcG4gPSAoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLndpemFyZC1zdGVwcyAuYWN0aXZlLCAud2l6YXJkIC5hY3RpdmUsIC5wbGV4LXNpZGV0YWJzIC5hY3RpdmUnKT8udGV4dENvbnRlbnRcbiAgICAgICAgICAgICAgICB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGFnZS10aXRsZSwgLmNvbnRlbnQtaGVhZGVyIGgxLCAucGxleC1uYXZiYXItdGl0bGUnKT8udGV4dENvbnRlbnRcbiAgICAgICAgICAgICAgICB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpPy50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgcmV0dXJuIHsgcXVvdGVLZXk6IHFrLCBwYWdlTmFtZTogcG4gfTtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBmcm9tS28oKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGtvUm9vdCA9ICh3aW5kb3cua28gJiYgdHlwZW9mIHdpbmRvdy5rby5kYXRhRm9yID09PSAnZnVuY3Rpb24nKSA/IHdpbmRvdy5rby5kYXRhRm9yKGRvY3VtZW50LmJvZHkpIDogbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCBxayA9IGdldE51bWJlcihrb1Jvb3Q/LlF1b3RlS2V5ID8/IGtvUm9vdD8ucXVvdGVLZXkgPz8ga29Sb290Py5RdW90ZT8uUXVvdGVLZXkpIHx8IDA7XG4gICAgICAgICAgICAgICAgY29uc3QgcG4gPSBTdHJpbmcoa29Sb290Py5DdXJyZW50UGFnZU5hbWUgPz8ga29Sb290Py5jdXJyZW50UGFnZU5hbWUgPz8ga29Sb290Py5XaXphcmQ/LkN1cnJlbnRQYWdlTmFtZSA/PyAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHF1b3RlS2V5OiBxaywgcGFnZU5hbWU6IHBuIH07XG4gICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIHsgcXVvdGVLZXk6IDAsIHBhZ2VOYW1lOiAnJyB9OyB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gY29hbGVzY2UoKSB7XG4gICAgICAgICAgICBjb25zdCBhID0gZnJvbUtvKCksIGIgPSBmcm9tRG9tKCksIGMgPSBmcm9tVXJsKCk7XG4gICAgICAgICAgICBjb25zdCBxdW90ZUtleSA9IGEucXVvdGVLZXkgfHwgYi5xdW90ZUtleSB8fCBjLnF1b3RlS2V5IHx8IDA7XG4gICAgICAgICAgICBjb25zdCBwYWdlTmFtZSA9IChhLnBhZ2VOYW1lIHx8IGIucGFnZU5hbWUgfHwgZG9jdW1lbnQudGl0bGUgfHwgJycpLnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCk7XG4gICAgICAgICAgICBjb25zdCBpc09uUGFydFN1bW1hcnkgPSAoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERPTSBzaWduYWwgZnJvbSBQYXJ0IFN1bW1hcnk6IElEcyBsaWtlIFwiUXVvdGVQYXJ0U3VtbWFyeUZvcm1fKlwiXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc1BTRm9ybSA9XG4gICAgICAgICAgICAgICAgICAgICAgICAhIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNRdW90ZVBhcnRTdW1tYXJ5Rm9ybSxbaWRePVwiUXVvdGVQYXJ0U3VtbWFyeUZvcm1fXCJdJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChoYXNQU0Zvcm0pIHJldHVybiB0cnVlO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIChPcHRpb25hbCkgYWN0aXZlIHdpemFyZCBzdGVwIGxhYmVsIGVxdWFscyBcIlBhcnQgU3VtbWFyeVwiXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhY3RpdmUgJiYgYWN0aXZlLnRleHRDb250ZW50ICYmIGFjdGl2ZS50ZXh0Q29udGVudC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gJ3BhcnQgc3VtbWFyeScpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrcyAoVVJML3RpdGxlIGhldXJpc3RpY3MpXG4gICAgICAgICAgICAgICAgcmV0dXJuIC9wYXJ0XFxzKnN1bW1hcnkvaS50ZXN0KHBhZ2VOYW1lKSB8fFxuICAgICAgICAgICAgICAgICAgICAvcGFydCg/OiUyMHxcXHN8LSk/c3VtbWFyeXxzdW1tYXJ5KD86JTIwfFxcc3wtKT9wYXJ0L2kudGVzdChsb2NhdGlvbi5ocmVmKTtcbiAgICAgICAgICAgIH0pKCk7XG5cbiAgICAgICAgICAgIHJldHVybiB7IHF1b3RlS2V5LCBwYWdlTmFtZSwgaXNPblBhcnRTdW1tYXJ5IH07XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZ2V0UXVvdGVDb250ZXh0KCkge1xuICAgICAgICAgICAgY29uc3QgeyBxdW90ZUtleSwgcGFnZU5hbWUsIGlzT25QYXJ0U3VtbWFyeSB9ID0gY29hbGVzY2UoKTtcbiAgICAgICAgICAgIHJldHVybiB7IHF1b3RlS2V5LCBwYWdlTmFtZSwgaXNPblBhcnRTdW1tYXJ5LCBoYXNRdW90ZUtleTogcXVvdGVLZXkgPiAwLCBpc1BhZ2U6IChuKSA9PiBuZXcgUmVnRXhwKFN0cmluZyhuKS5yZXBsYWNlKC9cXHMrL2csICdcXFxccyonKSwgJ2knKS50ZXN0KHBhZ2VOYW1lKSB9O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gLS0tLS0tLS0tLSBIdWIgaGVscGVycyAoQykgLS0tLS0tLS0tLVxuICAgICAgICBhc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6ICduYXYnIH0pIHtcbiAgICAgICAgICAgIGNvbnN0IFIgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpID8gdW5zYWZlV2luZG93IDogd2luZG93O1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5zdXJlID0gKFIuZW5zdXJlTFRIdWIgfHwgd2luZG93LmVuc3VyZUxUSHViKTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGVuc3VyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgZW5zdXJlKG9wdHMpOyAvLyBtYXkgcmV0dXJuIHZvaWRcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGh1Yk5vdyA9ICh0eXBlb2YgbHRVSUh1YiAhPT0gJ3VuZGVmaW5lZCcpID8gbHRVSUh1YiA6IFIubHRVSUh1YjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChodWJOb3cpIHJldHVybiBodWJOb3c7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGh1Yk5vdyA9ICh0eXBlb2YgbHRVSUh1YiAhPT0gJ3VuZGVmaW5lZCcpID8gbHRVSUh1YiA6IFIubHRVSUh1YjtcbiAgICAgICAgICAgICAgICBpZiAoaHViTm93KSByZXR1cm4gaHViTm93O1xuICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IF9fZmFsbGJhY2s6IHRydWUgfTsgLy8gZmFsbGJhY2sgc2VudGluZWxcbiAgICAgICAgfVxuXG4gICAgICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZUh1YkJ1dHRvbih7XG4gICAgICAgICAgICBpZCwgbGFiZWwsIHRpdGxlLCBzaWRlID0gJ2xlZnQnLCB3ZWlnaHQgPSAxMjAsIG9uQ2xpY2ssIHNob3dXaGVuLCBmb3JjZSA9IGZhbHNlLCBtb3VudCA9ICduYXYnXG4gICAgICAgIH0gPSB7fSkge1xuICAgICAgICAgICAgY29uc3QgaHViID0gYXdhaXQgZ2V0SHViKHsgbW91bnQgfSk7XG4gICAgICAgICAgICBjb25zdCB1c2luZ1VpSHViID0gISEoaHViICYmICFodWIuX19mYWxsYmFjayAmJiB0eXBlb2YgaHViLnJlZ2lzdGVyQnV0dG9uID09PSAnZnVuY3Rpb24nKTtcblxuICAgICAgICAgICAgY29uc3Qgc2hvdWxkU2hvd05vdyA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkgeyBjb25zdCBjdHggPSBnZXRRdW90ZUNvbnRleHQoKTsgcmV0dXJuICEhKGZvcmNlIHx8ICh0eXBlb2Ygc2hvd1doZW4gPT09ICdmdW5jdGlvbicgPyBzaG93V2hlbihjdHgpIDogdHJ1ZSkpOyB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggeyByZXR1cm4gISFmb3JjZTsgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKHVzaW5nVWlIdWIpIHtcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBsaXN0SWRzKCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdiA9IGh1Yi5saXN0Py4oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheSh2KSkgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU3VwcG9ydCBhcnJheXMgb2Ygc3RyaW5ncyBPUiBhcnJheXMgb2YgeyBpZCwgLi4uIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2Lm1hcCh4ID0+ICh4ICYmIHR5cGVvZiB4ID09PSAnb2JqZWN0JykgPyB4LmlkIDogeCkuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIFtdOyB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gaXNQcmVzZW50KCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBodWIuaGFzID09PSAnZnVuY3Rpb24nKSByZXR1cm4gISFodWIuaGFzKGlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBsaXN0SWRzKCkuaW5jbHVkZXMoaWQpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgYXN5bmMgZnVuY3Rpb24gcmVnaXN0ZXIoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlZiA9IHsgaWQsIGxhYmVsLCB0aXRsZSwgd2VpZ2h0LCBvbkNsaWNrIH07XG4gICAgICAgICAgICAgICAgICAgIC8vIEFsd2F5cyBwcmVmZXIgdGhlIDItYXJnIGZvcm07IGZhbGwgYmFjayB0byAxLWFyZ1xuICAgICAgICAgICAgICAgICAgICB0cnkgeyBodWIucmVnaXN0ZXJCdXR0b24/LihzaWRlLCBkZWYpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgICAgICBhd2FpdCAwO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzUHJlc2VudCgpKSB7IHRyeSB7IGh1Yi5yZWdpc3RlckJ1dHRvbj8uKHsgLi4uZGVmLCBzZWN0aW9uOiBzaWRlIH0pOyB9IGNhdGNoIHsgfSB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgc3RpbGwgbm90IHByZXNlbnQsIHRyeSB0aGUgYWx0ZXJuYXRlIGZvcm0gZXhwbGljaXRseVxuICAgICAgICAgICAgICAgICAgICBhd2FpdCAwOyAvLyB5aWVsZFxuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzUHJlc2VudCgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGh1Yi5yZWdpc3RlckJ1dHRvbih7IC4uLmRlZiwgc2VjdGlvbjogc2lkZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IDA7XG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNQcmVzZW50KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKHNpZGUsIGRlZik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaXNQcmVzZW50KCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gZW5zdXJlUmVnKCkgeyBpZiAoaXNQcmVzZW50KCkpIHJldHVybiBmYWxzZTsgcmV0dXJuIHJlZ2lzdGVyKCk7IH1cbiAgICAgICAgICAgICAgICBlbnN1cmVSZWcoKTtcblxuICAgICAgICAgICAgICAgIGFzeW5jIGZ1bmN0aW9uIHJlY29uY2lsZSgpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHNob3cgPSBzaG91bGRTaG93Tm93KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcmVzZW50ID0gaXNQcmVzZW50KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2hvdykgeyBpZiAoIXByZXNlbnQpIGVuc3VyZVJlZygpOyByZXR1cm4gdHJ1ZTsgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXNlbnQpIGh1Yi5yZW1vdmU/LihpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBlbnN1cmVIdWJCdXR0b24uX19zdGF0ZSA9IGVuc3VyZUh1YkJ1dHRvbi5fX3N0YXRlIHx8IHt9O1xuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gZW5zdXJlSHViQnV0dG9uLl9fc3RhdGVbaWRdIHx8PSB7IG9iczogbnVsbCwgb2ZmVXJsOiBudWxsIH07XG5cbiAgICAgICAgICAgICAgICBhd2FpdCByZWNvbmNpbGUoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLm9icykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCcpIHx8IGRvY3VtZW50LmJvZHk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyb290ICYmIHdpbmRvdy5NdXRhdGlvbk9ic2VydmVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7IHJlY29uY2lsZSgpOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9icy5vYnNlcnZlKHJvb3QsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghc3RhdGUub2ZmVXJsICYmIHdpbmRvdy5UTVV0aWxzPy5vblVybENoYW5nZSkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vZmZVcmwgPSB3aW5kb3cuVE1VdGlscy5vblVybENoYW5nZSgoKSA9PiB7IHJlY29uY2lsZSgpOyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBzeW50aGVzaXplIGEgc2ltcGxlIG5hdmJhciBidXR0b24gKG9ubHkgaWYgbHQtdWktaHViIG5vdCBwcmVzZW50KVxuICAgICAgICAgICAgY29uc3QgZG9tSWQgPSBgbHQtbmF2YnRuLSR7aWR9YDtcbiAgICAgICAgICAgIGZ1bmN0aW9uIG5hdlJpZ2h0KCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjbmF2QmFyIC5uYXZiYXItcmlnaHQnKSB8fFxuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1uYXZiYXItY29udGFpbmVyIC5uYXZiYXItcmlnaHQnKSB8fFxuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubmF2YmFyLXJpZ2h0JykgfHxcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25hdkJhcicpIHx8IGRvY3VtZW50LmJvZHk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmdW5jdGlvbiBlbnN1cmVEb20oKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaG9zdCA9IG5hdlJpZ2h0KCk7IGlmICghaG9zdCkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgbGV0IGJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGRvbUlkKTtcbiAgICAgICAgICAgICAgICBpZiAoIWJ0bikge1xuICAgICAgICAgICAgICAgICAgICBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgICAgICAgICAgICAgYnRuLmlkID0gZG9tSWQ7IGJ0bi50eXBlID0gJ2J1dHRvbic7IGJ0bi5jbGFzc05hbWUgPSAnYnRuIGJ0bi1wcmltYXJ5JztcbiAgICAgICAgICAgICAgICAgICAgYnRuLnRpdGxlID0gdGl0bGUgfHwgJyc7IGJ0bi50ZXh0Q29udGVudCA9IGxhYmVsIHx8IGlkOyBidG4uc3R5bGUubWFyZ2luTGVmdCA9ICc4cHgnO1xuICAgICAgICAgICAgICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXYpID0+IHsgdHJ5IHsgb25DbGljaz8uKGV2KTsgfSBjYXRjaCB7IH0gfSk7XG4gICAgICAgICAgICAgICAgICAgIGhvc3QuYXBwZW5kQ2hpbGQoYnRuKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJ0bjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bmN0aW9uIHJlbW92ZURvbSgpIHsgY29uc3QgbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGRvbUlkKTsgaWYgKG4pIHRyeSB7IG4ucmVtb3ZlKCk7IH0gY2F0Y2ggeyB9IH1cblxuICAgICAgICAgICAgYXN5bmMgZnVuY3Rpb24gcmVjb25jaWxlRG9tKCkgeyBjb25zdCBzaG93ID0gc2hvdWxkU2hvd05vdygpOyBpZiAoc2hvdykgZW5zdXJlRG9tKCk7IGVsc2UgcmVtb3ZlRG9tKCk7IH1cblxuICAgICAgICAgICAgZW5zdXJlSHViQnV0dG9uLl9fc3RhdGUgPSBlbnN1cmVIdWJCdXR0b24uX19zdGF0ZSB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gZW5zdXJlSHViQnV0dG9uLl9fc3RhdGVbaWRdIHx8PSB7IG9iczogbnVsbCwgb2ZmVXJsOiBudWxsIH07XG5cbiAgICAgICAgICAgIGF3YWl0IHJlY29uY2lsZURvbSgpO1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5vYnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCcpIHx8IGRvY3VtZW50LmJvZHk7XG4gICAgICAgICAgICAgICAgaWYgKHJvb3QgJiYgd2luZG93Lk11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUub2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4geyByZWNvbmNpbGVEb20oKTsgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLm9icy5vYnNlcnZlKHJvb3QsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghc3RhdGUub2ZmVXJsICYmIHdpbmRvdy5UTVV0aWxzPy5vblVybENoYW5nZSkge1xuICAgICAgICAgICAgICAgIHN0YXRlLm9mZlVybCA9IHdpbmRvdy5UTVV0aWxzLm9uVXJsQ2hhbmdlKCgpID0+IHsgcmVjb25jaWxlRG9tKCk7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4geyBwcm9tb3RlRHJhZnRUb1F1b3RlLCBzdG9wUmV0cnksIHVzZURyYWZ0UmVwbywgdXNlUXVvdGVSZXBvLCBnZXRRdW90ZUNvbnRleHQsIGdldEh1YiwgZW5zdXJlSHViQnV0dG9uIH07XG4gICAgfSkoKTtcblxuICAgIC8vIEF1dG8tYXBwbHkgVEhFTUVfQ1NTIGlmIHByb3ZpZGVkIChzYWZlIG5vLW9wIG90aGVyd2lzZSlcbiAgICB0cnkgeyBjb3JlLnRoZW1lLmFwcGx5KCk7IH0gY2F0Y2ggeyB9XG5cbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOztBQVNBLEdBQUMsTUFBTTtBQUVILFVBQU0sT0FBUSxPQUFPLGlCQUFpQixjQUFjLGVBQWU7QUFDbkUsVUFBTSxLQUFNLEtBQUssS0FBSyxLQUFLLE1BQU0sQ0FBQztBQUNsQyxVQUFNLE9BQVEsR0FBRyxPQUFPLEdBQUcsUUFBUSxDQUFDO0FBS3BDLFNBQUssT0FBTyxLQUFLLFFBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUlyQixNQUFNLFNBQVM7QUFDWCxZQUFJO0FBQ0EsY0FBSSxLQUFLLFVBQVUsT0FBUSxRQUFPLE1BQU0sS0FBSyxTQUFTLE9BQU87QUFDN0QsY0FBSSxLQUFLLFNBQVMsT0FBUSxRQUFPLE1BQU0sS0FBSyxRQUFRLE9BQU87QUFBQSxRQUMvRCxRQUFRO0FBQUEsUUFBa0I7QUFDMUIsZUFBTztBQUFBLE1BQ1g7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BTUEsTUFBTSxjQUFjLElBQUk7QUFDcEIsWUFBSSxNQUFNLE1BQU0sS0FBSyxLQUFLLE9BQU87QUFDakMsWUFBSSxDQUFDLEtBQUs7QUFDTixjQUFJO0FBQ0EsZ0JBQUksS0FBSyxVQUFVLFNBQVM7QUFDeEIsb0JBQU0sS0FBSyxTQUFTLFFBQVE7QUFDNUIsb0JBQU0sTUFBTSxLQUFLLEtBQUssT0FBTztBQUFBLFlBQ2pDLFdBQVcsS0FBSyxTQUFTLFNBQVM7QUFDOUIsb0JBQU0sS0FBSyxRQUFRLFFBQVE7QUFDM0Isb0JBQU0sTUFBTSxLQUFLLEtBQUssT0FBTztBQUFBLFlBQ2pDO0FBQUEsVUFDSixRQUFRO0FBQUEsVUFBa0I7QUFBQSxRQUM5QjtBQUNBLGVBQU8sR0FBRyxPQUFPLE1BQVM7QUFBQSxNQUM5QjtBQUFBLElBQ0o7QUFNQSxTQUFLLE9BQU8sS0FBSyxRQUFRO0FBQUEs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U0FBUyxlQUFlLEtBQUs7QUFDdkMsY0FBSSxDQUFDLEtBQUs7QUFDTixrQkFBTSxTQUFTLGNBQWMsUUFBUTtBQUNyQyxnQkFBSSxLQUFLO0FBQU8sZ0JBQUksT0FBTztBQUFVLGdCQUFJLFlBQVk7QUFDckQsZ0JBQUksUUFBUSxTQUFTO0FBQUksZ0JBQUksY0FBYyxTQUFTO0FBQUksZ0JBQUksTUFBTSxhQUFhO0FBQy9FLGdCQUFJLGlCQUFpQixTQUFTLENBQUMsT0FBTztBQUFFLGtCQUFJO0FBQUUsMEJBQVUsRUFBRTtBQUFBLGNBQUcsUUFBUTtBQUFBLGNBQUU7QUFBQSxZQUFFLENBQUM7QUFDMUUsaUJBQUssWUFBWSxHQUFHO0FBQUEsVUFDeEI7QUFDQSxpQkFBTztBQUFBLFFBQ1g7QUFDQSxpQkFBUyxZQUFZO0FBQUUsZ0JBQU0sSUFBSSxTQUFTLGVBQWUsS0FBSztBQUFHLGNBQUksRUFBRyxLQUFJO0FBQUUsY0FBRSxPQUFPO0FBQUEsVUFBRyxRQUFRO0FBQUEsVUFBRTtBQUFBLFFBQUU7QUFFdEcsdUJBQWUsZUFBZTtBQUFFLGdCQUFNLE9BQU8sY0FBYztBQUFHLGNBQUksS0FBTSxXQUFVO0FBQUEsY0FBUSxXQUFVO0FBQUEsUUFBRztBQUV2Ryx3QkFBZ0IsVUFBVSxnQkFBZ0IsV0FBVyxDQUFDO0FBQ3RELGNBQU0sUUFBUSxnQkFBZ0IsUUFBUSxFQUFFLE1BQU0sRUFBRSxLQUFLLE1BQU0sUUFBUSxLQUFLO0FBRXhFLGNBQU0sYUFBYTtBQUNuQixZQUFJLENBQUMsTUFBTSxLQUFLO0FBQ1osZ0JBQU0sT0FBTyxTQUFTLGNBQWMsd0JBQXdCLEtBQUssU0FBUztBQUMxRSxjQUFJLFFBQVEsT0FBTyxrQkFBa0I7QUFDakMsa0JBQU0sTUFBTSxJQUFJLGlCQUFpQixNQUFNO0FBQUUsMkJBQWE7QUFBQSxZQUFHLENBQUM7QUFDMUQsa0JBQU0sSUFBSSxRQUFRLE1BQU0sRUFBRSxTQUFTLE1BQU0sWUFBWSxNQUFNLFdBQVcsS0FBSyxDQUFDO0FBQUEsVUFDaEY7QUFBQSxRQUNKO0FBQ0EsWUFBSSxDQUFDLE1BQU0sVUFBVSxPQUFPLFNBQVMsYUFBYTtBQUM5QyxnQkFBTSxTQUFTLE9BQU8sUUFBUSxZQUFZLE1BQU07QUFBRSx5QkFBYTtBQUFBLFVBQUcsQ0FBQztBQUFBLFFBQ3ZFO0FBQ0EsZUFBTztBQUFBLE1BQ1g7QUFFQSxhQUFPLEVBQUUscUJBQXFCLFdBQVcsY0FBYyxjQUFjLGlCQUFpQixRQUFRLGdCQUFnQjtBQUFBLElBQ2xILEdBQUc7QUFHSCxRQUFJO0FBQUUsV0FBSyxNQUFNLE1BQU07QUFBQSxJQUFHLFFBQVE7QUFBQSxJQUFFO0FBQUEsRUFFeEMsR0FBRzsiLAogICJuYW1lcyI6IFsiUk9PVCIsICJodWJOb3ciLCAibGlzdElkcyIsICJpc1ByZXNlbnQiLCAiZW5zdXJlUmVnIiwgInN0YXRlIl0KfQo=
