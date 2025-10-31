(() => {
  // src/shared/lt-plex-tm-utils.user.js
  (function(window2) {
    "use strict";
    const TMUtils = {};
    window2.TMUtils = TMUtils;
    if (typeof unsafeWindow !== "undefined") unsafeWindow.TMUtils = TMUtils;
    if (!("__apiKeyCache" in TMUtils)) TMUtils.__apiKeyCache = null;
    function _normalizeAuth(raw) {
      if (!raw) return "";
      if (/^(Basic|Bearer)\s/i.test(raw)) return raw.trim();
      try {
        return `Basic ${btoa(raw.trim())}`;
      } catch {
        return "";
      }
    }
    async function getApiKey({
      wait = false,
      // set true on routes that load PlexAuth late
      timeoutMs = 0,
      pollMs = 200,
      useCache = true,
      cacheMs = 5 * 6e4
    } = {}) {
      const cached = TMUtils.__apiKeyCache;
      if (useCache && cached && Date.now() - cached.ts < cacheMs) {
        return cached.value;
      }
      const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window2;
      const resolveGetter = () => root?.PlexAuth && typeof root.PlexAuth.getKey === "function" && root.PlexAuth.getKey || root?.PlexAPI && typeof root.PlexAPI.getKey === "function" && root.PlexAPI.getKey || null;
      let getter = resolveGetter();
      if (!getter && wait && timeoutMs > 0) {
        const start = Date.now();
        while (!getter && Date.now() - start < timeoutMs) {
          await new Promise((r) => setTimeout(r, pollMs));
          getter = resolveGetter();
        }
      }
      if (getter) {
        try {
          const val = getter.call(root);
          const key = val && typeof val.then === "function" ? await val : val;
          const out = _normalizeAuth(key);
          if (out) {
            try {
              localStorage.setItem("PlexApiKey", out);
            } catch {
            }
            try {
              if (typeof GM_setValue === "function") GM_setValue("PlexApiKey", out);
            } catch {
            }
            if (useCache) TMUtils.__apiKeyCache = { value: out, ts: Date.now() };
            return out;
          }
        } catch {
        }
      }
      try {
        const rawGM = typeof GM_getValue === "function" ? GM_getValue("PlexApiKey", "") : "";
        if (rawGM) {
          const out = _normalizeAuth(rawGM);
          if (useCache) TMUtils.__apiKeyCache = { value: out, ts: Date.now() };
          return out;
        }
      } catch {
      }
      try {
        const rawLS = localStorage.getItem("PlexApiKey") || "";
        if (rawLS) {
          const out = _normalizeAuth(rawLS);
          if (useCache) TMUtils.__apiKeyCache = { value: out, ts: Date.now() };
          return out;
        }
      } catch {
      }
      return "";
    }
    TMUtils.fetchData = async function fetchData(url, { method = "GET", headers = {}, body, timeoutMs = 15e3, useXHR = false } = {}) {
      const auth = _normalizeAuth(await TMUtils.getApiKey().catch(() => ""));
      const finalHeaders = {
        "Accept": "application/json",
        ...body ? { "Content-Type": "application/json;charset=UTF-8" } : {},
        ...auth ? { "Authorization": auth } : {},
        ...headers
      };
      const payload = typeof body === "string" ? body : body ? JSON.stringify(body) : void 0;
      if (useXHR && typeof GM_xmlhttpRequest === "function") {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Network timeout")), timeoutMs);
          GM_xmlhttpRequest({
            method,
            url,
            headers: finalHeaders,
            data: payload,
            timeout: timeoutMs,
            onload: (res) => {
              clearTimeout(timer);
              const ok2 = res.status >= 200 && res.status < 300;
              if (!ok2) return reject(new Error(`${res.status} ${res.statusText || "Request failed"}`));
              try {
                resolve(JSON.parse(res.responseText || "{}"));
              } catch {
                resolve({});
              }
            },
            onerror: () => {
              clearTimeout(timer);
              reject(new Error("Network error"));
            },
            ontimeout: () => {
              clearTimeout(timer);
              reject(new Error("Network timeout"));
            }
          });
        });
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const resp = await fetch(url, {
          method,
          headers: finalHeaders,
          body: payload,
          signal: ctrl.signal,
          credentials: "include"
          // keep same-origin cookies where needed
        });
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        const text = await resp.text();
        return text ? JSON.parse(text) : {};
      } finally {
        clearTimeout(t);
      }
    };
    TMUtils.ds = async function ds(sourceId, payload, opts = {}) {
      const url = `${location.origin}/api/datasources/${sourceId}/execute?format=2`;
      const json = await TMUtils.fetchData(url, { method: "POST", body: payload, ...opts });
      const rows = Array.isArray(json?.rows) ? json.rows : [];
      return { ...json, rows };
    };
    TMUtils.dsRows = async function dsRows(sourceId, payload, opts = {}) {
      const { rows } = await TMUtils.ds(sourceId, payload, opts);
      return rows;
    };
    (function addUnwrapHelpers() {
      try {
        const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window2.ko;
        if (!TMUtils.unwrap) {
          TMUtils.unwrap = function unwrap(v) {
            try {
              if (KO && typeof KO.unwrap === "function") return KO.unwrap(v);
              return typeof v === "function" ? v() : v;
            } catch {
              return v;
            }
          };
        }
        if (!TMUtils.unwrapDeep) {
          TMUtils.unwrapDeep = function unwrapDeep(x) {
            const seen = /* @__PURE__ */ new WeakMap();
            const isKO = (fn) => !!fn && typeof fn === "function" && (KO && KO.isObservable && KO.isObservable(fn) || KO && KO.isComputed && KO.isComputed(fn) || typeof fn.subscribe === "function" || fn._isObs === true);
            const un = (v) => KO && typeof KO.unwrap === "function" ? KO.unwrap(v) : typeof v === "function" ? isKO(v) ? v() : v : v;
            const walk = (v) => {
              if (v == null) return v;
              const t = typeof v;
              if (t === "string" || t === "number" || t === "boolean") return v;
              if (Array.isArray(v)) return v.map(walk);
              if (t === "function") return un(v);
              if (t === "object") {
                if (seen.has(v)) return seen.get(v);
                const out = Array.isArray(v) ? [] : {};
                seen.set(v, out);
                for (const k in v) {
                  if (Object.prototype.hasOwnProperty.call(v, k)) {
                    out[k] = walk(v[k]);
                  }
                }
                return out;
              }
              return v;
            };
            return walk(x);
          };
        }
        if (!TMUtils.jsonPlain) {
          TMUtils.jsonPlain = function jsonPlain(x, space = 0) {
            try {
              return JSON.stringify(TMUtils.unwrapDeep(x), null, space);
            } catch {
              return JSON.stringify(x, null, space);
            }
          };
        }
      } catch (e) {
      }
    })();
    (function addObsAccessors() {
      const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window2;
      const KO = root.ko;
      function _plexGetter(vm, prop) {
        const g = root?.plex?.data?.getObservableOrValue;
        return typeof g === "function" ? g(vm, prop) : void 0;
      }
      TMUtils.getObsValue = function getObsValue(vmOrEl, pathOrPaths, {
        first = true,
        // if value is an array, return first item
        trim = false,
        // trim string/number to string
        deep = true,
        // deep unwrap (KO + nested)
        allowPlex = true,
        // use plex.data.getObservableOrValue when available
        coalesceFalsy = false
        // if false, empty string is treated as "not found" and tries next candidate
      } = {}) {
        if (!vmOrEl || !pathOrPaths) return void 0;
        const root2 = typeof unsafeWindow !== "undefined" ? unsafeWindow : window2;
        const KO2 = root2.ko;
        const unwrapOnce = (v) => {
          try {
            if (TMUtils.unwrap) return TMUtils.unwrap(v);
            if (KO2?.unwrap) return KO2.unwrap(v);
            return typeof v === "function" ? v() : v;
          } catch {
            return v;
          }
        };
        const unwrapDeep = (v) => {
          try {
            if (TMUtils.unwrapDeep) return TMUtils.unwrapDeep(v);
            if (KO2?.unwrap) return KO2.unwrap(v);
            return typeof v === "function" ? v() : v;
          } catch {
            return v;
          }
        };
        const isKOFunc = (f) => !!f && typeof f === "function" && (KO2?.isObservable?.(f) || "peek" in f || "subscribe" in f || "notifySubscribers" in f);
        let vm = vmOrEl;
        if (vmOrEl && vmOrEl.nodeType === 1) {
          try {
            const ctx = KO2?.contextFor?.(vmOrEl);
            vm = ctx?.$root?.data ?? ctx?.$root ?? ctx?.$data ?? vmOrEl;
          } catch {
          }
        }
        const candidates = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
        const readViaPlex = (p) => {
          try {
            const g = root2?.plex?.data?.getObservableOrValue;
            if (allowPlex && typeof g === "function") {
              const acc = g(vm, p);
              return typeof acc === "function" ? acc() : acc;
            }
          } catch {
          }
          return void 0;
        };
        const readViaPath = (p) => {
          try {
            const segments = String(p).split(".");
            let cur = vm;
            for (const k of segments) {
              cur = cur == null ? void 0 : cur[k];
              if (cur === void 0) break;
            }
            if (typeof cur === "function") return isKOFunc(cur) ? cur() : cur;
            return cur;
          } catch {
            return void 0;
          }
        };
        for (const p of candidates) {
          let v = readViaPlex(p);
          if (v === void 0) v = readViaPath(p);
          v = deep ? unwrapDeep(v) : unwrapOnce(v);
          if (first && Array.isArray(v)) v = v.length ? v[0] : void 0;
          if (trim && (typeof v === "string" || typeof v === "number")) v = String(v).trim();
          const hasValue = v !== void 0 && v !== null && (coalesceFalsy || v !== "");
          if (hasValue) return v;
        }
        return void 0;
      };
      TMUtils.setObsValue = function setObsValue(vm, path, value) {
        if (!vm || !path) return;
        const root2 = typeof unsafeWindow !== "undefined" ? unsafeWindow : window2;
        const KO2 = root2.ko;
        const toArrayIf = (isArrayTarget2, v) => isArrayTarget2 ? Array.isArray(v) ? v : [v] : v;
        const plexGet = root2?.plex?.data?.getObservableOrValue;
        if (typeof plexGet === "function") {
          const acc = plexGet(vm, path);
          if (typeof acc === "function") {
            const isObsArray = !!(acc && typeof acc.push === "function" && typeof acc.removeAll === "function");
            if (isObsArray) {
              acc.removeAll();
              const arr = toArrayIf(true, value);
              if (arr.length) acc.push(...arr);
              return;
            }
            let cur2;
            try {
              cur2 = acc();
            } catch {
              cur2 = void 0;
            }
            const isArrayTarget2 = Array.isArray(cur2);
            acc(toArrayIf(isArrayTarget2, value));
            return;
          }
        }
        const keys = path.split(".");
        const finalKey = keys.pop();
        const parent = keys.reduce((acc, k) => acc == null ? acc : acc[k], vm);
        if (!parent) return;
        const cur = parent[finalKey];
        if (KO2 && typeof KO2.isObservable === "function" && KO2.isObservable(cur) && typeof cur.push === "function" && typeof cur.removeAll === "function") {
          cur.removeAll();
          const arr = toArrayIf(true, value);
          if (arr.length) cur.push(...arr);
          return;
        }
        if (typeof cur === "function") {
          let currentVal;
          try {
            currentVal = cur();
          } catch {
            currentVal = void 0;
          }
          const isArrayTarget2 = Array.isArray(currentVal);
          cur(toArrayIf(isArrayTarget2, value));
          return;
        }
        const isArrayTarget = Array.isArray(cur);
        parent[finalKey] = toArrayIf(isArrayTarget, value);
      };
      TMUtils.coerceId = function coalesceToId(v) {
        const u = TMUtils.unwrapDeep ? TMUtils.unwrapDeep(v) : v;
        const x = Array.isArray(u) ? u.length ? u[0] : void 0 : u;
        return String(x ?? "").trim();
      };
    })();
    function hideMessage() {
      document.getElementById("tm-msg")?.remove();
    }
    function showMessage(text, { type = "info", autoClear = 4e3 } = {}) {
      hideMessage();
      const colors = {
        info: { bg: "#d9edf7", fg: "#31708f" },
        success: { bg: "#dff0d8", fg: "#3c763d" },
        warning: { bg: "#fcf8e3", fg: "#8a6d3b" },
        error: { bg: "#f2dede", fg: "#a94442" }
      }[type] || { bg: "#fff", fg: "#000" };
      const box = document.createElement("div");
      box.id = "tm-msg";
      Object.assign(box.style, {
        position: "fixed",
        top: "10px",
        right: "10px",
        padding: "8px 12px",
        backgroundColor: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.fg}`,
        borderRadius: "4px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        zIndex: 1e4,
        fontSize: "0.9em",
        maxWidth: "80%",
        whiteSpace: "pre-line"
      });
      box.textContent = text;
      document.body.appendChild(box);
      if (autoClear) setTimeout(hideMessage, autoClear);
    }
    function toast(msg, level = "info", ms) {
      showMessage(msg, { type: level, autoClear: ms ?? 4e3 });
    }
    function observeInsert(selector, callback) {
      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          callback(el);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      const existing = document.querySelector(selector);
      if (existing) {
        obs.disconnect();
        callback(existing);
      }
    }
    function waitForModelAsync(sel, {
      pollMs = 250,
      timeoutMs = 3e4,
      requireKo = true,
      // if false, resolve as soon as the element is found
      logger = null,
      // pass TMUtils.getLogger('QT10') / _logger, etc.
      log: log2 = false
      // set true to print debug with console.* even without a logger
    } = {}) {
      const start = Date.now();
      const getKo = () => typeof window2 !== "undefined" && window2.ko || typeof unsafeWindow !== "undefined" && unsafeWindow.ko || null;
      const dbg = (fn, ...args) => {
        if (logger && typeof logger[fn] === "function") logger[fn](...args);
        else if (log2) (console[fn] || console.log)(...args);
      };
      return new Promise((resolve, reject) => {
        function tick() {
          const el = document.querySelector(sel);
          if (!el) return schedule();
          if (!requireKo) {
            log2 && console.debug("\u{1F50D} waitForModelAsync (no KO):", { sel, el });
            return resolve({ element: el, controller: null, viewModel: null });
          }
          const koObj = getKo();
          if (!koObj || typeof koObj.contextFor !== "function") return schedule();
          let controller = null, viewModel = null;
          try {
            const ctx = koObj.contextFor(el);
            controller = ctx && ctx.$data || null;
            viewModel = controller && controller.model || null;
            if (!viewModel && ctx) viewModel = ctx.$root?.data || ctx.$root || null;
          } catch {
          }
          if (logger || log2) {
            console.groupCollapsed("\u{1F50D} waitForModelAsync");
            dbg("debug", "selector \u2192", sel);
            dbg("debug", "controller \u2192", controller);
            dbg("debug", "vm \u2192", viewModel);
            console.groupEnd();
          }
          if (viewModel) return resolve({ element: el, controller, viewModel });
          schedule();
        }
        function schedule() {
          if (Date.now() - start >= timeoutMs) {
            const msg = `Timed out waiting for "${sel}" after ${timeoutMs}ms`;
            dbg("warn", "\u231B waitForModelAsync", msg);
            return reject(new Error(msg));
          }
          setTimeout(tick, pollMs);
        }
        tick();
      });
    }
    TMUtils.waitForModelAsync = waitForModelAsync;
    function selectOptionByText(selectEl, text) {
      const opt = Array.from(selectEl.options).find((o) => o.textContent.trim() === text);
      if (opt) {
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    function selectOptionByValue(selectEl, value) {
      const opt = Array.from(selectEl.options).find((o) => o.value == value);
      if (opt) {
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    function ensureRoute(regex) {
      try {
        return regex.test(location.pathname);
      } catch {
        return false;
      }
    }
    function __tmCreateQuietDispatcher(fn, delay) {
      let t = null;
      return () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          t = null;
          fn();
        }, delay);
      };
    }
    function onRouteChange(handler) {
      if (history.__tmWrapped) {
        handler(location.pathname);
        return;
      }
      const fire = () => {
        try {
          handler(location.pathname);
        } catch (e) {
          console.warn("onRouteChange handler error", e);
        }
      };
      const _ps = history.pushState;
      history.pushState = function() {
        _ps.apply(this, arguments);
        window2.dispatchEvent(new Event("locationchange"));
      };
      const _rs = history.replaceState;
      history.replaceState = function() {
        _rs.apply(this, arguments);
        window2.dispatchEvent(new Event("locationchange"));
      };
      window2.addEventListener("popstate", fire);
      window2.addEventListener("locationchange", fire);
      history.__tmWrapped = true;
      fire();
    }
    function matchRoute(regexOrArray, path = location.pathname) {
      if (!regexOrArray) return false;
      if (regexOrArray instanceof RegExp) return regexOrArray.test(path);
      if (Array.isArray(regexOrArray)) return regexOrArray.some((rx) => rx.test(path));
      return false;
    }
    let __tmDebug = false;
    function setDebug(v) {
      __tmDebug = !!v;
    }
    function makeLogger(ns) {
      const label = ns || "TM";
      const emit = (m, badge, ...a) => (console[m] || console.log).call(console, `${label} ${badge}`, ...a);
      return {
        log: (...a) => emit("log", "\u25B6\uFE0F", ...a),
        info: (...a) => emit("info", "\u2139\uFE0F", ...a),
        warn: (...a) => emit("warn", "\u26A0\uFE0F", ...a),
        error: (...a) => emit("error", "\u2716\uFE0F", ...a),
        ok: (...a) => emit("log", "\u2705", ...a)
      };
    }
    function log(...a) {
      console.log("TM \u25B6\uFE0F", ...a);
    }
    function warn(...a) {
      console.warn("TM \u26A0\uFE0F", ...a);
    }
    function error(...a) {
      console.error("TM \u2716\uFE0F", ...a);
    }
    function ok(...a) {
      console.log("TM \u2705", ...a);
    }
    function deriveNsFromScriptName() {
      try {
        const name = typeof GM_info !== "undefined" && GM_info?.script?.name || "";
        if (!name) return "TM";
        return name.split(/[ \t–—\-→➜>]/)[0].trim() || "TM";
      } catch {
        return "TM";
      }
    }
    function getLogger(ns) {
      const label = ns || deriveNsFromScriptName();
      return TMUtils.makeLogger ? TMUtils.makeLogger(label) : {
        log: (...a) => console.log(`${label} \u25B6\uFE0F`, ...a),
        info: (...a) => console.info(`${label} \u2139\uFE0F`, ...a),
        warn: (...a) => console.warn(`${label} \u26A0\uFE0F`, ...a),
        error: (...a) => console.error(`${label} \u2716\uFE0F`, ...a),
        ok: (...a) => console.log(`${label} \u2705`, ...a)
      };
    }
    function attachLoggerGlobal(ns) {
      const logger = getLogger(ns);
      window2.L = logger;
      if (typeof unsafeWindow !== "undefined") unsafeWindow.L = logger;
      return logger;
    }
    TMUtils.watchByLabel = function watchByLabel({
      labelText,
      onChange: onValue,
      initial = true,
      fireOn = "change",
      // 'change' | 'blur'
      settleMs = 250,
      koPrefer = "root",
      bagKeys = ["value", "displayValue", "boundDisplayValue", "textInput"],
      widgetSelector = '.k-combobox,.k-dropdown,.k-dropdownlist,.k-autocomplete,[role="combobox"]',
      timeoutMs = 3e4,
      logger = null
    } = {}) {
      const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window2.ko;
      const isObs = (x) => KO?.isObservable?.(x) || typeof x === "function" && typeof x.subscribe === "function";
      const un = (x) => KO?.unwrap ? KO.unwrap(x) : typeof x === "function" ? x() : x;
      const log2 = (...a) => logger?.log?.(...a);
      const norm = (s) => String(s || "").toLowerCase().replace(/\u00a0/g, " ").replace(/[*:]/g, "").replace(/\s+/g, " ").trim();
      const want = labelText instanceof RegExp ? labelText : norm(labelText);
      const findLabel = () => {
        const labels = [...document.querySelectorAll("label[for]")];
        for (const l of labels) {
          const txt = norm(l.textContent || l.getAttribute("data-original-text") || "");
          if (labelText instanceof RegExp ? labelText.test(txt) : txt === want || txt.startsWith(want)) return l;
        }
        return null;
      };
      function hookNow() {
        const label = findLabel();
        if (!label) return null;
        const forId = label.getAttribute("for");
        const el = forId && document.getElementById(forId);
        if (!el) return null;
        let bound = null;
        if (KO?.contextFor) {
          try {
            const ctx = KO.contextFor(el);
            const bag = (koPrefer === "data" ? ctx?.$data?.elements?.[forId] : ctx?.$root?.elements?.[forId]) || (koPrefer === "data" ? ctx?.$root?.elements?.[forId] : ctx?.$data?.elements?.[forId]);
            if (bag) bound = bagKeys.map((k) => bag[k]).find(Boolean) ?? null;
            if (!bound) {
              const dbRaw = el.getAttribute("data-bind") || "";
              const m = /(?:value|textInput)\s*:\s*([^,}]+)/.exec(dbRaw);
              if (m) {
                const expr = m[1].trim();
                const evalIn = (obj) => {
                  try {
                    return Function("with(this){return (" + expr + ")}").call(obj);
                  } catch {
                    return void 0;
                  }
                };
                bound = evalIn(ctx?.$data);
                if (bound === void 0) bound = evalIn(ctx?.$root);
              }
            }
          } catch {
          }
        }
        const kendoWrap = el.closest(widgetSelector);
        const target = kendoWrap?.querySelector("input") || el;
        const read = () => {
          const v = bound !== null ? un(bound) : (el.value ?? "").toString();
          return (Array.isArray(v) ? v[0] : v)?.toString().trim() || "";
        };
        const fire = () => {
          const v = read();
          if (v && typeof onValue === "function") onValue(v);
        };
        const queueFire = __tmCreateQuietDispatcher(fire, settleMs);
        const unsubs = [];
        if (initial && fireOn !== "blur") queueFire();
        if (isObs(bound)) {
          const sub = bound.subscribe(() => queueFire());
          unsubs.push(() => sub.dispose?.());
          log2?.("watchByLabel: KO subscription attached for", labelText);
        }
        if (fireOn === "blur") {
          const onFocusOut = () => queueFire();
          const onChange = () => queueFire();
          const onKeyDown = (e) => {
            if (e.key === "Tab" || e.key === "Enter") setTimeout(queueFire, 0);
          };
          target.addEventListener("focusout", onFocusOut, true);
          target.addEventListener("change", onChange);
          target.addEventListener("keydown", onKeyDown);
          if (kendoWrap && kendoWrap !== target) {
            kendoWrap.addEventListener("focusout", onFocusOut, true);
            kendoWrap.addEventListener("change", onChange, true);
          }
          const mo2 = new MutationObserver(() => queueFire());
          mo2.observe(target, { childList: true, characterData: true, subtree: true });
          unsubs.push(() => {
            target.removeEventListener("focusout", onFocusOut, true);
            target.removeEventListener("change", onChange);
            target.removeEventListener("keydown", onKeyDown);
            if (kendoWrap && kendoWrap !== target) {
              kendoWrap.removeEventListener("focusout", onFocusOut, true);
              kendoWrap.removeEventListener("change", onChange, true);
            }
            mo2.disconnect();
          });
        } else {
          const onChange = () => queueFire();
          target.addEventListener("change", onChange);
          unsubs.push(() => target.removeEventListener("change", onChange));
        }
        log2?.("watchByLabel: listeners attached for", labelText, target);
        return () => {
          unsubs.forEach((fn) => {
            try {
              fn();
            } catch {
            }
          });
        };
      }
      let unsub = hookNow();
      if (typeof unsub === "function") return unsub;
      const mo = new MutationObserver(() => {
        unsub = hookNow();
        if (typeof unsub === "function") mo.disconnect();
      });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), timeoutMs);
      return () => {
        try {
          typeof unsub === "function" && unsub();
        } catch {
        }
        try {
          mo.disconnect();
        } catch {
        }
      };
    };
    TMUtils.awaitValueByLabel = function awaitValueByLabel({ labelText, timeoutMs = 3e4, logger = null } = {}) {
      return new Promise((resolve, reject) => {
        let stop = null;
        let done = false;
        const timer = setTimeout(() => {
          if (!done) {
            done = true;
            stop?.();
            reject(new Error("Timeout"));
          }
        }, timeoutMs);
        stop = TMUtils.watchByLabel({
          labelText,
          initial: true,
          logger,
          onChange: (v) => {
            if (done || !v) return;
            done = true;
            clearTimeout(timer);
            stop?.();
            resolve(v);
          }
        });
      });
    };
    TMUtils.watchBySelector = function watchBySelector({
      selector,
      onChange: onValue,
      initial = true,
      fireOn = "change",
      // 'change' | 'blur'
      settleMs = 250,
      // wait for KO/Kendo/DOM to settle
      koPrefer = "root",
      bagKeys = ["value", "displayValue", "boundDisplayValue", "textInput"],
      widgetSelector = '.k-combobox,.k-dropdown,.k-dropdownlist,.k-autocomplete,[role="combobox"]',
      timeoutMs = 3e4,
      logger = null
    } = {}) {
      const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window2.ko;
      const isObs = (x) => KO?.isObservable?.(x) || typeof x === "function" && typeof x.subscribe === "function";
      const un = (x) => KO?.unwrap ? KO.unwrap(x) : typeof x === "function" ? x() : x;
      const log2 = (...a) => logger?.log?.(...a);
      function hookNow() {
        const el = document.querySelector(selector);
        if (!el) return null;
        let ctx = null, bag = null, obs = null;
        try {
          ctx = KO?.contextFor ? KO.contextFor(el) : null;
          const id = el.id;
          const fromRoot = id && ctx?.$root?.elements?.[id];
          const fromData = id && ctx?.$data?.elements?.[id];
          bag = (koPrefer === "data" ? fromData : fromRoot) || (koPrefer === "data" ? fromRoot : fromData) || null;
          if (bag) {
            const cand = bagKeys.map((k) => bag[k]).find(Boolean);
            if (isObs(cand)) obs = cand;
          }
          if (!obs && KO?.contextFor) {
            const dbRaw = el.getAttribute("data-bind") || "";
            const m = /(?:value|textInput)\s*:\s*([^,}]+)/.exec(dbRaw);
            if (m) {
              const expr = m[1].trim();
              const evalIn = (obj) => {
                try {
                  return Function("with(this){return (" + expr + ")}").call(obj);
                } catch {
                  return void 0;
                }
              };
              const probe = evalIn(ctx?.[koPrefer === "data" ? "$data" : "$root"]);
              if (isObs(probe)) obs = probe;
            }
          }
        } catch {
        }
        const kendoWrap = el.closest(widgetSelector);
        const target = kendoWrap?.querySelector("input") || el;
        const read = () => {
          let v;
          if (obs) v = un(obs);
          else if (bag) {
            const bagVal = bagKeys.map((k) => bag[k]).find(Boolean);
            v = typeof bagVal === "function" ? bagVal() : bagVal;
          }
          if (v == null || v === "") v = el.value ?? el.textContent ?? "";
          const s = Array.isArray(v) ? v[0] : v;
          return (s ?? "").toString().trim();
        };
        const fire = () => {
          const val = read();
          if (val !== "" && typeof onValue === "function") onValue(val);
        };
        const queueFire = __tmCreateQuietDispatcher(fire, settleMs);
        const unsubs = [];
        if (initial && fireOn !== "blur") queueFire();
        if (obs && typeof obs.subscribe === "function") {
          const sub = obs.subscribe(() => queueFire());
          unsubs.push(() => sub.dispose?.());
          log2?.("watchBySelector: KO observable subscription attached for", selector);
        }
        if (bag) {
          const bagUnhooks = [];
          const wrap = (obj, name) => {
            if (!obj || typeof obj[name] !== "function") return;
            const orig = obj[name];
            obj[name] = function wrapped(...args) {
              try {
                queueFire();
              } catch {
              }
              return orig.apply(this, args);
            };
            bagUnhooks.push(() => {
              obj[name] = orig;
            });
          };
          ["onchange", "onblur", "onkeyup", "onkeydown"].forEach((n) => wrap(bag, n));
          unsubs.push(() => bagUnhooks.forEach((fn) => {
            try {
              fn();
            } catch {
            }
          }));
          log2?.("watchBySelector: bag event wrappers attached for", selector);
        }
        if (fireOn === "blur") {
          const onFocusOut = () => queueFire();
          const onChange = () => queueFire();
          const onKeyDown = (e) => {
            if (e.key === "Tab" || e.key === "Enter") setTimeout(queueFire, 0);
          };
          target.addEventListener("focusout", onFocusOut, true);
          target.addEventListener("change", onChange);
          target.addEventListener("keydown", onKeyDown);
          if (kendoWrap && kendoWrap !== target) {
            kendoWrap.addEventListener("focusout", onFocusOut, true);
            kendoWrap.addEventListener("change", onChange, true);
          }
          const mo2 = new MutationObserver(() => queueFire());
          mo2.observe(target, { childList: true, characterData: true, subtree: true });
          unsubs.push(() => {
            target.removeEventListener("focusout", onFocusOut, true);
            target.removeEventListener("change", onChange);
            target.removeEventListener("keydown", onKeyDown);
            if (kendoWrap && kendoWrap !== target) {
              kendoWrap.removeEventListener("focusout", onFocusOut, true);
              kendoWrap.removeEventListener("change", onChange, true);
            }
            mo2.disconnect();
          });
        } else {
          const onChange = () => queueFire();
          target.addEventListener("change", onChange);
          unsubs.push(() => target.removeEventListener("change", onChange));
        }
        log2?.("watchBySelector: listeners attached for", selector, target);
        return () => {
          unsubs.forEach((fn) => {
            try {
              fn();
            } catch {
            }
          });
        };
      }
      let unsub = hookNow();
      if (typeof unsub === "function") return unsub;
      const mo = new MutationObserver(() => {
        unsub = hookNow();
        if (typeof unsub === "function") mo.disconnect();
      });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), timeoutMs);
      return () => {
        try {
          typeof unsub === "function" && unsub();
        } catch {
        }
        try {
          mo.disconnect();
        } catch {
        }
      };
    };
    (function installTmUrlObserver() {
      if (window2.__tmUrlObsInstalled) return;
      window2.__tmUrlObsInstalled = true;
      const EV = "tmutils:urlchange";
      const fire = () => window2.dispatchEvent(new CustomEvent(EV));
      const origPush = history.pushState;
      history.pushState = function() {
        const r = origPush.apply(this, arguments);
        fire();
        return r;
      };
      const origReplace = history.replaceState;
      history.replaceState = function() {
        const r = origReplace.apply(this, arguments);
        fire();
        return r;
      };
      window2.addEventListener("popstate", fire);
      TMUtils.onUrlChange = function onUrlChange(cb) {
        const h = () => cb(location);
        window2.addEventListener(EV, h);
        return () => window2.removeEventListener(EV, h);
      };
      TMUtils._dispatchUrlChange = fire;
    })();
    TMUtils.observeInsertMany = function observeInsertMany(selector, callback, { root = document.body, subtree = true } = {}) {
      const seen = /* @__PURE__ */ new WeakSet();
      function runOn(ctx) {
        if (ctx && ctx.nodeType === 1) {
          if (typeof ctx.matches === "function" && ctx.matches(selector) && !seen.has(ctx)) {
            seen.add(ctx);
            try {
              callback(ctx);
            } catch (e) {
              console.error("observeInsertMany callback error:", e);
            }
          }
          if (typeof ctx.querySelectorAll === "function") {
            ctx.querySelectorAll(selector).forEach((el) => {
              if (!seen.has(el)) {
                seen.add(el);
                try {
                  callback(el);
                } catch (e) {
                  console.error("observeInsertMany callback error:", e);
                }
              }
            });
          }
        }
      }
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.addedNodes && m.addedNodes.length) {
            m.addedNodes.forEach(runOn);
          }
        }
      });
      mo.observe(root, { childList: true, subtree });
      runOn(root);
      return () => mo.disconnect();
    };
    TMUtils.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    (function addNetWatcher() {
      const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window2;
      const TMU = window2.TMUtils;
      TMU.net = TMU.net || {};
      TMU.net.ensureWatcher = function ensureWatcher() {
        if (root.__ltNetPatched) return;
        root.__ltNetPatched = true;
        const origFetch = root.fetch && root.fetch.bind(root);
        if (origFetch) {
          root.fetch = function(input, init) {
            try {
              const req = input instanceof Request ? input : new Request(input, init || {});
              const url = String(req.url || "");
              const method = (req.method || init && init.method || "GET").toUpperCase();
              if (isTarget(url, method)) {
                req.clone().arrayBuffer().then((buf) => {
                  const ct = req.headers.get("content-type") || "";
                  const body = parseBodyFromBuffer(buf, ct);
                  TMU.net._handleAddUpdate(url, body);
                }).catch(() => {
                });
              }
            } catch {
            }
            return origFetch(input, init);
          };
        }
        const XHR = root.XMLHttpRequest;
        if (XHR && XHR.prototype) {
          const open = XHR.prototype.open;
          const send = XHR.prototype.send;
          const setRequestHeader = XHR.prototype.setRequestHeader;
          XHR.prototype.open = function(method, url) {
            this.__ltMethod = String(method || "GET").toUpperCase();
            this.__ltUrl = String(url || "");
            this.__ltHeaders = {};
            return open.apply(this, arguments);
          };
          XHR.prototype.setRequestHeader = function(k, v) {
            try {
              this.__ltHeaders[k.toLowerCase()] = v;
            } catch {
            }
            return setRequestHeader.apply(this, arguments);
          };
          XHR.prototype.send = function(body) {
            try {
              const url = this.__ltUrl || "";
              const method = this.__ltMethod || "GET";
              if (isTarget(url, method)) {
                const ct = this.__ltHeaders["content-type"] || "";
                let obj = {};
                if (typeof body === "string") obj = parseBodyFromString(body, ct);
                else if (body instanceof URLSearchParams) obj = Object.fromEntries(body.entries());
                else if (root.FormData && body instanceof FormData) obj = Object.fromEntries(body.entries());
                TMU.net._handleAddUpdate(url, obj);
              }
            } catch {
            }
            return send.apply(this, arguments);
          };
        }
      };
      TMU.net.onAddUpdate = function onAddUpdate(fn) {
        if (typeof fn !== "function") return () => {
        };
        const h = (e) => fn(e.detail || {});
        root.addEventListener("LT:QuotePartAddUpdateForm", h);
        return () => root.removeEventListener("LT:QuotePartAddUpdateForm", h);
      };
      TMU.net.getLastAddUpdate = function() {
        if (TMU.state?.lastAddUpdateForm) return TMU.state.lastAddUpdateForm;
        try {
          const s = sessionStorage.getItem("LT_LAST_ADDUPDATEFORM");
          return s ? JSON.parse(s) : null;
        } catch {
          return null;
        }
      };
      function isTarget(url, method) {
        return method === "POST" && /\/SalesAndCRM\/QuotePart\/AddUpdateForm/i.test(url) && /(?:\?|&)sourceActionKey=10032(?:&|$)/i.test(url);
      }
      function parseBodyFromBuffer(buf, contentType) {
        try {
          const text = new TextDecoder().decode(buf || new Uint8Array());
          return parseBodyFromString(text, contentType);
        } catch {
          return {};
        }
      }
      function parseBodyFromString(text, contentType) {
        if (!text) return {};
        const ct = (contentType || "").toLowerCase();
        if (ct.includes("application/json") || /^[\s{\[]/.test(text)) {
          try {
            return JSON.parse(text);
          } catch {
          }
        }
        if (ct.includes("application/x-www-form-urlencoded") || text.includes("=")) {
          try {
            return Object.fromEntries(new URLSearchParams(text).entries());
          } catch {
          }
        }
        return {};
      }
      TMU.net._handleAddUpdate = function(url, payload) {
        const quoteKey = Number(payload?.QuoteKey) || Number((/[?&]QuoteKey=(\d+)/i.exec(url) || [])[1]) || void 0;
        const hasPartNo = !!(payload?.PartNo || payload?.PartKey || payload?.PartName) || Array.isArray(payload?.__revisionTrackingData) && payload.__revisionTrackingData.some(
          (x) => Array.isArray(x.revisionTrackingEntries) && x.revisionTrackingEntries.some((e) => /Part No/i.test(e?.Field || ""))
        );
        const detail = {
          url,
          quoteKey,
          hasPartNo,
          partNo: payload?.PartNo ?? null,
          customerPartNo: payload?.CustomerPartNo ?? null,
          partKey: payload?.PartKey ?? null,
          at: Date.now()
        };
        TMU.state = TMU.state || {};
        TMU.state.lastAddUpdateForm = detail;
        try {
          sessionStorage.setItem("LT_LAST_ADDUPDATEFORM", JSON.stringify(detail));
        } catch {
        }
        try {
          root.dispatchEvent(new CustomEvent("LT:QuotePartAddUpdateForm", { detail }));
        } catch {
        }
      };
    })();
    Object.assign(TMUtils, {
      getApiKey,
      fetchData: TMUtils.fetchData,
      waitForModelAsync,
      watchByLabel: TMUtils.watchByLabel,
      awaitValueByLabel: TMUtils.awaitValueByLabel,
      watchBySelector: TMUtils.watchBySelector,
      observeInsertMany: TMUtils.observeInsertMany,
      showMessage,
      hideMessage,
      observeInsert,
      selectOptionByText,
      selectOptionByValue,
      toast,
      log,
      warn,
      error,
      ok,
      ensureRoute,
      onRouteChange,
      matchRoute,
      setDebug,
      makeLogger,
      getLogger,
      attachLoggerGlobal,
      ds: TMUtils.ds,
      dsRows: TMUtils.dsRows,
      net: TMUtils.net
    });
  })(window);
})();
;(function(g){try{if(typeof TMUtils!=='undefined'){g.TMUtils=TMUtils;}}catch(e){}})(typeof unsafeWindow!=='undefined'?unsafeWindow:window);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LXBsZXgtdG0tdXRpbHMudXNlci5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gPT1Vc2VyU2NyaXB0PT1cbi8vIEBuYW1lICAgICAgICAgTFQgXHUyMDNBIFBsZXggVE0gVXRpbHNcbi8vIEBuYW1lc3BhY2UgICAgaHR0cHM6Ly9naXRodWIuY29tL0FscGhhR2VlazUwOS9wbGV4LXRhbXBlcm1vbmtleS1zY3JpcHRzXG4vLyBAdmVyc2lvbiAgICAgIDQuMi4yXG4vLyBAZGVzY3JpcHRpb24gIFNoYXJlZCB1dGlsaXRpZXNcbi8vIEBtYXRjaCAgICAgICAgaHR0cHM6Ly8qLm9uLnBsZXguY29tLypcbi8vIEBtYXRjaCAgICAgICAgaHR0cHM6Ly8qLnBsZXguY29tLypcbi8vIEBncmFudCAgICAgICAgR01feG1saHR0cFJlcXVlc3Rcbi8vIEBncmFudCAgICAgICAgdW5zYWZlV2luZG93XG4vLyBAZ3JhbnQgICAgICAgIEdNX2dldFZhbHVlXG4vLyBAZ3JhbnQgICAgICAgIEdNX3NldFZhbHVlXG4vLyBAY29ubmVjdCAgICAgICoucGxleC5jb21cbi8vID09L1VzZXJTY3JpcHQ9PVxuXG4oZnVuY3Rpb24gKHdpbmRvdykge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIEVOViAvIEZMQUdTXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gQ3JlYXRlICsgZXhwb3NlIGZpcnN0IHNvIHdlIGNhbiBzYWZlbHkgYXR0YWNoIHByb3BzIGJlbG93XG4gICAgY29uc3QgVE1VdGlscyA9IHt9O1xuICAgIHdpbmRvdy5UTVV0aWxzID0gVE1VdGlscztcbiAgICBpZiAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHVuc2FmZVdpbmRvdy5UTVV0aWxzID0gVE1VdGlscztcblxuICAgIC8vIGVuc3VyZSBhIHBsYWNlIHRvIGNhY2hlIHRoZSBrZXkgbGl2ZXMgb24gdGhlIHNoYXJlZCBvYmplY3RcbiAgICBpZiAoISgnX19hcGlLZXlDYWNoZScgaW4gVE1VdGlscykpIFRNVXRpbHMuX19hcGlLZXlDYWNoZSA9IG51bGw7XG5cbiAgICAvLyBOb3JtYWxpemUgbGlrZSB0aGUgYXV0aCBoZWxwZXIgKGFjY2VwdHMgXCJ1c2VyOnBhc3NcIiwgXCJCYXNpYyBcdTIwMjZcIiwgXCJCZWFyZXIgXHUyMDI2XCIpXG4gICAgZnVuY3Rpb24gX25vcm1hbGl6ZUF1dGgocmF3KSB7XG4gICAgICAgIGlmICghcmF3KSByZXR1cm4gJyc7XG4gICAgICAgIGlmICgvXihCYXNpY3xCZWFyZXIpXFxzL2kudGVzdChyYXcpKSByZXR1cm4gcmF3LnRyaW0oKTtcbiAgICAgICAgLy8gQWNjZXB0IFwidXNlcjpwYXNzXCIgYW5kIGVuY29kZSBhcyBCYXNpY1xuICAgICAgICB0cnkgeyByZXR1cm4gYEJhc2ljICR7YnRvYShyYXcudHJpbSgpKX1gOyB9IGNhdGNoIHsgcmV0dXJuICcnOyB9XG4gICAgfVxuXG4gICAgLy8gUmVzb2x2ZSBBUEkga2V5IGFjcm9zcyByb3V0ZXM6IHByZWZlciBQbGV4QXV0aC9QbGV4QVBJLCBmYWxsYmFjayB0byBHTS9sb2NhbFN0b3JhZ2UuXG4gICAgLy8gTWlycm9ycyB0aGUgcmVzb2x2ZWQga2V5IHRvIGxvY2FsU3RvcmFnZSArIEdNIHNvIGZ1dHVyZSBsb2FkcyBvbiB0aGlzIHN1YmRvbWFpbiBkb25cdTIwMTl0IG5lZWQgdG8gd2FpdC5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRBcGlLZXkoe1xuICAgICAgICB3YWl0ID0gZmFsc2UsICAgICAgIC8vIHNldCB0cnVlIG9uIHJvdXRlcyB0aGF0IGxvYWQgUGxleEF1dGggbGF0ZVxuICAgICAgICB0aW1lb3V0TXMgPSAwLFxuICAgICAgICBwb2xsTXMgPSAyMDAsXG4gICAgICAgIHVzZUNhY2hlID0gdHJ1ZSxcbiAgICAgICAgY2FjaGVNcyA9IDUgKiA2MF8wMDBcbiAgICB9ID0ge30pIHtcbiAgICAgICAgLy8gY2FjaGUgZmFzdC1wYXRoIChsaXZlcyBvbiBUTVV0aWxzIHRvIGF2b2lkIHNjb3BlIGlzc3VlcylcbiAgICAgICAgY29uc3QgY2FjaGVkID0gVE1VdGlscy5fX2FwaUtleUNhY2hlO1xuICAgICAgICBpZiAodXNlQ2FjaGUgJiYgY2FjaGVkICYmIChEYXRlLm5vdygpIC0gY2FjaGVkLnRzKSA8IGNhY2hlTXMpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWQudmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByb290ID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcblxuICAgICAgICBjb25zdCByZXNvbHZlR2V0dGVyID0gKCkgPT5cbiAgICAgICAgICAgIChyb290Py5QbGV4QXV0aCAmJiB0eXBlb2Ygcm9vdC5QbGV4QXV0aC5nZXRLZXkgPT09ICdmdW5jdGlvbicgJiYgcm9vdC5QbGV4QXV0aC5nZXRLZXkpIHx8XG4gICAgICAgICAgICAocm9vdD8uUGxleEFQSSAmJiB0eXBlb2Ygcm9vdC5QbGV4QVBJLmdldEtleSA9PT0gJ2Z1bmN0aW9uJyAmJiByb290LlBsZXhBUEkuZ2V0S2V5KSB8fFxuICAgICAgICAgICAgbnVsbDtcblxuICAgICAgICBsZXQgZ2V0dGVyID0gcmVzb2x2ZUdldHRlcigpO1xuXG4gICAgICAgIGlmICghZ2V0dGVyICYmIHdhaXQgJiYgdGltZW91dE1zID4gMCkge1xuICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgd2hpbGUgKCFnZXR0ZXIgJiYgKERhdGUubm93KCkgLSBzdGFydCkgPCB0aW1lb3V0TXMpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgcG9sbE1zKSk7XG4gICAgICAgICAgICAgICAgZ2V0dGVyID0gcmVzb2x2ZUdldHRlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gMSkgUHJlZmVycmVkOiBoZWxwZXIgb2JqZWN0IGlmIGF2YWlsYWJsZVxuICAgICAgICBpZiAoZ2V0dGVyKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbCA9IGdldHRlci5jYWxsKHJvb3QpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9ICh2YWwgJiYgdHlwZW9mIHZhbC50aGVuID09PSAnZnVuY3Rpb24nKSA/IGF3YWl0IHZhbCA6IHZhbDtcbiAgICAgICAgICAgICAgICBjb25zdCBvdXQgPSBfbm9ybWFsaXplQXV0aChrZXkpO1xuICAgICAgICAgICAgICAgIGlmIChvdXQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTWlycm9yIHNvIHN1YnNlcXVlbnQgbG9hZHMgb24gdGhpcyBzdWJkb21haW4gZG9uXHUyMDE5dCBkZXBlbmQgb24gdGhlIGhlbHBlciBiZWluZyBwcmVzZW50XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdQbGV4QXBpS2V5Jywgb3V0KTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgaWYgKHR5cGVvZiBHTV9zZXRWYWx1ZSA9PT0gJ2Z1bmN0aW9uJykgR01fc2V0VmFsdWUoJ1BsZXhBcGlLZXknLCBvdXQpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgICAgICBpZiAodXNlQ2FjaGUpIFRNVXRpbHMuX19hcGlLZXlDYWNoZSA9IHsgdmFsdWU6IG91dCwgdHM6IERhdGUubm93KCkgfTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogZmFsbCB0aHJvdWdoICovIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIDIpIEZhbGxiYWNrOiBHTSBzdG9yZSAoYXV0aG9yaXRhdGl2ZSBpZiBzZXQgdmlhIG1lbnUpXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByYXdHTSA9IHR5cGVvZiBHTV9nZXRWYWx1ZSA9PT0gJ2Z1bmN0aW9uJyA/IEdNX2dldFZhbHVlKCdQbGV4QXBpS2V5JywgJycpIDogJyc7XG4gICAgICAgICAgICBpZiAocmF3R00pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvdXQgPSBfbm9ybWFsaXplQXV0aChyYXdHTSk7XG4gICAgICAgICAgICAgICAgaWYgKHVzZUNhY2hlKSBUTVV0aWxzLl9fYXBpS2V5Q2FjaGUgPSB7IHZhbHVlOiBvdXQsIHRzOiBEYXRlLm5vdygpIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cblxuICAgICAgICAvLyAzKSBGYWxsYmFjazogbG9jYWxTdG9yYWdlIG9uIHRoaXMgc3ViZG9tYWluXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByYXdMUyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdQbGV4QXBpS2V5JykgfHwgJyc7XG4gICAgICAgICAgICBpZiAocmF3TFMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvdXQgPSBfbm9ybWFsaXplQXV0aChyYXdMUyk7XG4gICAgICAgICAgICAgICAgaWYgKHVzZUNhY2hlKSBUTVV0aWxzLl9fYXBpS2V5Q2FjaGUgPSB7IHZhbHVlOiBvdXQsIHRzOiBEYXRlLm5vdygpIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cblxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG5cbiAgICAvLyBMb3ctbGV2ZWw6IG9uZSBwbGFjZSB0aGF0IGFjdHVhbGx5IGV4ZWN1dGVzIHRoZSBIVFRQIGNhbGxcbiAgICBUTVV0aWxzLmZldGNoRGF0YSA9IGFzeW5jIGZ1bmN0aW9uIGZldGNoRGF0YSh1cmwsIHsgbWV0aG9kID0gJ0dFVCcsIGhlYWRlcnMgPSB7fSwgYm9keSwgdGltZW91dE1zID0gMTUwMDAsIHVzZVhIUiA9IGZhbHNlIH0gPSB7fSkge1xuICAgICAgICBjb25zdCBhdXRoID0gX25vcm1hbGl6ZUF1dGgoYXdhaXQgVE1VdGlscy5nZXRBcGlLZXkoKS5jYXRjaCgoKSA9PiAnJykpO1xuXG4gICAgICAgIGNvbnN0IGZpbmFsSGVhZGVycyA9IHtcbiAgICAgICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICAuLi4oYm9keSA/IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uO2NoYXJzZXQ9VVRGLTgnIH0gOiB7fSksXG4gICAgICAgICAgICAuLi4oYXV0aCA/IHsgJ0F1dGhvcml6YXRpb24nOiBhdXRoIH0gOiB7fSksXG4gICAgICAgICAgICAuLi5oZWFkZXJzXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSB0eXBlb2YgYm9keSA9PT0gJ3N0cmluZycgPyBib2R5IDogKGJvZHkgPyBKU09OLnN0cmluZ2lmeShib2R5KSA6IHVuZGVmaW5lZCk7XG5cbiAgICAgICAgaWYgKHVzZVhIUiAmJiB0eXBlb2YgR01feG1saHR0cFJlcXVlc3QgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHJlamVjdChuZXcgRXJyb3IoJ05ldHdvcmsgdGltZW91dCcpKSwgdGltZW91dE1zKTtcbiAgICAgICAgICAgICAgICBHTV94bWxodHRwUmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgICAgIG1ldGhvZCwgdXJsLCBoZWFkZXJzOiBmaW5hbEhlYWRlcnMsIGRhdGE6IHBheWxvYWQsIHRpbWVvdXQ6IHRpbWVvdXRNcyxcbiAgICAgICAgICAgICAgICAgICAgb25sb2FkOiAocmVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgb2sgPSByZXMuc3RhdHVzID49IDIwMCAmJiByZXMuc3RhdHVzIDwgMzAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFvaykgcmV0dXJuIHJlamVjdChuZXcgRXJyb3IoYCR7cmVzLnN0YXR1c30gJHtyZXMuc3RhdHVzVGV4dCB8fCAnUmVxdWVzdCBmYWlsZWQnfWApKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7IHJlc29sdmUoSlNPTi5wYXJzZShyZXMucmVzcG9uc2VUZXh0IHx8ICd7fScpKTsgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2F0Y2ggeyByZXNvbHZlKHt9KTsgfSAvLyB0b2xlcmF0ZSBlbXB0eS9pbnZhbGlkIGpzb24gPT4ge31cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgb25lcnJvcjogKCkgPT4geyBjbGVhclRpbWVvdXQodGltZXIpOyByZWplY3QobmV3IEVycm9yKCdOZXR3b3JrIGVycm9yJykpOyB9LFxuICAgICAgICAgICAgICAgICAgICBvbnRpbWVvdXQ6ICgpID0+IHsgY2xlYXJUaW1lb3V0KHRpbWVyKTsgcmVqZWN0KG5ldyBFcnJvcignTmV0d29yayB0aW1lb3V0JykpOyB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGZldGNoIHBhdGhcbiAgICAgICAgY29uc3QgY3RybCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICAgICAgY29uc3QgdCA9IHNldFRpbWVvdXQoKCkgPT4gY3RybC5hYm9ydCgpLCB0aW1lb3V0TXMpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzcCA9IGF3YWl0IGZldGNoKHVybCwge1xuICAgICAgICAgICAgICAgIG1ldGhvZCxcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiBmaW5hbEhlYWRlcnMsXG4gICAgICAgICAgICAgICAgYm9keTogcGF5bG9hZCxcbiAgICAgICAgICAgICAgICBzaWduYWw6IGN0cmwuc2lnbmFsLFxuICAgICAgICAgICAgICAgIGNyZWRlbnRpYWxzOiAnaW5jbHVkZScgICAvLyBrZWVwIHNhbWUtb3JpZ2luIGNvb2tpZXMgd2hlcmUgbmVlZGVkXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKCFyZXNwLm9rKSB0aHJvdyBuZXcgRXJyb3IoYCR7cmVzcC5zdGF0dXN9ICR7cmVzcC5zdGF0dXNUZXh0fWApO1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGF3YWl0IHJlc3AudGV4dCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRleHQgPyBKU09OLnBhcnNlKHRleHQpIDoge307XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gRFMgaGVscGVyczogdGhlIG9ubHkgQVBJIHlvdXIgdXNlcnNjcmlwdHMgbmVlZCB0byBjYWxsXG4gICAgVE1VdGlscy5kcyA9IGFzeW5jIGZ1bmN0aW9uIGRzKHNvdXJjZUlkLCBwYXlsb2FkLCBvcHRzID0ge30pIHtcbiAgICAgICAgY29uc3QgdXJsID0gYCR7bG9jYXRpb24ub3JpZ2lufS9hcGkvZGF0YXNvdXJjZXMvJHtzb3VyY2VJZH0vZXhlY3V0ZT9mb3JtYXQ9MmA7XG4gICAgICAgIGNvbnN0IGpzb24gPSBhd2FpdCBUTVV0aWxzLmZldGNoRGF0YSh1cmwsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHBheWxvYWQsIC4uLm9wdHMgfSk7XG4gICAgICAgIC8vIG5vcm1hbGl6ZTogYWx3YXlzIHJldHVybiB7IHJvd3M6IFsuLi5dIH1cbiAgICAgICAgY29uc3Qgcm93cyA9IEFycmF5LmlzQXJyYXkoanNvbj8ucm93cykgPyBqc29uLnJvd3MgOiBbXTtcbiAgICAgICAgcmV0dXJuIHsgLi4uanNvbiwgcm93cyB9OyAvLyBrZWVwIGFueSBleHRyYSBmaWVsZHMgaWYgUGxleCBhZGRzIHRoZW1cbiAgICB9O1xuXG4gICAgVE1VdGlscy5kc1Jvd3MgPSBhc3luYyBmdW5jdGlvbiBkc1Jvd3Moc291cmNlSWQsIHBheWxvYWQsIG9wdHMgPSB7fSkge1xuICAgICAgICBjb25zdCB7IHJvd3MgfSA9IGF3YWl0IFRNVXRpbHMuZHMoc291cmNlSWQsIHBheWxvYWQsIG9wdHMpO1xuICAgICAgICByZXR1cm4gcm93cztcbiAgICB9O1xuXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBLTyB1bndyYXAgaGVscGVycyAoZXhwb3J0ZWQpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gVE1VdGlscy51bndyYXAodik6IHJldHVybnMgdGhlIHBsYWluIHZhbHVlIG9mIGEgS08gb2JzZXJ2YWJsZS9jb21wdXRlZCwgZWxzZSB2XG4gICAgLy8gVE1VdGlscy51bndyYXBEZWVwKHgpOiByZWN1cnNpdmVseSB1bndyYXBzIGFycmF5cy9vYmplY3RzIG9mIEtPIHZhbHVlcyAoc2FmZSBmb3IgSlNPTilcbiAgICAvLyBUTVV0aWxzLmpzb25QbGFpbih4LCBzcGFjZT8pOiBKU09OLnN0cmluZ2lmeShUTVV0aWxzLnVud3JhcERlZXAoeCksIHNwYWNlKVxuICAgIChmdW5jdGlvbiBhZGRVbndyYXBIZWxwZXJzKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xuXG4gICAgICAgICAgICBpZiAoIVRNVXRpbHMudW53cmFwKSB7XG4gICAgICAgICAgICAgICAgVE1VdGlscy51bndyYXAgPSBmdW5jdGlvbiB1bndyYXAodikge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEtPICYmIHR5cGVvZiBLTy51bndyYXAgPT09ICdmdW5jdGlvbicpIHJldHVybiBLTy51bndyYXAodik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nKSA/IHYoKSA6IHY7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gdjsgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghVE1VdGlscy51bndyYXBEZWVwKSB7XG4gICAgICAgICAgICAgICAgVE1VdGlscy51bndyYXBEZWVwID0gZnVuY3Rpb24gdW53cmFwRGVlcCh4KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNlZW4gPSBuZXcgV2Vha01hcCgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzS08gPSAoZm4pID0+ICEhZm4gJiYgdHlwZW9mIGZuID09PSAnZnVuY3Rpb24nICYmIChcbiAgICAgICAgICAgICAgICAgICAgICAgIChLTyAmJiBLTy5pc09ic2VydmFibGUgJiYgS08uaXNPYnNlcnZhYmxlKGZuKSkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIChLTyAmJiBLTy5pc0NvbXB1dGVkICYmIEtPLmlzQ29tcHV0ZWQoZm4pKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgKHR5cGVvZiBmbi5zdWJzY3JpYmUgPT09ICdmdW5jdGlvbicpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBmbi5faXNPYnMgPT09IHRydWVcbiAgICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCB1biA9ICh2KSA9PiAoS08gJiYgdHlwZW9mIEtPLnVud3JhcCA9PT0gJ2Z1bmN0aW9uJylcbiAgICAgICAgICAgICAgICAgICAgICAgID8gS08udW53cmFwKHYpXG4gICAgICAgICAgICAgICAgICAgICAgICA6ICh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJyA/IChpc0tPKHYpID8gdigpIDogdikgOiB2KTtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCB3YWxrID0gKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiB2O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IHR5cGVvZiB2O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodCA9PT0gJ3N0cmluZycgfHwgdCA9PT0gJ251bWJlcicgfHwgdCA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gdjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHYpKSByZXR1cm4gdi5tYXAod2Fsayk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodCA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIHVuKHYpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNlZW4uaGFzKHYpKSByZXR1cm4gc2Vlbi5nZXQodik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgb3V0ID0gQXJyYXkuaXNBcnJheSh2KSA/IFtdIDoge307XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2Vlbi5zZXQodiwgb3V0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGsgaW4gdikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHYsIGspKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvdXRba10gPSB3YWxrKHZba10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdjtcbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gd2Fsayh4KTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIVRNVXRpbHMuanNvblBsYWluKSB7XG4gICAgICAgICAgICAgICAgVE1VdGlscy5qc29uUGxhaW4gPSBmdW5jdGlvbiBqc29uUGxhaW4oeCwgc3BhY2UgPSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IHJldHVybiBKU09OLnN0cmluZ2lmeShUTVV0aWxzLnVud3JhcERlZXAoeCksIG51bGwsIHNwYWNlKTsgfVxuICAgICAgICAgICAgICAgICAgICBjYXRjaCB7IHJldHVybiBKU09OLnN0cmluZ2lmeSh4LCBudWxsLCBzcGFjZSk7IH1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAvLyBuby1vcDogS08gbWF5IG5vdCBiZSBwcmVzZW50IHlldCBpbiBzb21lIGNvbnRleHRzXG4gICAgICAgIH1cbiAgICB9KSgpO1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gS08vUGxleCBvYnNlcnZhYmxlIHJlYWQgJiB3cml0ZSBoZWxwZXJzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgKGZ1bmN0aW9uIGFkZE9ic0FjY2Vzc29ycygpIHtcbiAgICAgICAgY29uc3Qgcm9vdCA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdyA6IHdpbmRvdyk7XG4gICAgICAgIGNvbnN0IEtPID0gcm9vdC5rbztcblxuICAgICAgICAvLyBSZXR1cm5zIHRoZSBnZXR0ZXIvc2V0dGVyIG9yIHBsYWluIHByb3AgZnJvbSBQbGV4IGhlbHBlciBpZiBhdmFpbGFibGVcbiAgICAgICAgZnVuY3Rpb24gX3BsZXhHZXR0ZXIodm0sIHByb3ApIHtcbiAgICAgICAgICAgIGNvbnN0IGcgPSByb290Py5wbGV4Py5kYXRhPy5nZXRPYnNlcnZhYmxlT3JWYWx1ZTtcbiAgICAgICAgICAgIHJldHVybiAodHlwZW9mIGcgPT09ICdmdW5jdGlvbicpID8gZyh2bSwgcHJvcCkgOiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVhZCBhIHByb3BlcnR5IGZyb20gYSBQbGV4IEtPIHZpZXctbW9kZWwgYW5kIGZ1bGx5IHVud3JhcCBpdC5cbiAgICAgICAgICogLSBTdXBwb3J0cyBkb3R0ZWQgcGF0aHMgXCJGb28uQmFyXCJcbiAgICAgICAgICogLSBJZiB0aGUgZmluYWwgdmFsdWUgaXMgYW4gYXJyYXkgYW5kIG9wdGlvbnMuZmlyc3QgPT09IHRydWUsIHJldHVybnMgZmlyc3QgaXRlbVxuICAgICAgICAgKiAtIG9wdGlvbnMudHJpbTogaWYgdHJ1ZSwgcmV0dXJucyBhIHRyaW1tZWQgc3RyaW5nIGZvciBzdHJpbmcvbnVtYmVyXG4gICAgICAgICAqL1xuICAgICAgICBUTVV0aWxzLmdldE9ic1ZhbHVlID0gZnVuY3Rpb24gZ2V0T2JzVmFsdWUodm1PckVsLCBwYXRoT3JQYXRocywge1xuICAgICAgICAgICAgZmlyc3QgPSB0cnVlLCAgICAgIC8vIGlmIHZhbHVlIGlzIGFuIGFycmF5LCByZXR1cm4gZmlyc3QgaXRlbVxuICAgICAgICAgICAgdHJpbSA9IGZhbHNlLCAgICAgIC8vIHRyaW0gc3RyaW5nL251bWJlciB0byBzdHJpbmdcbiAgICAgICAgICAgIGRlZXAgPSB0cnVlLCAgICAgICAvLyBkZWVwIHVud3JhcCAoS08gKyBuZXN0ZWQpXG4gICAgICAgICAgICBhbGxvd1BsZXggPSB0cnVlLCAgLy8gdXNlIHBsZXguZGF0YS5nZXRPYnNlcnZhYmxlT3JWYWx1ZSB3aGVuIGF2YWlsYWJsZVxuICAgICAgICAgICAgY29hbGVzY2VGYWxzeSA9IGZhbHNlIC8vIGlmIGZhbHNlLCBlbXB0eSBzdHJpbmcgaXMgdHJlYXRlZCBhcyBcIm5vdCBmb3VuZFwiIGFuZCB0cmllcyBuZXh0IGNhbmRpZGF0ZVxuICAgICAgICB9ID0ge30pIHtcbiAgICAgICAgICAgIGlmICghdm1PckVsIHx8ICFwYXRoT3JQYXRocykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgY29uc3Qgcm9vdCA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdyA6IHdpbmRvdyk7XG4gICAgICAgICAgICBjb25zdCBLTyA9IHJvb3Qua287XG4gICAgICAgICAgICBjb25zdCB1bndyYXBPbmNlID0gKHYpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoVE1VdGlscy51bndyYXApIHJldHVybiBUTVV0aWxzLnVud3JhcCh2KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKEtPPy51bndyYXApIHJldHVybiBLTy51bndyYXAodik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAodHlwZW9mIHYgPT09ICdmdW5jdGlvbicpID8gdigpIDogdjtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIHY7IH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB1bndyYXBEZWVwID0gKHYpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoVE1VdGlscy51bndyYXBEZWVwKSByZXR1cm4gVE1VdGlscy51bndyYXBEZWVwKHYpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoS08/LnVud3JhcCkgcmV0dXJuIEtPLnVud3JhcCh2KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJykgPyB2KCkgOiB2O1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gdjsgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IGlzS09GdW5jID0gKGYpID0+ICEhZiAmJiB0eXBlb2YgZiA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgICAgICAgIChLTz8uaXNPYnNlcnZhYmxlPy4oZikgfHwgJ3BlZWsnIGluIGYgfHwgJ3N1YnNjcmliZScgaW4gZiB8fCAnbm90aWZ5U3Vic2NyaWJlcnMnIGluIGYpO1xuXG4gICAgICAgICAgICAvLyBJZiBnaXZlbiBhIERPTSBub2RlLCByZXNvbHZlIEtPIHJvb3QgVk1cbiAgICAgICAgICAgIGxldCB2bSA9IHZtT3JFbDtcbiAgICAgICAgICAgIGlmICh2bU9yRWwgJiYgdm1PckVsLm5vZGVUeXBlID09PSAxKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3R4ID0gS08/LmNvbnRleHRGb3I/Lih2bU9yRWwpO1xuICAgICAgICAgICAgICAgICAgICB2bSA9IGN0eD8uJHJvb3Q/LmRhdGEgPz8gY3R4Py4kcm9vdCA/PyBjdHg/LiRkYXRhID8/IHZtT3JFbDtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlcyA9IEFycmF5LmlzQXJyYXkocGF0aE9yUGF0aHMpID8gcGF0aE9yUGF0aHMgOiBbcGF0aE9yUGF0aHNdO1xuXG4gICAgICAgICAgICBjb25zdCByZWFkVmlhUGxleCA9IChwKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZyA9IHJvb3Q/LnBsZXg/LmRhdGE/LmdldE9ic2VydmFibGVPclZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYWxsb3dQbGV4ICYmIHR5cGVvZiBnID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhY2MgPSBnKHZtLCBwKTsgICAgICAgICAgICAgICAvLyBLTyBvYnNlcnZhYmxlL2NvbXB1dGVkIE9SIHBsYWluIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gKHR5cGVvZiBhY2MgPT09ICdmdW5jdGlvbicpID8gYWNjKCkgOiBhY2M7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgcmVhZFZpYVBhdGggPSAocCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNlZ21lbnRzID0gU3RyaW5nKHApLnNwbGl0KCcuJyk7XG4gICAgICAgICAgICAgICAgICAgIGxldCBjdXIgPSB2bTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBrIG9mIHNlZ21lbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXIgPSAoY3VyID09IG51bGwpID8gdW5kZWZpbmVkIDogY3VyW2tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1ciA9PT0gdW5kZWZpbmVkKSBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGN1ciA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIGlzS09GdW5jKGN1cikgPyBjdXIoKSA6IGN1cjsgLy8gZG9uJ3QgYWNjaWRlbnRhbGx5IGV4ZWN1dGUgbm9uLUtPIG1ldGhvZHNcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGN1cjtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHAgb2YgY2FuZGlkYXRlcykge1xuICAgICAgICAgICAgICAgIGxldCB2ID0gcmVhZFZpYVBsZXgocCk7XG4gICAgICAgICAgICAgICAgaWYgKHYgPT09IHVuZGVmaW5lZCkgdiA9IHJlYWRWaWFQYXRoKHApO1xuXG4gICAgICAgICAgICAgICAgdiA9IGRlZXAgPyB1bndyYXBEZWVwKHYpIDogdW53cmFwT25jZSh2KTtcbiAgICAgICAgICAgICAgICBpZiAoZmlyc3QgJiYgQXJyYXkuaXNBcnJheSh2KSkgdiA9IHYubGVuZ3RoID8gdlswXSA6IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgICAgIGlmICh0cmltICYmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIHYgPT09ICdudW1iZXInKSkgdiA9IFN0cmluZyh2KS50cmltKCk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBoYXNWYWx1ZSA9ICh2ICE9PSB1bmRlZmluZWQgJiYgdiAhPT0gbnVsbCAmJiAoY29hbGVzY2VGYWxzeSB8fCB2ICE9PSAnJykpO1xuICAgICAgICAgICAgICAgIGlmIChoYXNWYWx1ZSkgcmV0dXJuIHY7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKipcbiAgICAgICAgICogV3JpdGUgYSB2YWx1ZSB0byBhIFBsZXggS08gdmlldy1tb2RlbCBwcm9wZXJ0eS5cbiAgICAgICAgICogLSBTdXBwb3J0cyBkb3R0ZWQgcGF0aHMgXCJGb28uQmFyXCJcbiAgICAgICAgICogLSBJZiB0aGUgdGFyZ2V0IGlzIGFuIG9ic2VydmFibGUgZnVuY3Rpb24sIGNhbGxzIGl0IHdpdGggdmFsdWVcbiAgICAgICAgICogLSBJZiB0aGUgdGFyZ2V0IGlzIGFuIGFycmF5LCByZXBsYWNlcyBjb250ZW50cyB3aXRoIGEgc2luZ2xlIHZhbHVlXG4gICAgICAgICAqIC0gRWxzZSBhc3NpZ25zIGRpcmVjdGx5XG4gICAgICAgICAqL1xuICAgICAgICAvLyBBcnJheS1hd2FyZSB3cml0ZTogcmVzcGVjdHMgS08gb2JzZXJ2YWJsZUFycmF5LCBLTyBvYnNlcnZhYmxlLCBvciBwbGFpbiBwcm9wXG4gICAgICAgIFRNVXRpbHMuc2V0T2JzVmFsdWUgPSBmdW5jdGlvbiBzZXRPYnNWYWx1ZSh2bSwgcGF0aCwgdmFsdWUpIHtcbiAgICAgICAgICAgIGlmICghdm0gfHwgIXBhdGgpIHJldHVybjtcblxuICAgICAgICAgICAgY29uc3Qgcm9vdCA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdyA6IHdpbmRvdyk7XG4gICAgICAgICAgICBjb25zdCBLTyA9IHJvb3Qua287XG5cbiAgICAgICAgICAgIC8vIEhlbHBlciB0byBjb2VyY2UgdG8gYXJyYXkgaWZmIHRhcmdldCBpcyBhcnJheS1zaGFwZWRcbiAgICAgICAgICAgIGNvbnN0IHRvQXJyYXlJZiA9IChpc0FycmF5VGFyZ2V0LCB2KSA9PiBpc0FycmF5VGFyZ2V0ID8gKEFycmF5LmlzQXJyYXkodikgPyB2IDogW3ZdKSA6IHY7XG5cbiAgICAgICAgICAgIC8vIFRyeSBQbGV4IGFjY2Vzc29yIGZpcnN0ICh1c3VhbGx5IHJldHVybnMgYSBLTyBvYnNlcnZhYmxlIGZ1bmN0aW9uKVxuICAgICAgICAgICAgY29uc3QgcGxleEdldCA9IHJvb3Q/LnBsZXg/LmRhdGE/LmdldE9ic2VydmFibGVPclZhbHVlO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBwbGV4R2V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWNjID0gcGxleEdldCh2bSwgcGF0aCk7ICAgICAgICAgICAgLy8gZ2V0dGVyL3NldHRlciBmdW5jdGlvbiBvciB2YWx1ZVxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgYWNjID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERldGVjdCBvYnNlcnZhYmxlQXJyYXkgdmlhIG1ldGhvZCBwcmVzZW5jZVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc09ic0FycmF5ID0gISEoYWNjICYmIHR5cGVvZiBhY2MucHVzaCA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgYWNjLnJlbW92ZUFsbCA9PT0gJ2Z1bmN0aW9uJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc09ic0FycmF5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY2MucmVtb3ZlQWxsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhcnIgPSB0b0FycmF5SWYodHJ1ZSwgdmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFyci5sZW5ndGgpIGFjYy5wdXNoKC4uLmFycik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gRm9yIG5vcm1hbCBvYnNlcnZhYmxlL2NvbXB1dGVkOiBjb2VyY2Ugb25seSBpZiBjdXJyZW50IGlzIGFycmF5XG4gICAgICAgICAgICAgICAgICAgIGxldCBjdXI7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IGN1ciA9IGFjYygpOyB9IGNhdGNoIHsgY3VyID0gdW5kZWZpbmVkOyB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQXJyYXlUYXJnZXQgPSBBcnJheS5pc0FycmF5KGN1cik7XG4gICAgICAgICAgICAgICAgICAgIGFjYyh0b0FycmF5SWYoaXNBcnJheVRhcmdldCwgdmFsdWUpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBJZiBwbGV4IGdhdmUgdXMgYSBwbGFpbiB2YWx1ZSAocmFyZSksIGZhbGwgdGhyb3VnaCB0byBkaXJlY3QgcGF0aFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBEaXJlY3QgcGF0aDogd2FsayB0byBwYXJlbnQgKyBrZXlcbiAgICAgICAgICAgIGNvbnN0IGtleXMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgICAgICAgICBjb25zdCBmaW5hbEtleSA9IGtleXMucG9wKCk7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBrZXlzLnJlZHVjZSgoYWNjLCBrKSA9PiAoYWNjID09IG51bGwgPyBhY2MgOiBhY2Nba10pLCB2bSk7XG4gICAgICAgICAgICBpZiAoIXBhcmVudCkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCBjdXIgPSBwYXJlbnRbZmluYWxLZXldO1xuXG4gICAgICAgICAgICAvLyBLTyBvYnNlcnZhYmxlQXJyYXlcbiAgICAgICAgICAgIGlmIChLTyAmJiB0eXBlb2YgS08uaXNPYnNlcnZhYmxlID09PSAnZnVuY3Rpb24nICYmIEtPLmlzT2JzZXJ2YWJsZShjdXIpICYmXG4gICAgICAgICAgICAgICAgdHlwZW9mIGN1ci5wdXNoID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiBjdXIucmVtb3ZlQWxsID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgY3VyLnJlbW92ZUFsbCgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGFyciA9IHRvQXJyYXlJZih0cnVlLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKGFyci5sZW5ndGgpIGN1ci5wdXNoKC4uLmFycik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBLTyBvYnNlcnZhYmxlIHNjYWxhclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBsZXQgY3VycmVudFZhbDtcbiAgICAgICAgICAgICAgICB0cnkgeyBjdXJyZW50VmFsID0gY3VyKCk7IH0gY2F0Y2ggeyBjdXJyZW50VmFsID0gdW5kZWZpbmVkOyB9XG4gICAgICAgICAgICAgICAgY29uc3QgaXNBcnJheVRhcmdldCA9IEFycmF5LmlzQXJyYXkoY3VycmVudFZhbCk7XG4gICAgICAgICAgICAgICAgY3VyKHRvQXJyYXlJZihpc0FycmF5VGFyZ2V0LCB2YWx1ZSkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUGxhaW4gcHJvcGVydHkgKGFycmF5IG9yIHNjYWxhcilcbiAgICAgICAgICAgIGNvbnN0IGlzQXJyYXlUYXJnZXQgPSBBcnJheS5pc0FycmF5KGN1cik7XG4gICAgICAgICAgICBwYXJlbnRbZmluYWxLZXldID0gdG9BcnJheUlmKGlzQXJyYXlUYXJnZXQsIHZhbHVlKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qKiBDb252ZW5pZW5jZTogY29lcmNlIGFueSBvYnMvcGxhaW4vYXJyYXkgdG8gYSB0cmltbWVkIHN0cmluZyBpZCAqL1xuICAgICAgICBUTVV0aWxzLmNvZXJjZUlkID0gZnVuY3Rpb24gY29hbGVzY2VUb0lkKHYpIHtcbiAgICAgICAgICAgIGNvbnN0IHUgPSBUTVV0aWxzLnVud3JhcERlZXAgPyBUTVV0aWxzLnVud3JhcERlZXAodikgOiB2O1xuICAgICAgICAgICAgY29uc3QgeCA9IEFycmF5LmlzQXJyYXkodSkgPyAodS5sZW5ndGggPyB1WzBdIDogdW5kZWZpbmVkKSA6IHU7XG4gICAgICAgICAgICByZXR1cm4gU3RyaW5nKHggPz8gJycpLnRyaW0oKTtcbiAgICAgICAgfTtcbiAgICB9KSgpO1xuXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyAzKSBGbG9hdGluZyBtZXNzYWdlIFVJIChrZXB0IGFzLWlzOyBhZGRlZCB0b2FzdCgpIGFsaWFzICsgbG9nKCkpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gaGlkZU1lc3NhZ2UoKSB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0bS1tc2cnKT8ucmVtb3ZlKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2hvd01lc3NhZ2UodGV4dCwgeyB0eXBlID0gJ2luZm8nLCBhdXRvQ2xlYXIgPSA0MDAwIH0gPSB7fSkge1xuICAgICAgICBoaWRlTWVzc2FnZSgpO1xuICAgICAgICBjb25zdCBjb2xvcnMgPSB7XG4gICAgICAgICAgICBpbmZvOiB7IGJnOiAnI2Q5ZWRmNycsIGZnOiAnIzMxNzA4ZicgfSxcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHsgYmc6ICcjZGZmMGQ4JywgZmc6ICcjM2M3NjNkJyB9LFxuICAgICAgICAgICAgd2FybmluZzogeyBiZzogJyNmY2Y4ZTMnLCBmZzogJyM4YTZkM2InIH0sXG4gICAgICAgICAgICBlcnJvcjogeyBiZzogJyNmMmRlZGUnLCBmZzogJyNhOTQ0NDInIH1cbiAgICAgICAgfVt0eXBlXSB8fCB7IGJnOiAnI2ZmZicsIGZnOiAnIzAwMCcgfTtcbiAgICAgICAgY29uc3QgYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGJveC5pZCA9ICd0bS1tc2cnO1xuICAgICAgICBPYmplY3QuYXNzaWduKGJveC5zdHlsZSwge1xuICAgICAgICAgICAgcG9zaXRpb246ICdmaXhlZCcsIHRvcDogJzEwcHgnLCByaWdodDogJzEwcHgnLFxuICAgICAgICAgICAgcGFkZGluZzogJzhweCAxMnB4JywgYmFja2dyb3VuZENvbG9yOiBjb2xvcnMuYmcsXG4gICAgICAgICAgICBjb2xvcjogY29sb3JzLmZnLCBib3JkZXI6IGAxcHggc29saWQgJHtjb2xvcnMuZmd9YCxcbiAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzRweCcsIGJveFNoYWRvdzogJzAgMnB4IDZweCByZ2JhKDAsMCwwLDAuMiknLFxuICAgICAgICAgICAgekluZGV4OiAxMDAwMCwgZm9udFNpemU6ICcwLjllbScsIG1heFdpZHRoOiAnODAlJyxcbiAgICAgICAgICAgIHdoaXRlU3BhY2U6ICdwcmUtbGluZSdcbiAgICAgICAgfSk7XG4gICAgICAgIGJveC50ZXh0Q29udGVudCA9IHRleHQ7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYm94KTtcbiAgICAgICAgaWYgKGF1dG9DbGVhcikgc2V0VGltZW91dChoaWRlTWVzc2FnZSwgYXV0b0NsZWFyKTtcbiAgICB9XG5cbiAgICAvLyBBbGlhczogdW5pZmllZCB0b2FzdCBBUElcbiAgICBmdW5jdGlvbiB0b2FzdChtc2csIGxldmVsID0gJ2luZm8nLCBtcykge1xuICAgICAgICBzaG93TWVzc2FnZShtc2csIHsgdHlwZTogbGV2ZWwsIGF1dG9DbGVhcjogbXMgPz8gNDAwMCB9KTtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyA0KSBET00gaW5zZXJ0aW9uIG9ic2VydmVyIChrZXB0IGFzLWlzKVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIG9ic2VydmVJbnNlcnQoc2VsZWN0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNvbnN0IG9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgICAgICBpZiAoZWwpIHtcbiAgICAgICAgICAgICAgICBvYnMuZGlzY29ubmVjdCgpOyBjYWxsYmFjayhlbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBvYnMub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICAgICAgaWYgKGV4aXN0aW5nKSB7IG9icy5kaXNjb25uZWN0KCk7IGNhbGxiYWNrKGV4aXN0aW5nKTsgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIDUpIEtPIGNvbnRyb2xsZXIgKyBWTSB3YWl0ZXJzIChrZXB0OyBhc3luYyB2YXJpYW50IHByZXNlcnZlZClcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBmdW5jdGlvbiB3YWl0Rm9yTW9kZWxBc3luYyhzZWwsIHtcbiAgICAgICAgcG9sbE1zID0gMjUwLFxuICAgICAgICB0aW1lb3V0TXMgPSAzMDAwMCxcbiAgICAgICAgcmVxdWlyZUtvID0gdHJ1ZSwgICAvLyBpZiBmYWxzZSwgcmVzb2x2ZSBhcyBzb29uIGFzIHRoZSBlbGVtZW50IGlzIGZvdW5kXG4gICAgICAgIGxvZ2dlciA9IG51bGwsICAgICAgLy8gcGFzcyBUTVV0aWxzLmdldExvZ2dlcignUVQxMCcpIC8gX2xvZ2dlciwgZXRjLlxuICAgICAgICBsb2cgPSBmYWxzZSAgICAgICAgIC8vIHNldCB0cnVlIHRvIHByaW50IGRlYnVnIHdpdGggY29uc29sZS4qIGV2ZW4gd2l0aG91dCBhIGxvZ2dlclxuICAgIH0gPSB7fSkge1xuICAgICAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG5cbiAgICAgICAgY29uc3QgZ2V0S28gPSAoKSA9PlxuICAgICAgICAgICAgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHdpbmRvdy5rbykgfHxcbiAgICAgICAgICAgICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pIHx8IG51bGw7XG5cbiAgICAgICAgY29uc3QgZGJnID0gKGZuLCAuLi5hcmdzKSA9PiB7XG4gICAgICAgICAgICBpZiAobG9nZ2VyICYmIHR5cGVvZiBsb2dnZXJbZm5dID09PSAnZnVuY3Rpb24nKSBsb2dnZXJbZm5dKC4uLmFyZ3MpO1xuICAgICAgICAgICAgZWxzZSBpZiAobG9nKSAoY29uc29sZVtmbl0gfHwgY29uc29sZS5sb2cpKC4uLmFyZ3MpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBmdW5jdGlvbiB0aWNrKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWwpO1xuICAgICAgICAgICAgICAgIGlmICghZWwpIHJldHVybiBzY2hlZHVsZSgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFyZXF1aXJlS28pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gcmV0dXJuIGVhcmx5IHdpdGhvdXQgS08gY29udGV4dFxuICAgICAgICAgICAgICAgICAgICBsb2cgJiYgY29uc29sZS5kZWJ1ZygnXHVEODNEXHVERDBEIHdhaXRGb3JNb2RlbEFzeW5jIChubyBLTyk6JywgeyBzZWwsIGVsIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7IGVsZW1lbnQ6IGVsLCBjb250cm9sbGVyOiBudWxsLCB2aWV3TW9kZWw6IG51bGwgfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3Qga29PYmogPSBnZXRLbygpO1xuICAgICAgICAgICAgICAgIGlmICgha29PYmogfHwgdHlwZW9mIGtvT2JqLmNvbnRleHRGb3IgIT09ICdmdW5jdGlvbicpIHJldHVybiBzY2hlZHVsZSgpO1xuXG4gICAgICAgICAgICAgICAgbGV0IGNvbnRyb2xsZXIgPSBudWxsLCB2aWV3TW9kZWwgPSBudWxsO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN0eCA9IGtvT2JqLmNvbnRleHRGb3IoZWwpO1xuICAgICAgICAgICAgICAgICAgICBjb250cm9sbGVyID0gY3R4ICYmIGN0eC4kZGF0YSB8fCBudWxsOyAgICAgICAgICAgICAgICAgIC8vIGUuZy4sIGNvbnRyb2xsZXJcbiAgICAgICAgICAgICAgICAgICAgdmlld01vZGVsID0gKGNvbnRyb2xsZXIgJiYgY29udHJvbGxlci5tb2RlbCkgfHwgbnVsbDsgIC8vIGUuZy4sIFZNIG9uIGNvbnRyb2xsZXJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF2aWV3TW9kZWwgJiYgY3R4KSB2aWV3TW9kZWwgPSBjdHguJHJvb3Q/LmRhdGEgfHwgY3R4LiRyb290IHx8IG51bGw7IC8vIFZNIGZhbGxiYWNrXG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vdCByZWFkeSB5ZXQgKi8gfVxuXG4gICAgICAgICAgICAgICAgaWYgKGxvZ2dlciB8fCBsb2cpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5ncm91cENvbGxhcHNlZCgnXHVEODNEXHVERDBEIHdhaXRGb3JNb2RlbEFzeW5jJyk7XG4gICAgICAgICAgICAgICAgICAgIGRiZygnZGVidWcnLCAnc2VsZWN0b3IgXHUyMTkyJywgc2VsKTtcbiAgICAgICAgICAgICAgICAgICAgZGJnKCdkZWJ1ZycsICdjb250cm9sbGVyIFx1MjE5MicsIGNvbnRyb2xsZXIpO1xuICAgICAgICAgICAgICAgICAgICBkYmcoJ2RlYnVnJywgJ3ZtIFx1MjE5MicsIHZpZXdNb2RlbCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmlld01vZGVsKSByZXR1cm4gcmVzb2x2ZSh7IGVsZW1lbnQ6IGVsLCBjb250cm9sbGVyLCB2aWV3TW9kZWwgfSk7XG4gICAgICAgICAgICAgICAgc2NoZWR1bGUoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gc2NoZWR1bGUoKSB7XG4gICAgICAgICAgICAgICAgaWYgKChEYXRlLm5vdygpIC0gc3RhcnQpID49IHRpbWVvdXRNcykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBgVGltZWQgb3V0IHdhaXRpbmcgZm9yIFwiJHtzZWx9XCIgYWZ0ZXIgJHt0aW1lb3V0TXN9bXNgO1xuICAgICAgICAgICAgICAgICAgICBkYmcoJ3dhcm4nLCAnXHUyMzFCIHdhaXRGb3JNb2RlbEFzeW5jJywgbXNnKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChuZXcgRXJyb3IobXNnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQodGljaywgcG9sbE1zKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGljaygpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgLy8gXHUyNzA1IGFkZCB0aGlzIHJpZ2h0IGFmdGVyIHRoZSB3YWl0Rm9yTW9kZWxBc3luYyBmdW5jdGlvbiBkZWZpbml0aW9uXG4gICAgVE1VdGlscy53YWl0Rm9yTW9kZWxBc3luYyA9IHdhaXRGb3JNb2RlbEFzeW5jO1xuXG5cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIDYpIFNlbGVjdCA8b3B0aW9uPiBoZWxwZXJzIChrZXB0KVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIHNlbGVjdE9wdGlvbkJ5VGV4dChzZWxlY3RFbCwgdGV4dCkge1xuICAgICAgICBjb25zdCBvcHQgPSBBcnJheS5mcm9tKHNlbGVjdEVsLm9wdGlvbnMpXG4gICAgICAgICAgICAuZmluZChvID0+IG8udGV4dENvbnRlbnQudHJpbSgpID09PSB0ZXh0KTtcbiAgICAgICAgaWYgKG9wdCkgeyBzZWxlY3RFbC52YWx1ZSA9IG9wdC52YWx1ZTsgc2VsZWN0RWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7IH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZWxlY3RPcHRpb25CeVZhbHVlKHNlbGVjdEVsLCB2YWx1ZSkge1xuICAgICAgICBjb25zdCBvcHQgPSBBcnJheS5mcm9tKHNlbGVjdEVsLm9wdGlvbnMpXG4gICAgICAgICAgICAuZmluZChvID0+IG8udmFsdWUgPT0gdmFsdWUpO1xuICAgICAgICBpZiAob3B0KSB7IHNlbGVjdEVsLnZhbHVlID0gb3B0LnZhbHVlOyBzZWxlY3RFbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTsgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIDcpIFJvdXRlIGhlbHBlcnMgKG5ldyk6IGVuc3VyZVJvdXRlKHJlZ2V4KSArIG9uUm91dGVDaGFuZ2UoaGFuZGxlcilcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBmdW5jdGlvbiBlbnN1cmVSb3V0ZShyZWdleCkge1xuICAgICAgICB0cnkgeyByZXR1cm4gcmVnZXgudGVzdChsb2NhdGlvbi5wYXRobmFtZSk7IH1cbiAgICAgICAgY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cbiAgICB9XG5cbiAgICAvLyBIZWxwZXIgdXNlZCBieSBib3RoIHdhdGNoZXJzXG4gICAgZnVuY3Rpb24gX190bUNyZWF0ZVF1aWV0RGlzcGF0Y2hlcihmbiwgZGVsYXkpIHtcbiAgICAgICAgbGV0IHQgPSBudWxsO1xuICAgICAgICByZXR1cm4gKCkgPT4geyBpZiAodCkgY2xlYXJUaW1lb3V0KHQpOyB0ID0gc2V0VGltZW91dCgoKSA9PiB7IHQgPSBudWxsOyBmbigpOyB9LCBkZWxheSk7IH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25Sb3V0ZUNoYW5nZShoYW5kbGVyKSB7XG4gICAgICAgIGlmIChoaXN0b3J5Ll9fdG1XcmFwcGVkKSB7IGhhbmRsZXIobG9jYXRpb24ucGF0aG5hbWUpOyByZXR1cm47IH1cbiAgICAgICAgY29uc3QgZmlyZSA9ICgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7IGhhbmRsZXIobG9jYXRpb24ucGF0aG5hbWUpOyB9IGNhdGNoIChlKSB7IGNvbnNvbGUud2Fybignb25Sb3V0ZUNoYW5nZSBoYW5kbGVyIGVycm9yJywgZSk7IH1cbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgX3BzID0gaGlzdG9yeS5wdXNoU3RhdGU7XG4gICAgICAgIGhpc3RvcnkucHVzaFN0YXRlID0gZnVuY3Rpb24gKCkgeyBfcHMuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdsb2NhdGlvbmNoYW5nZScpKTsgfTtcbiAgICAgICAgY29uc3QgX3JzID0gaGlzdG9yeS5yZXBsYWNlU3RhdGU7XG4gICAgICAgIGhpc3RvcnkucmVwbGFjZVN0YXRlID0gZnVuY3Rpb24gKCkgeyBfcnMuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdsb2NhdGlvbmNoYW5nZScpKTsgfTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BvcHN0YXRlJywgZmlyZSk7XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdsb2NhdGlvbmNoYW5nZScsIGZpcmUpO1xuICAgICAgICBoaXN0b3J5Ll9fdG1XcmFwcGVkID0gdHJ1ZTtcbiAgICAgICAgZmlyZSgpOyAvLyBpbW1lZGlhdGUgZmlyZSBmb3IgaW5pdGlhbCByb3V0ZVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIDgpIFJvdXRlIG1hdGNoZXIgKG5ldyk6IGFjY2VwdHMgcmVnZXggb3IgYXJyYXkgb2YgcmVnZXhcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBmdW5jdGlvbiBtYXRjaFJvdXRlKHJlZ2V4T3JBcnJheSwgcGF0aCA9IGxvY2F0aW9uLnBhdGhuYW1lKSB7XG4gICAgICAgIGlmICghcmVnZXhPckFycmF5KSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChyZWdleE9yQXJyYXkgaW5zdGFuY2VvZiBSZWdFeHApIHJldHVybiByZWdleE9yQXJyYXkudGVzdChwYXRoKTtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVnZXhPckFycmF5KSkgcmV0dXJuIHJlZ2V4T3JBcnJheS5zb21lKHJ4ID0+IHJ4LnRlc3QocGF0aCkpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gTG9nZ2VyIEhlbHBlcnNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBsZXQgX190bURlYnVnID0gZmFsc2U7ICAgICAgICAgICAgLy8gZGVjbGFyZSB0aGlzIHNvIHNldERlYnVnIHdvcmtzXG4gICAgZnVuY3Rpb24gc2V0RGVidWcodikgeyBfX3RtRGVidWcgPSAhIXY7IH1cbiAgICBmdW5jdGlvbiBtYWtlTG9nZ2VyKG5zKSB7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gbnMgfHwgJ1RNJztcbiAgICAgICAgY29uc3QgZW1pdCA9IChtLCBiYWRnZSwgLi4uYSkgPT4gKGNvbnNvbGVbbV0gfHwgY29uc29sZS5sb2cpLmNhbGwoY29uc29sZSwgYCR7bGFiZWx9ICR7YmFkZ2V9YCwgLi4uYSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBsb2c6ICguLi5hKSA9PiBlbWl0KCdsb2cnLCAnXHUyNUI2XHVGRTBGJywgLi4uYSksXG4gICAgICAgICAgICBpbmZvOiAoLi4uYSkgPT4gZW1pdCgnaW5mbycsICdcdTIxMzlcdUZFMEYnLCAuLi5hKSxcbiAgICAgICAgICAgIHdhcm46ICguLi5hKSA9PiBlbWl0KCd3YXJuJywgJ1x1MjZBMFx1RkUwRicsIC4uLmEpLFxuICAgICAgICAgICAgZXJyb3I6ICguLi5hKSA9PiBlbWl0KCdlcnJvcicsICdcdTI3MTZcdUZFMEYnLCAuLi5hKSxcbiAgICAgICAgICAgIG9rOiAoLi4uYSkgPT4gZW1pdCgnbG9nJywgJ1x1MjcwNScsIC4uLmEpLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8vIFNpbXBsZSBnbG9iYWwgc2hpbXMgc28gVE1VdGlscy5sb2cvd2Fybi9lcnJvciBleGlzdCAoaGFuZHkgZm9yIHlvdXIgZGxvZy9kd2Fybi9kZXJyb3IpXG4gICAgZnVuY3Rpb24gbG9nKC4uLmEpIHsgY29uc29sZS5sb2coJ1RNIFx1MjVCNlx1RkUwRicsIC4uLmEpOyB9XG4gICAgZnVuY3Rpb24gd2FybiguLi5hKSB7IGNvbnNvbGUud2FybignVE0gXHUyNkEwXHVGRTBGJywgLi4uYSk7IH1cbiAgICBmdW5jdGlvbiBlcnJvciguLi5hKSB7IGNvbnNvbGUuZXJyb3IoJ1RNIFx1MjcxNlx1RkUwRicsIC4uLmEpOyB9XG4gICAgZnVuY3Rpb24gb2soLi4uYSkgeyBjb25zb2xlLmxvZygnVE0gXHUyNzA1JywgLi4uYSk7IH1cblxuICAgIGZ1bmN0aW9uIGRlcml2ZU5zRnJvbVNjcmlwdE5hbWUoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBuYW1lID0gKHR5cGVvZiBHTV9pbmZvICE9PSAndW5kZWZpbmVkJyAmJiBHTV9pbmZvPy5zY3JpcHQ/Lm5hbWUpIHx8ICcnO1xuICAgICAgICAgICAgaWYgKCFuYW1lKSByZXR1cm4gJ1RNJztcbiAgICAgICAgICAgIC8vIGdyYWIgdGhlIGZpcnN0IHRva2VuIGJlZm9yZSBhIHNwYWNlL2Fycm93ICh3b3JrcyBmb3IgXHUyMDFDUVQxMCBcdTIwMjZcdTIwMUQsIFx1MjAxQ0NSJlMxMCBcdTI3OUMgXHUyMDI2XHUyMDFELCBldGMuKVxuICAgICAgICAgICAgcmV0dXJuIG5hbWUuc3BsaXQoL1sgXFx0XHUyMDEzXHUyMDE0XFwtXHUyMTkyXHUyNzlDPl0vKVswXS50cmltKCkgfHwgJ1RNJztcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiAnVE0nOyB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0TG9nZ2VyKG5zKSB7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gbnMgfHwgZGVyaXZlTnNGcm9tU2NyaXB0TmFtZSgpO1xuICAgICAgICByZXR1cm4gVE1VdGlscy5tYWtlTG9nZ2VyID8gVE1VdGlscy5tYWtlTG9nZ2VyKGxhYmVsKSA6IHtcbiAgICAgICAgICAgIGxvZzogKC4uLmEpID0+IGNvbnNvbGUubG9nKGAke2xhYmVsfSBcdTI1QjZcdUZFMEZgLCAuLi5hKSxcbiAgICAgICAgICAgIGluZm86ICguLi5hKSA9PiBjb25zb2xlLmluZm8oYCR7bGFiZWx9IFx1MjEzOVx1RkUwRmAsIC4uLmEpLFxuICAgICAgICAgICAgd2FybjogKC4uLmEpID0+IGNvbnNvbGUud2FybihgJHtsYWJlbH0gXHUyNkEwXHVGRTBGYCwgLi4uYSksXG4gICAgICAgICAgICBlcnJvcjogKC4uLmEpID0+IGNvbnNvbGUuZXJyb3IoYCR7bGFiZWx9IFx1MjcxNlx1RkUwRmAsIC4uLmEpLFxuICAgICAgICAgICAgb2s6ICguLi5hKSA9PiBjb25zb2xlLmxvZyhgJHtsYWJlbH0gXHUyNzA1YCwgLi4uYSksXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gT3B0aW9uYWw6IHNldCBhIGdsb2JhbCBgTGAgZm9yIGNvbnZlbmllbmNlIChhdm9pZCBpZiB5b3UgZmVhciBjb2xsaXNpb25zKVxuICAgIGZ1bmN0aW9uIGF0dGFjaExvZ2dlckdsb2JhbChucykge1xuICAgICAgICBjb25zdCBsb2dnZXIgPSBnZXRMb2dnZXIobnMpO1xuICAgICAgICB3aW5kb3cuTCA9IGxvZ2dlcjtcbiAgICAgICAgaWYgKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnKSB1bnNhZmVXaW5kb3cuTCA9IGxvZ2dlcjtcbiAgICAgICAgcmV0dXJuIGxvZ2dlcjtcbiAgICB9XG5cbiAgICAvLyBXYXRjaCBhIGZpZWxkIGJ5IGl0cyA8bGFiZWw+IHRleHQuIFN1YnNjcmliZXMgdG8gS08gaWYgYXZhaWxhYmxlOyBlbHNlIGZhbGxzIGJhY2sgdG8gRE9NLlxuICAgIC8vIFJldHVybnMgYW4gdW5zdWJzY3JpYmUoKSBmdW5jdGlvbi5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gd2F0Y2hCeUxhYmVsIChEUk9QLUlOKSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBUTVV0aWxzLndhdGNoQnlMYWJlbCA9IGZ1bmN0aW9uIHdhdGNoQnlMYWJlbCh7XG4gICAgICAgIGxhYmVsVGV4dCxcbiAgICAgICAgb25DaGFuZ2U6IG9uVmFsdWUsXG4gICAgICAgIGluaXRpYWwgPSB0cnVlLFxuICAgICAgICBmaXJlT24gPSAnY2hhbmdlJywgICAgICAgICAgICAgLy8gJ2NoYW5nZScgfCAnYmx1cidcbiAgICAgICAgc2V0dGxlTXMgPSAyNTAsXG4gICAgICAgIGtvUHJlZmVyID0gJ3Jvb3QnLFxuICAgICAgICBiYWdLZXlzID0gWyd2YWx1ZScsICdkaXNwbGF5VmFsdWUnLCAnYm91bmREaXNwbGF5VmFsdWUnLCAndGV4dElucHV0J10sXG4gICAgICAgIHdpZGdldFNlbGVjdG9yID0gJy5rLWNvbWJvYm94LC5rLWRyb3Bkb3duLC5rLWRyb3Bkb3dubGlzdCwuay1hdXRvY29tcGxldGUsW3JvbGU9XCJjb21ib2JveFwiXScsXG4gICAgICAgIHRpbWVvdXRNcyA9IDMwMDAwLFxuICAgICAgICBsb2dnZXIgPSBudWxsXG4gICAgfSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICAgICAgY29uc3QgaXNPYnMgPSAoeCkgPT4gKEtPPy5pc09ic2VydmFibGU/Lih4KSkgfHwgKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiB4LnN1YnNjcmliZSA9PT0gJ2Z1bmN0aW9uJyk7XG4gICAgICAgIGNvbnN0IHVuID0gKHgpID0+IEtPPy51bndyYXAgPyBLTy51bndyYXAoeCkgOiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgPyB4KCkgOiB4KTtcbiAgICAgICAgY29uc3QgbG9nID0gKC4uLmEpID0+IGxvZ2dlcj8ubG9nPy4oLi4uYSk7XG5cbiAgICAgICAgY29uc3Qgbm9ybSA9IChzKSA9PiBTdHJpbmcocyB8fCAnJykudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9cXHUwMGEwL2csICcgJykucmVwbGFjZSgvWyo6XS9nLCAnJykucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcbiAgICAgICAgY29uc3Qgd2FudCA9IGxhYmVsVGV4dCBpbnN0YW5jZW9mIFJlZ0V4cCA/IGxhYmVsVGV4dCA6IG5vcm0obGFiZWxUZXh0KTtcblxuICAgICAgICBjb25zdCBmaW5kTGFiZWwgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBsYWJlbHMgPSBbLi4uZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnbGFiZWxbZm9yXScpXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgbCBvZiBsYWJlbHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0eHQgPSBub3JtKGwudGV4dENvbnRlbnQgfHwgbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtb3JpZ2luYWwtdGV4dCcpIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBpZiAobGFiZWxUZXh0IGluc3RhbmNlb2YgUmVnRXhwID8gbGFiZWxUZXh0LnRlc3QodHh0KSA6ICh0eHQgPT09IHdhbnQgfHwgdHh0LnN0YXJ0c1dpdGgod2FudCkpKSByZXR1cm4gbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZ1bmN0aW9uIGhvb2tOb3coKSB7XG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IGZpbmRMYWJlbCgpO1xuICAgICAgICAgICAgaWYgKCFsYWJlbCkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgICAgIGNvbnN0IGZvcklkID0gbGFiZWwuZ2V0QXR0cmlidXRlKCdmb3InKTtcbiAgICAgICAgICAgIGNvbnN0IGVsID0gZm9ySWQgJiYgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZm9ySWQpO1xuICAgICAgICAgICAgaWYgKCFlbCkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgICAgIGxldCBib3VuZCA9IG51bGw7XG4gICAgICAgICAgICBpZiAoS08/LmNvbnRleHRGb3IpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdHggPSBLTy5jb250ZXh0Rm9yKGVsKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFnID0gKGtvUHJlZmVyID09PSAnZGF0YScgPyBjdHg/LiRkYXRhPy5lbGVtZW50cz8uW2ZvcklkXSA6IGN0eD8uJHJvb3Q/LmVsZW1lbnRzPy5bZm9ySWRdKVxuICAgICAgICAgICAgICAgICAgICAgICAgfHwgKGtvUHJlZmVyID09PSAnZGF0YScgPyBjdHg/LiRyb290Py5lbGVtZW50cz8uW2ZvcklkXSA6IGN0eD8uJGRhdGE/LmVsZW1lbnRzPy5bZm9ySWRdKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJhZykgYm91bmQgPSBiYWdLZXlzLm1hcChrID0+IGJhZ1trXSkuZmluZChCb29sZWFuKSA/PyBudWxsO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghYm91bmQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRiUmF3ID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWJpbmQnKSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG0gPSAvKD86dmFsdWV8dGV4dElucHV0KVxccyo6XFxzKihbXix9XSspLy5leGVjKGRiUmF3KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwciA9IG1bMV0udHJpbSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV2YWxJbiA9IChvYmopID0+IHsgdHJ5IHsgcmV0dXJuIEZ1bmN0aW9uKCd3aXRoKHRoaXMpe3JldHVybiAoJyArIGV4cHIgKyAnKX0nKS5jYWxsKG9iaik7IH0gY2F0Y2ggeyByZXR1cm4gdW5kZWZpbmVkOyB9IH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYm91bmQgPSBldmFsSW4oY3R4Py4kZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJvdW5kID09PSB1bmRlZmluZWQpIGJvdW5kID0gZXZhbEluKGN0eD8uJHJvb3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vb3AgKi8gfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBrZW5kb1dyYXAgPSBlbC5jbG9zZXN0KHdpZGdldFNlbGVjdG9yKTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGtlbmRvV3JhcD8ucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBlbDtcblxuICAgICAgICAgICAgY29uc3QgcmVhZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gYm91bmQgIT09IG51bGwgPyB1bihib3VuZCkgOiAoZWwudmFsdWUgPz8gJycpLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIChBcnJheS5pc0FycmF5KHYpID8gdlswXSA6IHYpPy50b1N0cmluZygpLnRyaW0oKSB8fCAnJztcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGZpcmUgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IHJlYWQoKTtcbiAgICAgICAgICAgICAgICBpZiAodiAmJiB0eXBlb2Ygb25WYWx1ZSA9PT0gJ2Z1bmN0aW9uJykgb25WYWx1ZSh2KTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBxdWV1ZUZpcmUgPSBfX3RtQ3JlYXRlUXVpZXREaXNwYXRjaGVyKGZpcmUsIHNldHRsZU1zKTtcblxuICAgICAgICAgICAgY29uc3QgdW5zdWJzID0gW107XG5cbiAgICAgICAgICAgIGlmIChpbml0aWFsICYmIGZpcmVPbiAhPT0gJ2JsdXInKSBxdWV1ZUZpcmUoKTtcblxuICAgICAgICAgICAgaWYgKGlzT2JzKGJvdW5kKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHN1YiA9IGJvdW5kLnN1YnNjcmliZSgoKSA9PiBxdWV1ZUZpcmUoKSk7XG4gICAgICAgICAgICAgICAgdW5zdWJzLnB1c2goKCkgPT4gc3ViLmRpc3Bvc2U/LigpKTtcbiAgICAgICAgICAgICAgICBsb2c/Lignd2F0Y2hCeUxhYmVsOiBLTyBzdWJzY3JpcHRpb24gYXR0YWNoZWQgZm9yJywgbGFiZWxUZXh0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGZpcmVPbiA9PT0gJ2JsdXInKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb25Gb2N1c091dCA9ICgpID0+IHF1ZXVlRmlyZSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG9uQ2hhbmdlID0gKCkgPT4gcXVldWVGaXJlKCk7XG4gICAgICAgICAgICAgICAgY29uc3Qgb25LZXlEb3duID0gKGUpID0+IHsgaWYgKGUua2V5ID09PSAnVGFiJyB8fCBlLmtleSA9PT0gJ0VudGVyJykgc2V0VGltZW91dChxdWV1ZUZpcmUsIDApOyB9O1xuXG4gICAgICAgICAgICAgICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3Vzb3V0Jywgb25Gb2N1c091dCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlKTtcbiAgICAgICAgICAgICAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIG9uS2V5RG93bik7XG5cbiAgICAgICAgICAgICAgICBpZiAoa2VuZG9XcmFwICYmIGtlbmRvV3JhcCAhPT0gdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIGtlbmRvV3JhcC5hZGRFdmVudExpc3RlbmVyKCdmb2N1c291dCcsIG9uRm9jdXNPdXQsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICBrZW5kb1dyYXAuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UsIHRydWUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IG1vID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4gcXVldWVGaXJlKCkpO1xuICAgICAgICAgICAgICAgIG1vLm9ic2VydmUodGFyZ2V0LCB7IGNoaWxkTGlzdDogdHJ1ZSwgY2hhcmFjdGVyRGF0YTogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgICAgIHVuc3Vicy5wdXNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2ZvY3Vzb3V0Jywgb25Gb2N1c091dCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5yZW1vdmVFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgb25LZXlEb3duKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGtlbmRvV3JhcCAmJiBrZW5kb1dyYXAgIT09IHRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2VuZG9XcmFwLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2ZvY3Vzb3V0Jywgb25Gb2N1c091dCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZW5kb1dyYXAucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIG1vLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb25DaGFuZ2UgPSAoKSA9PiBxdWV1ZUZpcmUoKTtcbiAgICAgICAgICAgICAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UpO1xuICAgICAgICAgICAgICAgIHVuc3Vicy5wdXNoKCgpID0+IHRhcmdldC5yZW1vdmVFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSkpO1xuICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgIGxvZz8uKCd3YXRjaEJ5TGFiZWw6IGxpc3RlbmVycyBhdHRhY2hlZCBmb3InLCBsYWJlbFRleHQsIHRhcmdldCk7XG4gICAgICAgICAgICByZXR1cm4gKCkgPT4geyB1bnN1YnMuZm9yRWFjaChmbiA9PiB7IHRyeSB7IGZuKCk7IH0gY2F0Y2ggeyB9IH0pOyB9O1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHVuc3ViID0gaG9va05vdygpO1xuICAgICAgICBpZiAodHlwZW9mIHVuc3ViID09PSAnZnVuY3Rpb24nKSByZXR1cm4gdW5zdWI7XG5cbiAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgICAgICAgICB1bnN1YiA9IGhvb2tOb3coKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdW5zdWIgPT09ICdmdW5jdGlvbicpIG1vLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIG1vLm9ic2VydmUoZG9jdW1lbnQuYm9keSwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gbW8uZGlzY29ubmVjdCgpLCB0aW1lb3V0TXMpO1xuXG4gICAgICAgIHJldHVybiAoKSA9PiB7IHRyeSB7IHR5cGVvZiB1bnN1YiA9PT0gJ2Z1bmN0aW9uJyAmJiB1bnN1YigpOyB9IGNhdGNoIHsgfSB0cnkgeyBtby5kaXNjb25uZWN0KCk7IH0gY2F0Y2ggeyB9IH07XG4gICAgfTtcblxuICAgIC8vIFJlc29sdmUgb25jZSB3aXRoIHRoZSBmaXJzdCBub24tZW1wdHkgdmFsdWUsIHRoZW4gYXV0by11bnN1YnNjcmliZVxuICAgIFRNVXRpbHMuYXdhaXRWYWx1ZUJ5TGFiZWwgPSBmdW5jdGlvbiBhd2FpdFZhbHVlQnlMYWJlbCh7IGxhYmVsVGV4dCwgdGltZW91dE1zID0gMzAwMDAsIGxvZ2dlciA9IG51bGwgfSA9IHt9KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBsZXQgc3RvcCA9IG51bGw7XG4gICAgICAgICAgICBsZXQgZG9uZSA9IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKCFkb25lKSB7IGRvbmUgPSB0cnVlOyBzdG9wPy4oKTsgcmVqZWN0KG5ldyBFcnJvcignVGltZW91dCcpKTsgfSB9LCB0aW1lb3V0TXMpO1xuICAgICAgICAgICAgc3RvcCA9IFRNVXRpbHMud2F0Y2hCeUxhYmVsKHtcbiAgICAgICAgICAgICAgICBsYWJlbFRleHQsXG4gICAgICAgICAgICAgICAgaW5pdGlhbDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBsb2dnZXIsXG4gICAgICAgICAgICAgICAgb25DaGFuZ2U6ICh2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkb25lIHx8ICF2KSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgICAgICAgICAgICAgICAgICBzdG9wPy4oKTsgICAgICAgICAgIC8vIGNsZWFuIHVwXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUodik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSB3YXRjaEJ5U2VsZWN0b3IgKERST1AtSU4pIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIFRNVXRpbHMud2F0Y2hCeVNlbGVjdG9yID0gZnVuY3Rpb24gd2F0Y2hCeVNlbGVjdG9yKHtcbiAgICAgICAgc2VsZWN0b3IsXG4gICAgICAgIG9uQ2hhbmdlOiBvblZhbHVlLFxuICAgICAgICBpbml0aWFsID0gdHJ1ZSxcbiAgICAgICAgZmlyZU9uID0gJ2NoYW5nZScsICAgICAgICAgICAgIC8vICdjaGFuZ2UnIHwgJ2JsdXInXG4gICAgICAgIHNldHRsZU1zID0gMjUwLCAgICAgICAgICAgICAgICAvLyB3YWl0IGZvciBLTy9LZW5kby9ET00gdG8gc2V0dGxlXG4gICAgICAgIGtvUHJlZmVyID0gJ3Jvb3QnLFxuICAgICAgICBiYWdLZXlzID0gWyd2YWx1ZScsICdkaXNwbGF5VmFsdWUnLCAnYm91bmREaXNwbGF5VmFsdWUnLCAndGV4dElucHV0J10sXG4gICAgICAgIHdpZGdldFNlbGVjdG9yID0gJy5rLWNvbWJvYm94LC5rLWRyb3Bkb3duLC5rLWRyb3Bkb3dubGlzdCwuay1hdXRvY29tcGxldGUsW3JvbGU9XCJjb21ib2JveFwiXScsXG4gICAgICAgIHRpbWVvdXRNcyA9IDMwMDAwLFxuICAgICAgICBsb2dnZXIgPSBudWxsXG4gICAgfSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICAgICAgY29uc3QgaXNPYnMgPSAoeCkgPT4gKEtPPy5pc09ic2VydmFibGU/Lih4KSkgfHwgKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiB4LnN1YnNjcmliZSA9PT0gJ2Z1bmN0aW9uJyk7XG4gICAgICAgIGNvbnN0IHVuID0gKHgpID0+IEtPPy51bndyYXAgPyBLTy51bndyYXAoeCkgOiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgPyB4KCkgOiB4KTtcbiAgICAgICAgY29uc3QgbG9nID0gKC4uLmEpID0+IGxvZ2dlcj8ubG9nPy4oLi4uYSk7XG5cbiAgICAgICAgZnVuY3Rpb24gaG9va05vdygpIHtcbiAgICAgICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgICAgICBpZiAoIWVsKSByZXR1cm4gbnVsbDtcblxuICAgICAgICAgICAgbGV0IGN0eCA9IG51bGwsIGJhZyA9IG51bGwsIG9icyA9IG51bGw7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGN0eCA9IEtPPy5jb250ZXh0Rm9yID8gS08uY29udGV4dEZvcihlbCkgOiBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IGlkID0gZWwuaWQ7XG4gICAgICAgICAgICAgICAgY29uc3QgZnJvbVJvb3QgPSBpZCAmJiBjdHg/LiRyb290Py5lbGVtZW50cz8uW2lkXTtcbiAgICAgICAgICAgICAgICBjb25zdCBmcm9tRGF0YSA9IGlkICYmIGN0eD8uJGRhdGE/LmVsZW1lbnRzPy5baWRdO1xuICAgICAgICAgICAgICAgIGJhZyA9IChrb1ByZWZlciA9PT0gJ2RhdGEnID8gZnJvbURhdGEgOiBmcm9tUm9vdCkgfHwgKGtvUHJlZmVyID09PSAnZGF0YScgPyBmcm9tUm9vdCA6IGZyb21EYXRhKSB8fCBudWxsO1xuXG4gICAgICAgICAgICAgICAgaWYgKGJhZykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjYW5kID0gYmFnS2V5cy5tYXAoayA9PiBiYWdba10pLmZpbmQoQm9vbGVhbik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc09icyhjYW5kKSkgb2JzID0gY2FuZDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIW9icyAmJiBLTz8uY29udGV4dEZvcikge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkYlJhdyA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1iaW5kJykgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0gPSAvKD86dmFsdWV8dGV4dElucHV0KVxccyo6XFxzKihbXix9XSspLy5leGVjKGRiUmF3KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cHIgPSBtWzFdLnRyaW0oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV2YWxJbiA9IChvYmopID0+IHsgdHJ5IHsgcmV0dXJuIEZ1bmN0aW9uKCd3aXRoKHRoaXMpe3JldHVybiAoJyArIGV4cHIgKyAnKX0nKS5jYWxsKG9iaik7IH0gY2F0Y2ggeyByZXR1cm4gdW5kZWZpbmVkOyB9IH07XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9iZSA9IGV2YWxJbihjdHg/Lltrb1ByZWZlciA9PT0gJ2RhdGEnID8gJyRkYXRhJyA6ICckcm9vdCddKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc09icyhwcm9iZSkpIG9icyA9IHByb2JlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vb3AgKi8gfVxuXG4gICAgICAgICAgICBjb25zdCBrZW5kb1dyYXAgPSBlbC5jbG9zZXN0KHdpZGdldFNlbGVjdG9yKTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGtlbmRvV3JhcD8ucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBlbDtcblxuICAgICAgICAgICAgY29uc3QgcmVhZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgdjtcbiAgICAgICAgICAgICAgICBpZiAob2JzKSB2ID0gdW4ob2JzKTtcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChiYWcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFnVmFsID0gYmFnS2V5cy5tYXAoayA9PiBiYWdba10pLmZpbmQoQm9vbGVhbik7XG4gICAgICAgICAgICAgICAgICAgIHYgPSB0eXBlb2YgYmFnVmFsID09PSAnZnVuY3Rpb24nID8gYmFnVmFsKCkgOiBiYWdWYWw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh2ID09IG51bGwgfHwgdiA9PT0gJycpIHYgPSAoZWwudmFsdWUgPz8gZWwudGV4dENvbnRlbnQgPz8gJycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBBcnJheS5pc0FycmF5KHYpID8gdlswXSA6IHY7XG4gICAgICAgICAgICAgICAgcmV0dXJuIChzID8/ICcnKS50b1N0cmluZygpLnRyaW0oKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGZpcmUgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsID0gcmVhZCgpO1xuICAgICAgICAgICAgICAgIGlmICh2YWwgIT09ICcnICYmIHR5cGVvZiBvblZhbHVlID09PSAnZnVuY3Rpb24nKSBvblZhbHVlKHZhbCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgcXVldWVGaXJlID0gX190bUNyZWF0ZVF1aWV0RGlzcGF0Y2hlcihmaXJlLCBzZXR0bGVNcyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHVuc3VicyA9IFtdO1xuXG4gICAgICAgICAgICAvLyBJbml0aWFsIGZpcmUgKHNraXAgaWYgYmx1ci1tb2RlLCBiZWNhdXNlIHVzZXIgaGFzblx1MjAxOXQgY29uZmlybWVkIHlldClcbiAgICAgICAgICAgIGlmIChpbml0aWFsICYmIGZpcmVPbiAhPT0gJ2JsdXInKSBxdWV1ZUZpcmUoKTtcblxuICAgICAgICAgICAgLy8gS08gc3Vic2NyaXB0aW9ucyBjb2xsYXBzZSBpbnRvIGEgc2luZ2xlIHF1ZXVlZCBmaXJlXG4gICAgICAgICAgICBpZiAob2JzICYmIHR5cGVvZiBvYnMuc3Vic2NyaWJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3ViID0gb2JzLnN1YnNjcmliZSgoKSA9PiBxdWV1ZUZpcmUoKSk7XG4gICAgICAgICAgICAgICAgdW5zdWJzLnB1c2goKCkgPT4gc3ViLmRpc3Bvc2U/LigpKTtcbiAgICAgICAgICAgICAgICBsb2c/Lignd2F0Y2hCeVNlbGVjdG9yOiBLTyBvYnNlcnZhYmxlIHN1YnNjcmlwdGlvbiBhdHRhY2hlZCBmb3InLCBzZWxlY3Rvcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEJhZyB3cmFwcGVycyAob3B0aW9uYWwpXG4gICAgICAgICAgICBpZiAoYmFnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmFnVW5ob29rcyA9IFtdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHdyYXAgPSAob2JqLCBuYW1lKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghb2JqIHx8IHR5cGVvZiBvYmpbbmFtZV0gIT09ICdmdW5jdGlvbicpIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgb3JpZyA9IG9ialtuYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgb2JqW25hbWVdID0gZnVuY3Rpb24gd3JhcHBlZCguLi5hcmdzKSB7IHRyeSB7IHF1ZXVlRmlyZSgpOyB9IGNhdGNoIHsgfSByZXR1cm4gb3JpZy5hcHBseSh0aGlzLCBhcmdzKTsgfTtcbiAgICAgICAgICAgICAgICAgICAgYmFnVW5ob29rcy5wdXNoKCgpID0+IHsgb2JqW25hbWVdID0gb3JpZzsgfSk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBbJ29uY2hhbmdlJywgJ29uYmx1cicsICdvbmtleXVwJywgJ29ua2V5ZG93biddLmZvckVhY2gobiA9PiB3cmFwKGJhZywgbikpO1xuICAgICAgICAgICAgICAgIHVuc3Vicy5wdXNoKCgpID0+IGJhZ1VuaG9va3MuZm9yRWFjaChmbiA9PiB7IHRyeSB7IGZuKCk7IH0gY2F0Y2ggeyB9IH0pKTtcbiAgICAgICAgICAgICAgICBsb2c/Lignd2F0Y2hCeVNlbGVjdG9yOiBiYWcgZXZlbnQgd3JhcHBlcnMgYXR0YWNoZWQgZm9yJywgc2VsZWN0b3IpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBET00gbGlzdGVuZXJzIFx1MjAxNCBubyAnaW5wdXQnIGhhbmRsZXIgaW4gYmx1ci9jaGFuZ2UgbW9kZSA9PiBubyBrZXlzdHJva2Ugc3BhbVxuICAgICAgICAgICAgaWYgKGZpcmVPbiA9PT0gJ2JsdXInKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb25Gb2N1c091dCA9ICgpID0+IHF1ZXVlRmlyZSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG9uQ2hhbmdlID0gKCkgPT4gcXVldWVGaXJlKCk7XG4gICAgICAgICAgICAgICAgY29uc3Qgb25LZXlEb3duID0gKGUpID0+IHsgaWYgKGUua2V5ID09PSAnVGFiJyB8fCBlLmtleSA9PT0gJ0VudGVyJykgc2V0VGltZW91dChxdWV1ZUZpcmUsIDApOyB9O1xuXG4gICAgICAgICAgICAgICAgLy8gRm9jdXMtb3V0IChidWJibGluZykgaXMgbW9yZSByZWxpYWJsZSB3aXRoIEtlbmRvIHdyYXBwZXJzOyB1c2UgY2FwdHVyZVxuICAgICAgICAgICAgICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKCdmb2N1c291dCcsIG9uRm9jdXNPdXQsIHRydWUpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBvbktleURvd24pO1xuXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSB3aWRnZXQgd3JhcHBlciwgbGlzdGVuIHRoZXJlIHRvbyAoc29tZSBjb21ib3MgbW92ZSBmb2N1cylcbiAgICAgICAgICAgICAgICBpZiAoa2VuZG9XcmFwICYmIGtlbmRvV3JhcCAhPT0gdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIGtlbmRvV3JhcC5hZGRFdmVudExpc3RlbmVyKCdmb2N1c291dCcsIG9uRm9jdXNPdXQsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICBrZW5kb1dyYXAuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UsIHRydWUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IG1vID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4gcXVldWVGaXJlKCkpO1xuICAgICAgICAgICAgICAgIG1vLm9ic2VydmUodGFyZ2V0LCB7IGNoaWxkTGlzdDogdHJ1ZSwgY2hhcmFjdGVyRGF0YTogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgICAgIHVuc3Vicy5wdXNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2ZvY3Vzb3V0Jywgb25Gb2N1c091dCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5yZW1vdmVFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgb25LZXlEb3duKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGtlbmRvV3JhcCAmJiBrZW5kb1dyYXAgIT09IHRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2VuZG9XcmFwLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2ZvY3Vzb3V0Jywgb25Gb2N1c091dCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZW5kb1dyYXAucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIG1vLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb25DaGFuZ2UgPSAoKSA9PiBxdWV1ZUZpcmUoKTtcbiAgICAgICAgICAgICAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UpO1xuICAgICAgICAgICAgICAgIHVuc3Vicy5wdXNoKCgpID0+IHRhcmdldC5yZW1vdmVFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSkpO1xuICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgIGxvZz8uKCd3YXRjaEJ5U2VsZWN0b3I6IGxpc3RlbmVycyBhdHRhY2hlZCBmb3InLCBzZWxlY3RvciwgdGFyZ2V0KTtcbiAgICAgICAgICAgIHJldHVybiAoKSA9PiB7IHVuc3Vicy5mb3JFYWNoKGZuID0+IHsgdHJ5IHsgZm4oKTsgfSBjYXRjaCB7IH0gfSk7IH07XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdW5zdWIgPSBob29rTm93KCk7XG4gICAgICAgIGlmICh0eXBlb2YgdW5zdWIgPT09ICdmdW5jdGlvbicpIHJldHVybiB1bnN1YjtcblxuICAgICAgICBjb25zdCBtbyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICAgICAgICAgIHVuc3ViID0gaG9va05vdygpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB1bnN1YiA9PT0gJ2Z1bmN0aW9uJykgbW8uZGlzY29ubmVjdCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgbW8ub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBtby5kaXNjb25uZWN0KCksIHRpbWVvdXRNcyk7XG5cbiAgICAgICAgcmV0dXJuICgpID0+IHsgdHJ5IHsgdHlwZW9mIHVuc3ViID09PSAnZnVuY3Rpb24nICYmIHVuc3ViKCk7IH0gY2F0Y2ggeyB9IHRyeSB7IG1vLmRpc2Nvbm5lY3QoKTsgfSBjYXRjaCB7IH0gfTtcbiAgICB9O1xuXG4gICAgKGZ1bmN0aW9uIGluc3RhbGxUbVVybE9ic2VydmVyKCkge1xuICAgICAgICBpZiAod2luZG93Ll9fdG1VcmxPYnNJbnN0YWxsZWQpIHJldHVybjtcbiAgICAgICAgd2luZG93Ll9fdG1VcmxPYnNJbnN0YWxsZWQgPSB0cnVlO1xuXG4gICAgICAgIGNvbnN0IEVWID0gJ3RtdXRpbHM6dXJsY2hhbmdlJztcbiAgICAgICAgY29uc3QgZmlyZSA9ICgpID0+IHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudChFVikpO1xuXG4gICAgICAgIGNvbnN0IG9yaWdQdXNoID0gaGlzdG9yeS5wdXNoU3RhdGU7XG4gICAgICAgIGhpc3RvcnkucHVzaFN0YXRlID0gZnVuY3Rpb24gKCkgeyBjb25zdCByID0gb3JpZ1B1c2guYXBwbHkodGhpcywgYXJndW1lbnRzKTsgZmlyZSgpOyByZXR1cm4gcjsgfTtcblxuICAgICAgICBjb25zdCBvcmlnUmVwbGFjZSA9IGhpc3RvcnkucmVwbGFjZVN0YXRlO1xuICAgICAgICBoaXN0b3J5LnJlcGxhY2VTdGF0ZSA9IGZ1bmN0aW9uICgpIHsgY29uc3QgciA9IG9yaWdSZXBsYWNlLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7IGZpcmUoKTsgcmV0dXJuIHI7IH07XG5cbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BvcHN0YXRlJywgZmlyZSk7XG5cbiAgICAgICAgVE1VdGlscy5vblVybENoYW5nZSA9IGZ1bmN0aW9uIG9uVXJsQ2hhbmdlKGNiKSB7XG4gICAgICAgICAgICBjb25zdCBoID0gKCkgPT4gY2IobG9jYXRpb24pO1xuICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoRVYsIGgpO1xuICAgICAgICAgICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKEVWLCBoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBUTVV0aWxzLl9kaXNwYXRjaFVybENoYW5nZSA9IGZpcmU7IC8vIG9wdGlvbmFsOiBtYW51YWwgdHJpZ2dlclxuICAgIH0pKCk7XG5cbiAgICBUTVV0aWxzLm9ic2VydmVJbnNlcnRNYW55ID0gZnVuY3Rpb24gb2JzZXJ2ZUluc2VydE1hbnkoc2VsZWN0b3IsIGNhbGxiYWNrLCB7IHJvb3QgPSBkb2N1bWVudC5ib2R5LCBzdWJ0cmVlID0gdHJ1ZSB9ID0ge30pIHtcbiAgICAgICAgY29uc3Qgc2VlbiA9IG5ldyBXZWFrU2V0KCk7XG5cbiAgICAgICAgZnVuY3Rpb24gcnVuT24oY3R4KSB7XG4gICAgICAgICAgICBpZiAoY3R4ICYmIGN0eC5ub2RlVHlwZSA9PT0gMSkge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY3R4Lm1hdGNoZXMgPT09ICdmdW5jdGlvbicgJiYgY3R4Lm1hdGNoZXMoc2VsZWN0b3IpICYmICFzZWVuLmhhcyhjdHgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlZW4uYWRkKGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IGNhbGxiYWNrKGN0eCk7IH0gY2F0Y2ggKGUpIHsgY29uc29sZS5lcnJvcignb2JzZXJ2ZUluc2VydE1hbnkgY2FsbGJhY2sgZXJyb3I6JywgZSk7IH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjdHgucXVlcnlTZWxlY3RvckFsbCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICBjdHgucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW4uaGFzKGVsKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlZW4uYWRkKGVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkgeyBjYWxsYmFjayhlbCk7IH0gY2F0Y2ggKGUpIHsgY29uc29sZS5lcnJvcignb2JzZXJ2ZUluc2VydE1hbnkgY2FsbGJhY2sgZXJyb3I6JywgZSk7IH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgbSBvZiBtdXRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKG0uYWRkZWROb2RlcyAmJiBtLmFkZGVkTm9kZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIG0uYWRkZWROb2Rlcy5mb3JFYWNoKHJ1bk9uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIG1vLm9ic2VydmUocm9vdCwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWUgfSk7XG4gICAgICAgIC8vIGZpcmUgZm9yIGFueXRoaW5nIGFscmVhZHkgb24gdGhlIHBhZ2VcbiAgICAgICAgcnVuT24ocm9vdCk7XG5cbiAgICAgICAgLy8gcmV0dXJuIGRpc3Bvc2VyXG4gICAgICAgIHJldHVybiAoKSA9PiBtby5kaXNjb25uZWN0KCk7XG4gICAgfTtcblxuICAgIFRNVXRpbHMuc2xlZXAgPSAobXMpID0+IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBtcykpO1xuXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBOZXR3b3JrIHdhdGNoZXIgKEFkZFVwZGF0ZUZvcm0gMTAwMzIpIFx1MjAxNCBmZXRjaCArIFhIUlxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIChmdW5jdGlvbiBhZGROZXRXYXRjaGVyKCkge1xuICAgICAgICBjb25zdCByb290ID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICAgICAgY29uc3QgVE1VID0gd2luZG93LlRNVXRpbHM7ICAgICAgICAgICAgLy8gc2FtZSBvYmplY3QgeW91IGV4cG9ydCBhdCB0aGUgZW5kXG4gICAgICAgIFRNVS5uZXQgPSBUTVUubmV0IHx8IHt9O1xuXG4gICAgICAgIFRNVS5uZXQuZW5zdXJlV2F0Y2hlciA9IGZ1bmN0aW9uIGVuc3VyZVdhdGNoZXIoKSB7XG4gICAgICAgICAgICBpZiAocm9vdC5fX2x0TmV0UGF0Y2hlZCkgcmV0dXJuO1xuICAgICAgICAgICAgcm9vdC5fX2x0TmV0UGF0Y2hlZCA9IHRydWU7XG5cbiAgICAgICAgICAgIC8vIC0tLS0gZmV0Y2goKSAtLS0tXG4gICAgICAgICAgICBjb25zdCBvcmlnRmV0Y2ggPSByb290LmZldGNoICYmIHJvb3QuZmV0Y2guYmluZChyb290KTtcbiAgICAgICAgICAgIGlmIChvcmlnRmV0Y2gpIHtcbiAgICAgICAgICAgICAgICByb290LmZldGNoID0gZnVuY3Rpb24gKGlucHV0LCBpbml0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXEgPSAoaW5wdXQgaW5zdGFuY2VvZiBSZXF1ZXN0KSA/IGlucHV0IDogbmV3IFJlcXVlc3QoaW5wdXQsIGluaXQgfHwge30pO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdXJsID0gU3RyaW5nKHJlcS51cmwgfHwgJycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbWV0aG9kID0gKHJlcS5tZXRob2QgfHwgKGluaXQgJiYgaW5pdC5tZXRob2QpIHx8ICdHRVQnKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzVGFyZ2V0KHVybCwgbWV0aG9kKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcS5jbG9uZSgpLmFycmF5QnVmZmVyKCkudGhlbihidWYgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdCA9IHJlcS5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJykgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBwYXJzZUJvZHlGcm9tQnVmZmVyKGJ1ZiwgY3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBUTVUubmV0Ll9oYW5kbGVBZGRVcGRhdGUodXJsLCBib2R5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7IH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb3JpZ0ZldGNoKGlucHV0LCBpbml0KTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyAtLS0tIFhIUiAtLS0tXG4gICAgICAgICAgICBjb25zdCBYSFIgPSByb290LlhNTEh0dHBSZXF1ZXN0O1xuICAgICAgICAgICAgaWYgKFhIUiAmJiBYSFIucHJvdG90eXBlKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb3BlbiA9IFhIUi5wcm90b3R5cGUub3BlbjtcbiAgICAgICAgICAgICAgICBjb25zdCBzZW5kID0gWEhSLnByb3RvdHlwZS5zZW5kO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNldFJlcXVlc3RIZWFkZXIgPSBYSFIucHJvdG90eXBlLnNldFJlcXVlc3RIZWFkZXI7XG5cbiAgICAgICAgICAgICAgICBYSFIucHJvdG90eXBlLm9wZW4gPSBmdW5jdGlvbiAobWV0aG9kLCB1cmwpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fX2x0TWV0aG9kID0gU3RyaW5nKG1ldGhvZCB8fCAnR0VUJykudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fX2x0VXJsID0gU3RyaW5nKHVybCB8fCAnJyk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX19sdEhlYWRlcnMgPSB7fTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9wZW4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIFhIUi5wcm90b3R5cGUuc2V0UmVxdWVzdEhlYWRlciA9IGZ1bmN0aW9uIChrLCB2KSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IHRoaXMuX19sdEhlYWRlcnNbay50b0xvd2VyQ2FzZSgpXSA9IHY7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzZXRSZXF1ZXN0SGVhZGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBYSFIucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbiAoYm9keSkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdXJsID0gdGhpcy5fX2x0VXJsIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbWV0aG9kID0gdGhpcy5fX2x0TWV0aG9kIHx8ICdHRVQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzVGFyZ2V0KHVybCwgbWV0aG9kKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN0ID0gKHRoaXMuX19sdEhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddIHx8ICcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgb2JqID0ge307XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBib2R5ID09PSAnc3RyaW5nJykgb2JqID0gcGFyc2VCb2R5RnJvbVN0cmluZyhib2R5LCBjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoYm9keSBpbnN0YW5jZW9mIFVSTFNlYXJjaFBhcmFtcykgb2JqID0gT2JqZWN0LmZyb21FbnRyaWVzKGJvZHkuZW50cmllcygpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChyb290LkZvcm1EYXRhICYmIGJvZHkgaW5zdGFuY2VvZiBGb3JtRGF0YSkgb2JqID0gT2JqZWN0LmZyb21FbnRyaWVzKGJvZHkuZW50cmllcygpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBUTVUubmV0Ll9oYW5kbGVBZGRVcGRhdGUodXJsLCBvYmopO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2VuZC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgVE1VLm5ldC5vbkFkZFVwZGF0ZSA9IGZ1bmN0aW9uIG9uQWRkVXBkYXRlKGZuKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSByZXR1cm4gKCkgPT4geyB9O1xuICAgICAgICAgICAgY29uc3QgaCA9IChlKSA9PiBmbihlLmRldGFpbCB8fCB7fSk7XG4gICAgICAgICAgICByb290LmFkZEV2ZW50TGlzdGVuZXIoJ0xUOlF1b3RlUGFydEFkZFVwZGF0ZUZvcm0nLCBoKTtcbiAgICAgICAgICAgIHJldHVybiAoKSA9PiByb290LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0xUOlF1b3RlUGFydEFkZFVwZGF0ZUZvcm0nLCBoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBUTVUubmV0LmdldExhc3RBZGRVcGRhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoVE1VLnN0YXRlPy5sYXN0QWRkVXBkYXRlRm9ybSkgcmV0dXJuIFRNVS5zdGF0ZS5sYXN0QWRkVXBkYXRlRm9ybTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oJ0xUX0xBU1RfQUREVVBEQVRFRk9STScpO1xuICAgICAgICAgICAgICAgIHJldHVybiBzID8gSlNPTi5wYXJzZShzKSA6IG51bGw7XG4gICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIG51bGw7IH1cbiAgICAgICAgfTtcblxuICAgICAgICAvLyAtLS0tIGludGVybmFscyAtLS0tXG4gICAgICAgIGZ1bmN0aW9uIGlzVGFyZ2V0KHVybCwgbWV0aG9kKSB7XG4gICAgICAgICAgICByZXR1cm4gbWV0aG9kID09PSAnUE9TVCdcbiAgICAgICAgICAgICAgICAmJiAvXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVBhcnRcXC9BZGRVcGRhdGVGb3JtL2kudGVzdCh1cmwpXG4gICAgICAgICAgICAgICAgJiYgLyg/OlxcP3wmKXNvdXJjZUFjdGlvbktleT0xMDAzMig/OiZ8JCkvaS50ZXN0KHVybCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBwYXJzZUJvZHlGcm9tQnVmZmVyKGJ1ZiwgY29udGVudFR5cGUpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShidWYgfHwgbmV3IFVpbnQ4QXJyYXkoKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlQm9keUZyb21TdHJpbmcodGV4dCwgY29udGVudFR5cGUpO1xuICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiB7fTsgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcGFyc2VCb2R5RnJvbVN0cmluZyh0ZXh0LCBjb250ZW50VHlwZSkge1xuICAgICAgICAgICAgaWYgKCF0ZXh0KSByZXR1cm4ge307XG4gICAgICAgICAgICBjb25zdCBjdCA9IChjb250ZW50VHlwZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGlmIChjdC5pbmNsdWRlcygnYXBwbGljYXRpb24vanNvbicpIHx8IC9eW1xcc3tcXFtdLy50ZXN0KHRleHQpKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgcmV0dXJuIEpTT04ucGFyc2UodGV4dCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY3QuaW5jbHVkZXMoJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcpIHx8IHRleHQuaW5jbHVkZXMoJz0nKSkge1xuICAgICAgICAgICAgICAgIHRyeSB7IHJldHVybiBPYmplY3QuZnJvbUVudHJpZXMobmV3IFVSTFNlYXJjaFBhcmFtcyh0ZXh0KS5lbnRyaWVzKCkpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgVE1VLm5ldC5faGFuZGxlQWRkVXBkYXRlID0gZnVuY3Rpb24gKHVybCwgcGF5bG9hZCkge1xuICAgICAgICAgICAgY29uc3QgcXVvdGVLZXkgPVxuICAgICAgICAgICAgICAgIE51bWJlcihwYXlsb2FkPy5RdW90ZUtleSkgfHxcbiAgICAgICAgICAgICAgICBOdW1iZXIoKC9bPyZdUXVvdGVLZXk9KFxcZCspL2kuZXhlYyh1cmwpIHx8IFtdKVsxXSkgfHxcbiAgICAgICAgICAgICAgICB1bmRlZmluZWQ7XG5cbiAgICAgICAgICAgIGNvbnN0IGhhc1BhcnRObyA9XG4gICAgICAgICAgICAgICAgISEocGF5bG9hZD8uUGFydE5vIHx8IHBheWxvYWQ/LlBhcnRLZXkgfHwgcGF5bG9hZD8uUGFydE5hbWUpIHx8XG4gICAgICAgICAgICAgICAgKEFycmF5LmlzQXJyYXkocGF5bG9hZD8uX19yZXZpc2lvblRyYWNraW5nRGF0YSkgJiZcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZC5fX3JldmlzaW9uVHJhY2tpbmdEYXRhLnNvbWUoeCA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh4LnJldmlzaW9uVHJhY2tpbmdFbnRyaWVzKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgeC5yZXZpc2lvblRyYWNraW5nRW50cmllcy5zb21lKGUgPT4gL1BhcnQgTm8vaS50ZXN0KGU/LkZpZWxkIHx8ICcnKSlcbiAgICAgICAgICAgICAgICAgICAgKSk7XG5cbiAgICAgICAgICAgIGNvbnN0IGRldGFpbCA9IHtcbiAgICAgICAgICAgICAgICB1cmwsXG4gICAgICAgICAgICAgICAgcXVvdGVLZXksXG4gICAgICAgICAgICAgICAgaGFzUGFydE5vLFxuICAgICAgICAgICAgICAgIHBhcnRObzogcGF5bG9hZD8uUGFydE5vID8/IG51bGwsXG4gICAgICAgICAgICAgICAgY3VzdG9tZXJQYXJ0Tm86IHBheWxvYWQ/LkN1c3RvbWVyUGFydE5vID8/IG51bGwsXG4gICAgICAgICAgICAgICAgcGFydEtleTogcGF5bG9hZD8uUGFydEtleSA/PyBudWxsLFxuICAgICAgICAgICAgICAgIGF0OiBEYXRlLm5vdygpXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBUTVUuc3RhdGUgPSBUTVUuc3RhdGUgfHwge307XG4gICAgICAgICAgICBUTVUuc3RhdGUubGFzdEFkZFVwZGF0ZUZvcm0gPSBkZXRhaWw7XG4gICAgICAgICAgICB0cnkgeyBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKCdMVF9MQVNUX0FERFVQREFURUZPUk0nLCBKU09OLnN0cmluZ2lmeShkZXRhaWwpKTsgfSBjYXRjaCB7IH1cblxuICAgICAgICAgICAgdHJ5IHsgcm9vdC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnTFQ6UXVvdGVQYXJ0QWRkVXBkYXRlRm9ybScsIHsgZGV0YWlsIH0pKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgfTtcbiAgICB9KSgpO1xuXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBcdUQ4M0RcdUREMDEgR2xvYmFsIGV4cG9zdXJlIGZvciBUYW1wZXJNb25rZXkgc2FuZGJveFxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5hc3NpZ24oVE1VdGlscywge1xuICAgICAgICBnZXRBcGlLZXksXG4gICAgICAgIGZldGNoRGF0YTogVE1VdGlscy5mZXRjaERhdGEsIFxuICAgICAgICB3YWl0Rm9yTW9kZWxBc3luYyxcbiAgICAgICAgd2F0Y2hCeUxhYmVsOiBUTVV0aWxzLndhdGNoQnlMYWJlbCxcbiAgICAgICAgYXdhaXRWYWx1ZUJ5TGFiZWw6IFRNVXRpbHMuYXdhaXRWYWx1ZUJ5TGFiZWwsXG4gICAgICAgIHdhdGNoQnlTZWxlY3RvcjogVE1VdGlscy53YXRjaEJ5U2VsZWN0b3IsXG4gICAgICAgIG9ic2VydmVJbnNlcnRNYW55OiBUTVV0aWxzLm9ic2VydmVJbnNlcnRNYW55LFxuICAgICAgICBzaG93TWVzc2FnZSwgaGlkZU1lc3NhZ2UsIG9ic2VydmVJbnNlcnQsXG4gICAgICAgIHNlbGVjdE9wdGlvbkJ5VGV4dCwgc2VsZWN0T3B0aW9uQnlWYWx1ZSxcbiAgICAgICAgdG9hc3QsXG4gICAgICAgIGxvZywgd2FybiwgZXJyb3IsIG9rLFxuICAgICAgICBlbnN1cmVSb3V0ZSwgb25Sb3V0ZUNoYW5nZSwgbWF0Y2hSb3V0ZSxcbiAgICAgICAgc2V0RGVidWcsIG1ha2VMb2dnZXIsIGdldExvZ2dlciwgYXR0YWNoTG9nZ2VyR2xvYmFsLFxuICAgICAgICBkczogVE1VdGlscy5kcywgZHNSb3dzOiBUTVV0aWxzLmRzUm93cyxcbiAgICAgICAgbmV0OiBUTVV0aWxzLm5ldCxcblxuICAgIH0pO1xufSkod2luZG93KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBY0EsR0FBQyxTQUFVQSxTQUFRO0FBQ2Y7QUFNQSxVQUFNLFVBQVUsQ0FBQztBQUNqQixJQUFBQSxRQUFPLFVBQVU7QUFDakIsUUFBSSxPQUFPLGlCQUFpQixZQUFhLGNBQWEsVUFBVTtBQUdoRSxRQUFJLEVBQUUsbUJBQW1CLFNBQVUsU0FBUSxnQkFBZ0I7QUFHM0QsYUFBUyxlQUFlLEtBQUs7QUFDekIsVUFBSSxDQUFDLElBQUssUUFBTztBQUNqQixVQUFJLHFCQUFxQixLQUFLLEdBQUcsRUFBRyxRQUFP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QSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0EsUUFBUSxTQUFTLFVBQVU7QUFBQSxVQUMzQixnQkFBZ0IsU0FBUyxrQkFBa0I7QUFBQSxVQUMzQyxTQUFTLFNBQVMsV0FBVztBQUFBLFVBQzdCLElBQUksS0FBSyxJQUFJO0FBQUEsUUFDakI7QUFFQSxZQUFJLFFBQVEsSUFBSSxTQUFTLENBQUM7QUFDMUIsWUFBSSxNQUFNLG9CQUFvQjtBQUM5QixZQUFJO0FBQUUseUJBQWUsUUFBUSx5QkFBeUIsS0FBSyxVQUFVLE1BQU0sQ0FBQztBQUFBLFFBQUcsUUFBUTtBQUFBLFFBQUU7QUFFekYsWUFBSTtBQUFFLGVBQUssY0FBYyxJQUFJLFlBQVksNkJBQTZCLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFBQSxRQUFHLFFBQVE7QUFBQSxRQUFFO0FBQUEsTUFDbEc7QUFBQSxJQUNKLEdBQUc7QUFNSCxXQUFPLE9BQU8sU0FBUztBQUFBLE1BQ25CO0FBQUEsTUFDQSxXQUFXLFFBQVE7QUFBQSxNQUNuQjtBQUFBLE1BQ0EsY0FBYyxRQUFRO0FBQUEsTUFDdEIsbUJBQW1CLFFBQVE7QUFBQSxNQUMzQixpQkFBaUIsUUFBUTtBQUFBLE1BQ3pCLG1CQUFtQixRQUFRO0FBQUEsTUFDM0I7QUFBQSxNQUFhO0FBQUEsTUFBYTtBQUFBLE1BQzFCO0FBQUEsTUFBb0I7QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUFLO0FBQUEsTUFBTTtBQUFBLE1BQU87QUFBQSxNQUNsQjtBQUFBLE1BQWE7QUFBQSxNQUFlO0FBQUEsTUFDNUI7QUFBQSxNQUFVO0FBQUEsTUFBWTtBQUFBLE1BQVc7QUFBQSxNQUNqQyxJQUFJLFFBQVE7QUFBQSxNQUFJLFFBQVEsUUFBUTtBQUFBLE1BQ2hDLEtBQUssUUFBUTtBQUFBLElBRWpCLENBQUM7QUFBQSxFQUNMLEdBQUcsTUFBTTsiLAogICJuYW1lcyI6IFsid2luZG93IiwgIm9rIiwgInJvb3QiLCAiS08iLCAiaXNBcnJheVRhcmdldCIsICJjdXIiLCAibG9nIiwgIm1vIl0KfQo=
