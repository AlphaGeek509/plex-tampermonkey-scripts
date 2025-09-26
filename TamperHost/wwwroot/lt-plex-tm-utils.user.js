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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LXBsZXgtdG0tdXRpbHMudXNlci5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gPT1Vc2VyU2NyaXB0PT1cbi8vIEBuYW1lICAgICAgICAgTFQgXHUyMDNBIFBsZXggVE0gVXRpbHNcbi8vIEBuYW1lc3BhY2UgICAgaHR0cHM6Ly9naXRodWIuY29tL0FscGhhR2VlazUwOS9wbGV4LXRhbXBlcm1vbmtleS1zY3JpcHRzXG4vLyBAdmVyc2lvbiAgICAgIDMuOC4xMjdcbi8vIEBkZXNjcmlwdGlvbiAgU2hhcmVkIHV0aWxpdGllc1xuLy8gQG1hdGNoICAgICAgICBodHRwczovLyoub24ucGxleC5jb20vKlxuLy8gQG1hdGNoICAgICAgICBodHRwczovLyoucGxleC5jb20vKlxuLy8gQGdyYW50ICAgICAgICBHTV94bWxodHRwUmVxdWVzdFxuLy8gQGdyYW50ICAgICAgICB1bnNhZmVXaW5kb3dcbi8vIEBncmFudCAgICAgICAgR01fZ2V0VmFsdWVcbi8vIEBncmFudCAgICAgICAgR01fc2V0VmFsdWVcbi8vIEBjb25uZWN0ICAgICAgKi5wbGV4LmNvbVxuLy8gPT0vVXNlclNjcmlwdD09XG5cbihmdW5jdGlvbiAod2luZG93KSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gRU5WIC8gRkxBR1NcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBDcmVhdGUgKyBleHBvc2UgZmlyc3Qgc28gd2UgY2FuIHNhZmVseSBhdHRhY2ggcHJvcHMgYmVsb3dcbiAgICBjb25zdCBUTVV0aWxzID0ge307XG4gICAgd2luZG93LlRNVXRpbHMgPSBUTVV0aWxzO1xuICAgIGlmICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJykgdW5zYWZlV2luZG93LlRNVXRpbHMgPSBUTVV0aWxzO1xuXG4gICAgLy8gZW5zdXJlIGEgcGxhY2UgdG8gY2FjaGUgdGhlIGtleSBsaXZlcyBvbiB0aGUgc2hhcmVkIG9iamVjdFxuICAgIGlmICghKCdfX2FwaUtleUNhY2hlJyBpbiBUTVV0aWxzKSkgVE1VdGlscy5fX2FwaUtleUNhY2hlID0gbnVsbDtcblxuICAgIC8vIE5vcm1hbGl6ZSBsaWtlIHRoZSBhdXRoIGhlbHBlciAoYWNjZXB0cyBcInVzZXI6cGFzc1wiLCBcIkJhc2ljIFx1MjAyNlwiLCBcIkJlYXJlciBcdTIwMjZcIilcbiAgICBmdW5jdGlvbiBfbm9ybWFsaXplQXV0aChyYXcpIHtcbiAgICAgICAgaWYgKCFyYXcpIHJldHVybiAnJztcbiAgICAgICAgaWYgKC9eKEJhc2ljfEJlYXJlcilcXHMvaS50ZXN0KHJhdykpIHJldHVybiByYXcudHJpbSgpO1xuICAgICAgICAvLyBBY2NlcHQgXCJ1c2VyOnBhc3NcIiBhbmQgZW5jb2RlIGFzIEJhc2ljXG4gICAgICAgIHRyeSB7IHJldHVybiBgQmFzaWMgJHtidG9hKHJhdy50cmltKCkpfWA7IH0gY2F0Y2ggeyByZXR1cm4gJyc7IH1cbiAgICB9XG5cbiAgICAvLyBSZXNvbHZlIEFQSSBrZXkgYWNyb3NzIHJvdXRlczogcHJlZmVyIFBsZXhBdXRoL1BsZXhBUEksIGZhbGxiYWNrIHRvIEdNL2xvY2FsU3RvcmFnZS5cbiAgICAvLyBNaXJyb3JzIHRoZSByZXNvbHZlZCBrZXkgdG8gbG9jYWxTdG9yYWdlICsgR00gc28gZnV0dXJlIGxvYWRzIG9uIHRoaXMgc3ViZG9tYWluIGRvblx1MjAxOXQgbmVlZCB0byB3YWl0LlxuICAgIGFzeW5jIGZ1bmN0aW9uIGdldEFwaUtleSh7XG4gICAgICAgIHdhaXQgPSBmYWxzZSwgICAgICAgLy8gc2V0IHRydWUgb24gcm91dGVzIHRoYXQgbG9hZCBQbGV4QXV0aCBsYXRlXG4gICAgICAgIHRpbWVvdXRNcyA9IDAsXG4gICAgICAgIHBvbGxNcyA9IDIwMCxcbiAgICAgICAgdXNlQ2FjaGUgPSB0cnVlLFxuICAgICAgICBjYWNoZU1zID0gNSAqIDYwXzAwMFxuICAgIH0gPSB7fSkge1xuICAgICAgICAvLyBjYWNoZSBmYXN0LXBhdGggKGxpdmVzIG9uIFRNVXRpbHMgdG8gYXZvaWQgc2NvcGUgaXNzdWVzKVxuICAgICAgICBjb25zdCBjYWNoZWQgPSBUTVV0aWxzLl9fYXBpS2V5Q2FjaGU7XG4gICAgICAgIGlmICh1c2VDYWNoZSAmJiBjYWNoZWQgJiYgKERhdGUubm93KCkgLSBjYWNoZWQudHMpIDwgY2FjaGVNcykge1xuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZC52YWx1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJvb3QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xuXG4gICAgICAgIGNvbnN0IHJlc29sdmVHZXR0ZXIgPSAoKSA9PlxuICAgICAgICAgICAgKHJvb3Q/LlBsZXhBdXRoICYmIHR5cGVvZiByb290LlBsZXhBdXRoLmdldEtleSA9PT0gJ2Z1bmN0aW9uJyAmJiByb290LlBsZXhBdXRoLmdldEtleSkgfHxcbiAgICAgICAgICAgIChyb290Py5QbGV4QVBJICYmIHR5cGVvZiByb290LlBsZXhBUEkuZ2V0S2V5ID09PSAnZnVuY3Rpb24nICYmIHJvb3QuUGxleEFQSS5nZXRLZXkpIHx8XG4gICAgICAgICAgICBudWxsO1xuXG4gICAgICAgIGxldCBnZXR0ZXIgPSByZXNvbHZlR2V0dGVyKCk7XG5cbiAgICAgICAgaWYgKCFnZXR0ZXIgJiYgd2FpdCAmJiB0aW1lb3V0TXMgPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICB3aGlsZSAoIWdldHRlciAmJiAoRGF0ZS5ub3coKSAtIHN0YXJ0KSA8IHRpbWVvdXRNcykge1xuICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBwb2xsTXMpKTtcbiAgICAgICAgICAgICAgICBnZXR0ZXIgPSByZXNvbHZlR2V0dGVyKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyAxKSBQcmVmZXJyZWQ6IGhlbHBlciBvYmplY3QgaWYgYXZhaWxhYmxlXG4gICAgICAgIGlmIChnZXR0ZXIpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsID0gZ2V0dGVyLmNhbGwocm9vdCk7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gKHZhbCAmJiB0eXBlb2YgdmFsLnRoZW4gPT09ICdmdW5jdGlvbicpID8gYXdhaXQgdmFsIDogdmFsO1xuICAgICAgICAgICAgICAgIGNvbnN0IG91dCA9IF9ub3JtYWxpemVBdXRoKGtleSk7XG4gICAgICAgICAgICAgICAgaWYgKG91dCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBNaXJyb3Igc28gc3Vic2VxdWVudCBsb2FkcyBvbiB0aGlzIHN1YmRvbWFpbiBkb25cdTIwMTl0IGRlcGVuZCBvbiB0aGUgaGVscGVyIGJlaW5nIHByZXNlbnRcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ1BsZXhBcGlLZXknLCBvdXQpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgICAgICB0cnkgeyBpZiAodHlwZW9mIEdNX3NldFZhbHVlID09PSAnZnVuY3Rpb24nKSBHTV9zZXRWYWx1ZSgnUGxleEFwaUtleScsIG91dCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgIGlmICh1c2VDYWNoZSkgVE1VdGlscy5fX2FwaUtleUNhY2hlID0geyB2YWx1ZTogb3V0LCB0czogRGF0ZS5ub3coKSB9O1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBmYWxsIHRocm91Z2ggKi8gfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gMikgRmFsbGJhY2s6IEdNIHN0b3JlIChhdXRob3JpdGF0aXZlIGlmIHNldCB2aWEgbWVudSlcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJhd0dNID0gdHlwZW9mIEdNX2dldFZhbHVlID09PSAnZnVuY3Rpb24nID8gR01fZ2V0VmFsdWUoJ1BsZXhBcGlLZXknLCAnJykgOiAnJztcbiAgICAgICAgICAgIGlmIChyYXdHTSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG91dCA9IF9ub3JtYWxpemVBdXRoKHJhd0dNKTtcbiAgICAgICAgICAgICAgICBpZiAodXNlQ2FjaGUpIFRNVXRpbHMuX19hcGlLZXlDYWNoZSA9IHsgdmFsdWU6IG91dCwgdHM6IERhdGUubm93KCkgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuXG4gICAgICAgIC8vIDMpIEZhbGxiYWNrOiBsb2NhbFN0b3JhZ2Ugb24gdGhpcyBzdWJkb21haW5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJhd0xTID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ1BsZXhBcGlLZXknKSB8fCAnJztcbiAgICAgICAgICAgIGlmIChyYXdMUykge1xuICAgICAgICAgICAgICAgIGNvbnN0IG91dCA9IF9ub3JtYWxpemVBdXRoKHJhd0xTKTtcbiAgICAgICAgICAgICAgICBpZiAodXNlQ2FjaGUpIFRNVXRpbHMuX19hcGlLZXlDYWNoZSA9IHsgdmFsdWU6IG91dCwgdHM6IERhdGUubm93KCkgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuXG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cblxuICAgIC8vIExvdy1sZXZlbDogb25lIHBsYWNlIHRoYXQgYWN0dWFsbHkgZXhlY3V0ZXMgdGhlIEhUVFAgY2FsbFxuICAgIFRNVXRpbHMuZmV0Y2hEYXRhID0gYXN5bmMgZnVuY3Rpb24gZmV0Y2hEYXRhKHVybCwgeyBtZXRob2QgPSAnR0VUJywgaGVhZGVycyA9IHt9LCBib2R5LCB0aW1lb3V0TXMgPSAxNTAwMCwgdXNlWEhSID0gZmFsc2UgfSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBfbm9ybWFsaXplQXV0aChhd2FpdCBUTVV0aWxzLmdldEFwaUtleSgpLmNhdGNoKCgpID0+ICcnKSk7XG5cbiAgICAgICAgY29uc3QgZmluYWxIZWFkZXJzID0ge1xuICAgICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgIC4uLihib2R5ID8geyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb247Y2hhcnNldD1VVEYtOCcgfSA6IHt9KSxcbiAgICAgICAgICAgIC4uLihhdXRoID8geyAnQXV0aG9yaXphdGlvbic6IGF1dGggfSA6IHt9KSxcbiAgICAgICAgICAgIC4uLmhlYWRlcnNcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IHR5cGVvZiBib2R5ID09PSAnc3RyaW5nJyA/IGJvZHkgOiAoYm9keSA/IEpTT04uc3RyaW5naWZ5KGJvZHkpIDogdW5kZWZpbmVkKTtcblxuICAgICAgICBpZiAodXNlWEhSICYmIHR5cGVvZiBHTV94bWxodHRwUmVxdWVzdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4gcmVqZWN0KG5ldyBFcnJvcignTmV0d29yayB0aW1lb3V0JykpLCB0aW1lb3V0TXMpO1xuICAgICAgICAgICAgICAgIEdNX3htbGh0dHBSZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kLCB1cmwsIGhlYWRlcnM6IGZpbmFsSGVhZGVycywgZGF0YTogcGF5bG9hZCwgdGltZW91dDogdGltZW91dE1zLFxuICAgICAgICAgICAgICAgICAgICBvbmxvYWQ6IChyZXMpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvayA9IHJlcy5zdGF0dXMgPj0gMjAwICYmIHJlcy5zdGF0dXMgPCAzMDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW9rKSByZXR1cm4gcmVqZWN0KG5ldyBFcnJvcihgJHtyZXMuc3RhdHVzfSAke3Jlcy5zdGF0dXNUZXh0IHx8ICdSZXF1ZXN0IGZhaWxlZCd9YCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHsgcmVzb2x2ZShKU09OLnBhcnNlKHJlcy5yZXNwb25zZVRleHQgfHwgJ3t9JykpOyB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRjaCB7IHJlc29sdmUoe30pOyB9IC8vIHRvbGVyYXRlIGVtcHR5L2ludmFsaWQganNvbiA9PiB7fVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBvbmVycm9yOiAoKSA9PiB7IGNsZWFyVGltZW91dCh0aW1lcik7IHJlamVjdChuZXcgRXJyb3IoJ05ldHdvcmsgZXJyb3InKSk7IH0sXG4gICAgICAgICAgICAgICAgICAgIG9udGltZW91dDogKCkgPT4geyBjbGVhclRpbWVvdXQodGltZXIpOyByZWplY3QobmV3IEVycm9yKCdOZXR3b3JrIHRpbWVvdXQnKSk7IH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZmV0Y2ggcGF0aFxuICAgICAgICBjb25zdCBjdHJsID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgICAgICBjb25zdCB0ID0gc2V0VGltZW91dCgoKSA9PiBjdHJsLmFib3J0KCksIHRpbWVvdXRNcyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgZmV0Y2godXJsLCB7XG4gICAgICAgICAgICAgICAgbWV0aG9kLFxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IGZpbmFsSGVhZGVycyxcbiAgICAgICAgICAgICAgICBib2R5OiBwYXlsb2FkLFxuICAgICAgICAgICAgICAgIHNpZ25hbDogY3RybC5zaWduYWwsXG4gICAgICAgICAgICAgICAgY3JlZGVudGlhbHM6ICdpbmNsdWRlJyAgIC8vIGtlZXAgc2FtZS1vcmlnaW4gY29va2llcyB3aGVyZSBuZWVkZWRcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3Aub2spIHRocm93IG5ldyBFcnJvcihgJHtyZXNwLnN0YXR1c30gJHtyZXNwLnN0YXR1c1RleHR9YCk7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgcmVzcC50ZXh0KCk7XG4gICAgICAgICAgICByZXR1cm4gdGV4dCA/IEpTT04ucGFyc2UodGV4dCkgOiB7fTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0KTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyBEUyBoZWxwZXJzOiB0aGUgb25seSBBUEkgeW91ciB1c2Vyc2NyaXB0cyBuZWVkIHRvIGNhbGxcbiAgICBUTVV0aWxzLmRzID0gYXN5bmMgZnVuY3Rpb24gZHMoc291cmNlSWQsIHBheWxvYWQsIG9wdHMgPSB7fSkge1xuICAgICAgICBjb25zdCB1cmwgPSBgJHtsb2NhdGlvbi5vcmlnaW59L2FwaS9kYXRhc291cmNlcy8ke3NvdXJjZUlkfS9leGVjdXRlP2Zvcm1hdD0yYDtcbiAgICAgICAgY29uc3QganNvbiA9IGF3YWl0IFRNVXRpbHMuZmV0Y2hEYXRhKHVybCwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogcGF5bG9hZCwgLi4ub3B0cyB9KTtcbiAgICAgICAgLy8gbm9ybWFsaXplOiBhbHdheXMgcmV0dXJuIHsgcm93czogWy4uLl0gfVxuICAgICAgICBjb25zdCByb3dzID0gQXJyYXkuaXNBcnJheShqc29uPy5yb3dzKSA/IGpzb24ucm93cyA6IFtdO1xuICAgICAgICByZXR1cm4geyAuLi5qc29uLCByb3dzIH07IC8vIGtlZXAgYW55IGV4dHJhIGZpZWxkcyBpZiBQbGV4IGFkZHMgdGhlbVxuICAgIH07XG5cbiAgICBUTVV0aWxzLmRzUm93cyA9IGFzeW5jIGZ1bmN0aW9uIGRzUm93cyhzb3VyY2VJZCwgcGF5bG9hZCwgb3B0cyA9IHt9KSB7XG4gICAgICAgIGNvbnN0IHsgcm93cyB9ID0gYXdhaXQgVE1VdGlscy5kcyhzb3VyY2VJZCwgcGF5bG9hZCwgb3B0cyk7XG4gICAgICAgIHJldHVybiByb3dzO1xuICAgIH07XG5cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIEtPIHVud3JhcCBoZWxwZXJzIChleHBvcnRlZClcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBUTVV0aWxzLnVud3JhcCh2KTogcmV0dXJucyB0aGUgcGxhaW4gdmFsdWUgb2YgYSBLTyBvYnNlcnZhYmxlL2NvbXB1dGVkLCBlbHNlIHZcbiAgICAvLyBUTVV0aWxzLnVud3JhcERlZXAoeCk6IHJlY3Vyc2l2ZWx5IHVud3JhcHMgYXJyYXlzL29iamVjdHMgb2YgS08gdmFsdWVzIChzYWZlIGZvciBKU09OKVxuICAgIC8vIFRNVXRpbHMuanNvblBsYWluKHgsIHNwYWNlPyk6IEpTT04uc3RyaW5naWZ5KFRNVXRpbHMudW53cmFwRGVlcCh4KSwgc3BhY2UpXG4gICAgKGZ1bmN0aW9uIGFkZFVud3JhcEhlbHBlcnMoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG5cbiAgICAgICAgICAgIGlmICghVE1VdGlscy51bndyYXApIHtcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnVud3JhcCA9IGZ1bmN0aW9uIHVud3JhcCh2KSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoS08gJiYgdHlwZW9mIEtPLnVud3JhcCA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIEtPLnVud3JhcCh2KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAodHlwZW9mIHYgPT09ICdmdW5jdGlvbicpID8gdigpIDogdjtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiB2OyB9XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFUTVV0aWxzLnVud3JhcERlZXApIHtcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnVud3JhcERlZXAgPSBmdW5jdGlvbiB1bndyYXBEZWVwKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2VlbiA9IG5ldyBXZWFrTWFwKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNLTyA9IChmbikgPT4gISFmbiAmJiB0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicgJiYgKFxuICAgICAgICAgICAgICAgICAgICAgICAgKEtPICYmIEtPLmlzT2JzZXJ2YWJsZSAmJiBLTy5pc09ic2VydmFibGUoZm4pKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgKEtPICYmIEtPLmlzQ29tcHV0ZWQgJiYgS08uaXNDb21wdXRlZChmbikpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAodHlwZW9mIGZuLnN1YnNjcmliZSA9PT0gJ2Z1bmN0aW9uJykgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZuLl9pc09icyA9PT0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHVuID0gKHYpID0+IChLTyAmJiB0eXBlb2YgS08udW53cmFwID09PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgICAgICAgICAgICAgPyBLTy51bndyYXAodilcbiAgICAgICAgICAgICAgICAgICAgICAgIDogKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nID8gKGlzS08odikgPyB2KCkgOiB2KSA6IHYpO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHdhbGsgPSAodikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIHY7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gdHlwZW9mIHY7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0ID09PSAnc3RyaW5nJyB8fCB0ID09PSAnbnVtYmVyJyB8fCB0ID09PSAnYm9vbGVhbicpIHJldHVybiB2O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodikpIHJldHVybiB2Lm1hcCh3YWxrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0ID09PSAnZnVuY3Rpb24nKSByZXR1cm4gdW4odik7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2Vlbi5oYXModikpIHJldHVybiBzZWVuLmdldCh2KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvdXQgPSBBcnJheS5pc0FycmF5KHYpID8gW10gOiB7fTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWVuLnNldCh2LCBvdXQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgayBpbiB2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodiwgaykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG91dFtrXSA9IHdhbGsodltrXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2O1xuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB3YWxrKHgpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghVE1VdGlscy5qc29uUGxhaW4pIHtcbiAgICAgICAgICAgICAgICBUTVV0aWxzLmpzb25QbGFpbiA9IGZ1bmN0aW9uIGpzb25QbGFpbih4LCBzcGFjZSA9IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgcmV0dXJuIEpTT04uc3RyaW5naWZ5KFRNVXRpbHMudW53cmFwRGVlcCh4KSwgbnVsbCwgc3BhY2UpOyB9XG4gICAgICAgICAgICAgICAgICAgIGNhdGNoIHsgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHgsIG51bGwsIHNwYWNlKTsgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIG5vLW9wOiBLTyBtYXkgbm90IGJlIHByZXNlbnQgeWV0IGluIHNvbWUgY29udGV4dHNcbiAgICAgICAgfVxuICAgIH0pKCk7XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBLTy9QbGV4IG9ic2VydmFibGUgcmVhZCAmIHdyaXRlIGhlbHBlcnNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAoZnVuY3Rpb24gYWRkT2JzQWNjZXNzb3JzKCkge1xuICAgICAgICBjb25zdCByb290ID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICAgICAgY29uc3QgS08gPSByb290LmtvO1xuXG4gICAgICAgIC8vIFJldHVybnMgdGhlIGdldHRlci9zZXR0ZXIgb3IgcGxhaW4gcHJvcCBmcm9tIFBsZXggaGVscGVyIGlmIGF2YWlsYWJsZVxuICAgICAgICBmdW5jdGlvbiBfcGxleEdldHRlcih2bSwgcHJvcCkge1xuICAgICAgICAgICAgY29uc3QgZyA9IHJvb3Q/LnBsZXg/LmRhdGE/LmdldE9ic2VydmFibGVPclZhbHVlO1xuICAgICAgICAgICAgcmV0dXJuICh0eXBlb2YgZyA9PT0gJ2Z1bmN0aW9uJykgPyBnKHZtLCBwcm9wKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZWFkIGEgcHJvcGVydHkgZnJvbSBhIFBsZXggS08gdmlldy1tb2RlbCBhbmQgZnVsbHkgdW53cmFwIGl0LlxuICAgICAgICAgKiAtIFN1cHBvcnRzIGRvdHRlZCBwYXRocyBcIkZvby5CYXJcIlxuICAgICAgICAgKiAtIElmIHRoZSBmaW5hbCB2YWx1ZSBpcyBhbiBhcnJheSBhbmQgb3B0aW9ucy5maXJzdCA9PT0gdHJ1ZSwgcmV0dXJucyBmaXJzdCBpdGVtXG4gICAgICAgICAqIC0gb3B0aW9ucy50cmltOiBpZiB0cnVlLCByZXR1cm5zIGEgdHJpbW1lZCBzdHJpbmcgZm9yIHN0cmluZy9udW1iZXJcbiAgICAgICAgICovXG4gICAgICAgIFRNVXRpbHMuZ2V0T2JzVmFsdWUgPSBmdW5jdGlvbiBnZXRPYnNWYWx1ZSh2bU9yRWwsIHBhdGhPclBhdGhzLCB7XG4gICAgICAgICAgICBmaXJzdCA9IHRydWUsICAgICAgLy8gaWYgdmFsdWUgaXMgYW4gYXJyYXksIHJldHVybiBmaXJzdCBpdGVtXG4gICAgICAgICAgICB0cmltID0gZmFsc2UsICAgICAgLy8gdHJpbSBzdHJpbmcvbnVtYmVyIHRvIHN0cmluZ1xuICAgICAgICAgICAgZGVlcCA9IHRydWUsICAgICAgIC8vIGRlZXAgdW53cmFwIChLTyArIG5lc3RlZClcbiAgICAgICAgICAgIGFsbG93UGxleCA9IHRydWUsICAvLyB1c2UgcGxleC5kYXRhLmdldE9ic2VydmFibGVPclZhbHVlIHdoZW4gYXZhaWxhYmxlXG4gICAgICAgICAgICBjb2FsZXNjZUZhbHN5ID0gZmFsc2UgLy8gaWYgZmFsc2UsIGVtcHR5IHN0cmluZyBpcyB0cmVhdGVkIGFzIFwibm90IGZvdW5kXCIgYW5kIHRyaWVzIG5leHQgY2FuZGlkYXRlXG4gICAgICAgIH0gPSB7fSkge1xuICAgICAgICAgICAgaWYgKCF2bU9yRWwgfHwgIXBhdGhPclBhdGhzKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICBjb25zdCByb290ID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICAgICAgICAgIGNvbnN0IEtPID0gcm9vdC5rbztcbiAgICAgICAgICAgIGNvbnN0IHVud3JhcE9uY2UgPSAodikgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChUTVV0aWxzLnVud3JhcCkgcmV0dXJuIFRNVXRpbHMudW53cmFwKHYpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoS08/LnVud3JhcCkgcmV0dXJuIEtPLnVud3JhcCh2KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJykgPyB2KCkgOiB2O1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gdjsgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHVud3JhcERlZXAgPSAodikgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChUTVV0aWxzLnVud3JhcERlZXApIHJldHVybiBUTVV0aWxzLnVud3JhcERlZXAodik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChLTz8udW53cmFwKSByZXR1cm4gS08udW53cmFwKHYpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nKSA/IHYoKSA6IHY7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiB2OyB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgaXNLT0Z1bmMgPSAoZikgPT4gISFmICYmIHR5cGVvZiBmID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgICAgICAgICAgKEtPPy5pc09ic2VydmFibGU/LihmKSB8fCAncGVlaycgaW4gZiB8fCAnc3Vic2NyaWJlJyBpbiBmIHx8ICdub3RpZnlTdWJzY3JpYmVycycgaW4gZik7XG5cbiAgICAgICAgICAgIC8vIElmIGdpdmVuIGEgRE9NIG5vZGUsIHJlc29sdmUgS08gcm9vdCBWTVxuICAgICAgICAgICAgbGV0IHZtID0gdm1PckVsO1xuICAgICAgICAgICAgaWYgKHZtT3JFbCAmJiB2bU9yRWwubm9kZVR5cGUgPT09IDEpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdHggPSBLTz8uY29udGV4dEZvcj8uKHZtT3JFbCk7XG4gICAgICAgICAgICAgICAgICAgIHZtID0gY3R4Py4kcm9vdD8uZGF0YSA/PyBjdHg/LiRyb290ID8/IGN0eD8uJGRhdGEgPz8gdm1PckVsO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gQXJyYXkuaXNBcnJheShwYXRoT3JQYXRocykgPyBwYXRoT3JQYXRocyA6IFtwYXRoT3JQYXRoc107XG5cbiAgICAgICAgICAgIGNvbnN0IHJlYWRWaWFQbGV4ID0gKHApID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBnID0gcm9vdD8ucGxleD8uZGF0YT8uZ2V0T2JzZXJ2YWJsZU9yVmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhbGxvd1BsZXggJiYgdHlwZW9mIGcgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFjYyA9IGcodm0sIHApOyAgICAgICAgICAgICAgIC8vIEtPIG9ic2VydmFibGUvY29tcHV0ZWQgT1IgcGxhaW4gdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAodHlwZW9mIGFjYyA9PT0gJ2Z1bmN0aW9uJykgPyBhY2MoKSA6IGFjYztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCByZWFkVmlhUGF0aCA9IChwKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2VnbWVudHMgPSBTdHJpbmcocCkuc3BsaXQoJy4nKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGN1ciA9IHZtO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2Ygc2VnbWVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1ciA9IChjdXIgPT0gbnVsbCkgPyB1bmRlZmluZWQgOiBjdXJba107XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY3VyID09PSB1bmRlZmluZWQpIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY3VyID09PSAnZnVuY3Rpb24nKSByZXR1cm4gaXNLT0Z1bmMoY3VyKSA/IGN1cigpIDogY3VyOyAvLyBkb24ndCBhY2NpZGVudGFsbHkgZXhlY3V0ZSBub24tS08gbWV0aG9kc1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY3VyO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgcCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgICAgICAgICAgbGV0IHYgPSByZWFkVmlhUGxleChwKTtcbiAgICAgICAgICAgICAgICBpZiAodiA9PT0gdW5kZWZpbmVkKSB2ID0gcmVhZFZpYVBhdGgocCk7XG5cbiAgICAgICAgICAgICAgICB2ID0gZGVlcCA/IHVud3JhcERlZXAodikgOiB1bndyYXBPbmNlKHYpO1xuICAgICAgICAgICAgICAgIGlmIChmaXJzdCAmJiBBcnJheS5pc0FycmF5KHYpKSB2ID0gdi5sZW5ndGggPyB2WzBdIDogdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRyaW0gJiYgKHR5cGVvZiB2ID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgdiA9PT0gJ251bWJlcicpKSB2ID0gU3RyaW5nKHYpLnRyaW0oKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGhhc1ZhbHVlID0gKHYgIT09IHVuZGVmaW5lZCAmJiB2ICE9PSBudWxsICYmIChjb2FsZXNjZUZhbHN5IHx8IHYgIT09ICcnKSk7XG4gICAgICAgICAgICAgICAgaWYgKGhhc1ZhbHVlKSByZXR1cm4gdjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBXcml0ZSBhIHZhbHVlIHRvIGEgUGxleCBLTyB2aWV3LW1vZGVsIHByb3BlcnR5LlxuICAgICAgICAgKiAtIFN1cHBvcnRzIGRvdHRlZCBwYXRocyBcIkZvby5CYXJcIlxuICAgICAgICAgKiAtIElmIHRoZSB0YXJnZXQgaXMgYW4gb2JzZXJ2YWJsZSBmdW5jdGlvbiwgY2FsbHMgaXQgd2l0aCB2YWx1ZVxuICAgICAgICAgKiAtIElmIHRoZSB0YXJnZXQgaXMgYW4gYXJyYXksIHJlcGxhY2VzIGNvbnRlbnRzIHdpdGggYSBzaW5nbGUgdmFsdWVcbiAgICAgICAgICogLSBFbHNlIGFzc2lnbnMgZGlyZWN0bHlcbiAgICAgICAgICovXG4gICAgICAgIC8vIEFycmF5LWF3YXJlIHdyaXRlOiByZXNwZWN0cyBLTyBvYnNlcnZhYmxlQXJyYXksIEtPIG9ic2VydmFibGUsIG9yIHBsYWluIHByb3BcbiAgICAgICAgVE1VdGlscy5zZXRPYnNWYWx1ZSA9IGZ1bmN0aW9uIHNldE9ic1ZhbHVlKHZtLCBwYXRoLCB2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKCF2bSB8fCAhcGF0aCkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCByb290ID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICAgICAgICAgIGNvbnN0IEtPID0gcm9vdC5rbztcblxuICAgICAgICAgICAgLy8gSGVscGVyIHRvIGNvZXJjZSB0byBhcnJheSBpZmYgdGFyZ2V0IGlzIGFycmF5LXNoYXBlZFxuICAgICAgICAgICAgY29uc3QgdG9BcnJheUlmID0gKGlzQXJyYXlUYXJnZXQsIHYpID0+IGlzQXJyYXlUYXJnZXQgPyAoQXJyYXkuaXNBcnJheSh2KSA/IHYgOiBbdl0pIDogdjtcblxuICAgICAgICAgICAgLy8gVHJ5IFBsZXggYWNjZXNzb3IgZmlyc3QgKHVzdWFsbHkgcmV0dXJucyBhIEtPIG9ic2VydmFibGUgZnVuY3Rpb24pXG4gICAgICAgICAgICBjb25zdCBwbGV4R2V0ID0gcm9vdD8ucGxleD8uZGF0YT8uZ2V0T2JzZXJ2YWJsZU9yVmFsdWU7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHBsZXhHZXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY2MgPSBwbGV4R2V0KHZtLCBwYXRoKTsgICAgICAgICAgICAvLyBnZXR0ZXIvc2V0dGVyIGZ1bmN0aW9uIG9yIHZhbHVlXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBhY2MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRGV0ZWN0IG9ic2VydmFibGVBcnJheSB2aWEgbWV0aG9kIHByZXNlbmNlXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzT2JzQXJyYXkgPSAhIShhY2MgJiYgdHlwZW9mIGFjYy5wdXNoID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiBhY2MucmVtb3ZlQWxsID09PSAnZnVuY3Rpb24nKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzT2JzQXJyYXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjYy5yZW1vdmVBbGwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyciA9IHRvQXJyYXlJZih0cnVlLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXJyLmxlbmd0aCkgYWNjLnB1c2goLi4uYXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBGb3Igbm9ybWFsIG9ic2VydmFibGUvY29tcHV0ZWQ6IGNvZXJjZSBvbmx5IGlmIGN1cnJlbnQgaXMgYXJyYXlcbiAgICAgICAgICAgICAgICAgICAgbGV0IGN1cjtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgY3VyID0gYWNjKCk7IH0gY2F0Y2ggeyBjdXIgPSB1bmRlZmluZWQ7IH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNBcnJheVRhcmdldCA9IEFycmF5LmlzQXJyYXkoY3VyKTtcbiAgICAgICAgICAgICAgICAgICAgYWNjKHRvQXJyYXlJZihpc0FycmF5VGFyZ2V0LCB2YWx1ZSkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIElmIHBsZXggZ2F2ZSB1cyBhIHBsYWluIHZhbHVlIChyYXJlKSwgZmFsbCB0aHJvdWdoIHRvIGRpcmVjdCBwYXRoXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERpcmVjdCBwYXRoOiB3YWxrIHRvIHBhcmVudCArIGtleVxuICAgICAgICAgICAgY29uc3Qga2V5cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICAgICAgICAgIGNvbnN0IGZpbmFsS2V5ID0ga2V5cy5wb3AoKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IGtleXMucmVkdWNlKChhY2MsIGspID0+IChhY2MgPT0gbnVsbCA/IGFjYyA6IGFjY1trXSksIHZtKTtcbiAgICAgICAgICAgIGlmICghcGFyZW50KSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IGN1ciA9IHBhcmVudFtmaW5hbEtleV07XG5cbiAgICAgICAgICAgIC8vIEtPIG9ic2VydmFibGVBcnJheVxuICAgICAgICAgICAgaWYgKEtPICYmIHR5cGVvZiBLTy5pc09ic2VydmFibGUgPT09ICdmdW5jdGlvbicgJiYgS08uaXNPYnNlcnZhYmxlKGN1cikgJiZcbiAgICAgICAgICAgICAgICB0eXBlb2YgY3VyLnB1c2ggPT09ICdmdW5jdGlvbicgJiYgdHlwZW9mIGN1ci5yZW1vdmVBbGwgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBjdXIucmVtb3ZlQWxsKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYXJyID0gdG9BcnJheUlmKHRydWUsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAoYXJyLmxlbmd0aCkgY3VyLnB1c2goLi4uYXJyKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEtPIG9ic2VydmFibGUgc2NhbGFyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGN1ciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGxldCBjdXJyZW50VmFsO1xuICAgICAgICAgICAgICAgIHRyeSB7IGN1cnJlbnRWYWwgPSBjdXIoKTsgfSBjYXRjaCB7IGN1cnJlbnRWYWwgPSB1bmRlZmluZWQ7IH1cbiAgICAgICAgICAgICAgICBjb25zdCBpc0FycmF5VGFyZ2V0ID0gQXJyYXkuaXNBcnJheShjdXJyZW50VmFsKTtcbiAgICAgICAgICAgICAgICBjdXIodG9BcnJheUlmKGlzQXJyYXlUYXJnZXQsIHZhbHVlKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBQbGFpbiBwcm9wZXJ0eSAoYXJyYXkgb3Igc2NhbGFyKVxuICAgICAgICAgICAgY29uc3QgaXNBcnJheVRhcmdldCA9IEFycmF5LmlzQXJyYXkoY3VyKTtcbiAgICAgICAgICAgIHBhcmVudFtmaW5hbEtleV0gPSB0b0FycmF5SWYoaXNBcnJheVRhcmdldCwgdmFsdWUpO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLyoqIENvbnZlbmllbmNlOiBjb2VyY2UgYW55IG9icy9wbGFpbi9hcnJheSB0byBhIHRyaW1tZWQgc3RyaW5nIGlkICovXG4gICAgICAgIFRNVXRpbHMuY29lcmNlSWQgPSBmdW5jdGlvbiBjb2FsZXNjZVRvSWQodikge1xuICAgICAgICAgICAgY29uc3QgdSA9IFRNVXRpbHMudW53cmFwRGVlcCA/IFRNVXRpbHMudW53cmFwRGVlcCh2KSA6IHY7XG4gICAgICAgICAgICBjb25zdCB4ID0gQXJyYXkuaXNBcnJheSh1KSA/ICh1Lmxlbmd0aCA/IHVbMF0gOiB1bmRlZmluZWQpIDogdTtcbiAgICAgICAgICAgIHJldHVybiBTdHJpbmcoeCA/PyAnJykudHJpbSgpO1xuICAgICAgICB9O1xuICAgIH0pKCk7XG5cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIDMpIEZsb2F0aW5nIG1lc3NhZ2UgVUkgKGtlcHQgYXMtaXM7IGFkZGVkIHRvYXN0KCkgYWxpYXMgKyBsb2coKSlcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBmdW5jdGlvbiBoaWRlTWVzc2FnZSgpIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RtLW1zZycpPy5yZW1vdmUoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzaG93TWVzc2FnZSh0ZXh0LCB7IHR5cGUgPSAnaW5mbycsIGF1dG9DbGVhciA9IDQwMDAgfSA9IHt9KSB7XG4gICAgICAgIGhpZGVNZXNzYWdlKCk7XG4gICAgICAgIGNvbnN0IGNvbG9ycyA9IHtcbiAgICAgICAgICAgIGluZm86IHsgYmc6ICcjZDllZGY3JywgZmc6ICcjMzE3MDhmJyB9LFxuICAgICAgICAgICAgc3VjY2VzczogeyBiZzogJyNkZmYwZDgnLCBmZzogJyMzYzc2M2QnIH0sXG4gICAgICAgICAgICB3YXJuaW5nOiB7IGJnOiAnI2ZjZjhlMycsIGZnOiAnIzhhNmQzYicgfSxcbiAgICAgICAgICAgIGVycm9yOiB7IGJnOiAnI2YyZGVkZScsIGZnOiAnI2E5NDQ0MicgfVxuICAgICAgICB9W3R5cGVdIHx8IHsgYmc6ICcjZmZmJywgZmc6ICcjMDAwJyB9O1xuICAgICAgICBjb25zdCBib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgYm94LmlkID0gJ3RtLW1zZyc7XG4gICAgICAgIE9iamVjdC5hc3NpZ24oYm94LnN0eWxlLCB7XG4gICAgICAgICAgICBwb3NpdGlvbjogJ2ZpeGVkJywgdG9wOiAnMTBweCcsIHJpZ2h0OiAnMTBweCcsXG4gICAgICAgICAgICBwYWRkaW5nOiAnOHB4IDEycHgnLCBiYWNrZ3JvdW5kQ29sb3I6IGNvbG9ycy5iZyxcbiAgICAgICAgICAgIGNvbG9yOiBjb2xvcnMuZmcsIGJvcmRlcjogYDFweCBzb2xpZCAke2NvbG9ycy5mZ31gLFxuICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnNHB4JywgYm94U2hhZG93OiAnMCAycHggNnB4IHJnYmEoMCwwLDAsMC4yKScsXG4gICAgICAgICAgICB6SW5kZXg6IDEwMDAwLCBmb250U2l6ZTogJzAuOWVtJywgbWF4V2lkdGg6ICc4MCUnLFxuICAgICAgICAgICAgd2hpdGVTcGFjZTogJ3ByZS1saW5lJ1xuICAgICAgICB9KTtcbiAgICAgICAgYm94LnRleHRDb250ZW50ID0gdGV4dDtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChib3gpO1xuICAgICAgICBpZiAoYXV0b0NsZWFyKSBzZXRUaW1lb3V0KGhpZGVNZXNzYWdlLCBhdXRvQ2xlYXIpO1xuICAgIH1cblxuICAgIC8vIEFsaWFzOiB1bmlmaWVkIHRvYXN0IEFQSVxuICAgIGZ1bmN0aW9uIHRvYXN0KG1zZywgbGV2ZWwgPSAnaW5mbycsIG1zKSB7XG4gICAgICAgIHNob3dNZXNzYWdlKG1zZywgeyB0eXBlOiBsZXZlbCwgYXV0b0NsZWFyOiBtcyA/PyA0MDAwIH0pO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIDQpIERPTSBpbnNlcnRpb24gb2JzZXJ2ZXIgKGtlcHQgYXMtaXMpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gb2JzZXJ2ZUluc2VydChzZWxlY3RvciwgY2FsbGJhY2spIHtcbiAgICAgICAgY29uc3Qgb2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICAgICAgICAgIGlmIChlbCkge1xuICAgICAgICAgICAgICAgIG9icy5kaXNjb25uZWN0KCk7IGNhbGxiYWNrKGVsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIG9icy5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuICAgICAgICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHsgb2JzLmRpc2Nvbm5lY3QoKTsgY2FsbGJhY2soZXhpc3RpbmcpOyB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gNSkgS08gY29udHJvbGxlciArIFZNIHdhaXRlcnMgKGtlcHQ7IGFzeW5jIHZhcmlhbnQgcHJlc2VydmVkKVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIHdhaXRGb3JNb2RlbEFzeW5jKHNlbCwge1xuICAgICAgICBwb2xsTXMgPSAyNTAsXG4gICAgICAgIHRpbWVvdXRNcyA9IDMwMDAwLFxuICAgICAgICByZXF1aXJlS28gPSB0cnVlLCAgIC8vIGlmIGZhbHNlLCByZXNvbHZlIGFzIHNvb24gYXMgdGhlIGVsZW1lbnQgaXMgZm91bmRcbiAgICAgICAgbG9nZ2VyID0gbnVsbCwgICAgICAvLyBwYXNzIFRNVXRpbHMuZ2V0TG9nZ2VyKCdRVDEwJykgLyBfbG9nZ2VyLCBldGMuXG4gICAgICAgIGxvZyA9IGZhbHNlICAgICAgICAgLy8gc2V0IHRydWUgdG8gcHJpbnQgZGVidWcgd2l0aCBjb25zb2xlLiogZXZlbiB3aXRob3V0IGEgbG9nZ2VyXG4gICAgfSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcblxuICAgICAgICBjb25zdCBnZXRLbyA9ICgpID0+XG4gICAgICAgICAgICAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93LmtvKSB8fFxuICAgICAgICAgICAgKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbykgfHwgbnVsbDtcblxuICAgICAgICBjb25zdCBkYmcgPSAoZm4sIC4uLmFyZ3MpID0+IHtcbiAgICAgICAgICAgIGlmIChsb2dnZXIgJiYgdHlwZW9mIGxvZ2dlcltmbl0gPT09ICdmdW5jdGlvbicpIGxvZ2dlcltmbl0oLi4uYXJncyk7XG4gICAgICAgICAgICBlbHNlIGlmIChsb2cpIChjb25zb2xlW2ZuXSB8fCBjb25zb2xlLmxvZykoLi4uYXJncyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGZ1bmN0aW9uIHRpY2soKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbCk7XG4gICAgICAgICAgICAgICAgaWYgKCFlbCkgcmV0dXJuIHNjaGVkdWxlKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIXJlcXVpcmVLbykge1xuICAgICAgICAgICAgICAgICAgICAvLyByZXR1cm4gZWFybHkgd2l0aG91dCBLTyBjb250ZXh0XG4gICAgICAgICAgICAgICAgICAgIGxvZyAmJiBjb25zb2xlLmRlYnVnKCdcdUQ4M0RcdUREMEQgd2FpdEZvck1vZGVsQXN5bmMgKG5vIEtPKTonLCB7IHNlbCwgZWwgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHsgZWxlbWVudDogZWwsIGNvbnRyb2xsZXI6IG51bGwsIHZpZXdNb2RlbDogbnVsbCB9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBrb09iaiA9IGdldEtvKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFrb09iaiB8fCB0eXBlb2Yga29PYmouY29udGV4dEZvciAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIHNjaGVkdWxlKCk7XG5cbiAgICAgICAgICAgICAgICBsZXQgY29udHJvbGxlciA9IG51bGwsIHZpZXdNb2RlbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3R4ID0ga29PYmouY29udGV4dEZvcihlbCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2xsZXIgPSBjdHggJiYgY3R4LiRkYXRhIHx8IG51bGw7ICAgICAgICAgICAgICAgICAgLy8gZS5nLiwgY29udHJvbGxlclxuICAgICAgICAgICAgICAgICAgICB2aWV3TW9kZWwgPSAoY29udHJvbGxlciAmJiBjb250cm9sbGVyLm1vZGVsKSB8fCBudWxsOyAgLy8gZS5nLiwgVk0gb24gY29udHJvbGxlclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXZpZXdNb2RlbCAmJiBjdHgpIHZpZXdNb2RlbCA9IGN0eC4kcm9vdD8uZGF0YSB8fCBjdHguJHJvb3QgfHwgbnVsbDsgLy8gVk0gZmFsbGJhY2tcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogbm90IHJlYWR5IHlldCAqLyB9XG5cbiAgICAgICAgICAgICAgICBpZiAobG9nZ2VyIHx8IGxvZykge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmdyb3VwQ29sbGFwc2VkKCdcdUQ4M0RcdUREMEQgd2FpdEZvck1vZGVsQXN5bmMnKTtcbiAgICAgICAgICAgICAgICAgICAgZGJnKCdkZWJ1ZycsICdzZWxlY3RvciBcdTIxOTInLCBzZWwpO1xuICAgICAgICAgICAgICAgICAgICBkYmcoJ2RlYnVnJywgJ2NvbnRyb2xsZXIgXHUyMTkyJywgY29udHJvbGxlcik7XG4gICAgICAgICAgICAgICAgICAgIGRiZygnZGVidWcnLCAndm0gXHUyMTkyJywgdmlld01vZGVsKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHJldHVybiByZXNvbHZlKHsgZWxlbWVudDogZWwsIGNvbnRyb2xsZXIsIHZpZXdNb2RlbCB9KTtcbiAgICAgICAgICAgICAgICBzY2hlZHVsZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBzY2hlZHVsZSgpIHtcbiAgICAgICAgICAgICAgICBpZiAoKERhdGUubm93KCkgLSBzdGFydCkgPj0gdGltZW91dE1zKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IGBUaW1lZCBvdXQgd2FpdGluZyBmb3IgXCIke3NlbH1cIiBhZnRlciAke3RpbWVvdXRNc31tc2A7XG4gICAgICAgICAgICAgICAgICAgIGRiZygnd2FybicsICdcdTIzMUIgd2FpdEZvck1vZGVsQXN5bmMnLCBtc2cpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG5ldyBFcnJvcihtc2cpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCh0aWNrLCBwb2xsTXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBcdTI3MDUgYWRkIHRoaXMgcmlnaHQgYWZ0ZXIgdGhlIHdhaXRGb3JNb2RlbEFzeW5jIGZ1bmN0aW9uIGRlZmluaXRpb25cbiAgICAvL1RNVXRpbHMud2FpdEZvck1vZGVsQXN5bmMgPSB3YWl0Rm9yTW9kZWxBc3luYztcblxuXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyA2KSBTZWxlY3QgPG9wdGlvbj4gaGVscGVycyAoa2VwdClcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBmdW5jdGlvbiBzZWxlY3RPcHRpb25CeVRleHQoc2VsZWN0RWwsIHRleHQpIHtcbiAgICAgICAgY29uc3Qgb3B0ID0gQXJyYXkuZnJvbShzZWxlY3RFbC5vcHRpb25zKVxuICAgICAgICAgICAgLmZpbmQobyA9PiBvLnRleHRDb250ZW50LnRyaW0oKSA9PT0gdGV4dCk7XG4gICAgICAgIGlmIChvcHQpIHsgc2VsZWN0RWwudmFsdWUgPSBvcHQudmFsdWU7IHNlbGVjdEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpOyB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2VsZWN0T3B0aW9uQnlWYWx1ZShzZWxlY3RFbCwgdmFsdWUpIHtcbiAgICAgICAgY29uc3Qgb3B0ID0gQXJyYXkuZnJvbShzZWxlY3RFbC5vcHRpb25zKVxuICAgICAgICAgICAgLmZpbmQobyA9PiBvLnZhbHVlID09IHZhbHVlKTtcbiAgICAgICAgaWYgKG9wdCkgeyBzZWxlY3RFbC52YWx1ZSA9IG9wdC52YWx1ZTsgc2VsZWN0RWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7IH1cbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyA3KSBSb3V0ZSBoZWxwZXJzIChuZXcpOiBlbnN1cmVSb3V0ZShyZWdleCkgKyBvblJvdXRlQ2hhbmdlKGhhbmRsZXIpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gZW5zdXJlUm91dGUocmVnZXgpIHtcbiAgICAgICAgdHJ5IHsgcmV0dXJuIHJlZ2V4LnRlc3QobG9jYXRpb24ucGF0aG5hbWUpOyB9XG4gICAgICAgIGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgfVxuXG4gICAgLy8gSGVscGVyIHVzZWQgYnkgYm90aCB3YXRjaGVyc1xuICAgIGZ1bmN0aW9uIF9fdG1DcmVhdGVRdWlldERpc3BhdGNoZXIoZm4sIGRlbGF5KSB7XG4gICAgICAgIGxldCB0ID0gbnVsbDtcbiAgICAgICAgcmV0dXJuICgpID0+IHsgaWYgKHQpIGNsZWFyVGltZW91dCh0KTsgdCA9IHNldFRpbWVvdXQoKCkgPT4geyB0ID0gbnVsbDsgZm4oKTsgfSwgZGVsYXkpOyB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uUm91dGVDaGFuZ2UoaGFuZGxlcikge1xuICAgICAgICBpZiAoaGlzdG9yeS5fX3RtV3JhcHBlZCkgeyBoYW5kbGVyKGxvY2F0aW9uLnBhdGhuYW1lKTsgcmV0dXJuOyB9XG4gICAgICAgIGNvbnN0IGZpcmUgPSAoKSA9PiB7XG4gICAgICAgICAgICB0cnkgeyBoYW5kbGVyKGxvY2F0aW9uLnBhdGhuYW1lKTsgfSBjYXRjaCAoZSkgeyBjb25zb2xlLndhcm4oJ29uUm91dGVDaGFuZ2UgaGFuZGxlciBlcnJvcicsIGUpOyB9XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IF9wcyA9IGhpc3RvcnkucHVzaFN0YXRlO1xuICAgICAgICBoaXN0b3J5LnB1c2hTdGF0ZSA9IGZ1bmN0aW9uICgpIHsgX3BzLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7IHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnbG9jYXRpb25jaGFuZ2UnKSk7IH07XG4gICAgICAgIGNvbnN0IF9ycyA9IGhpc3RvcnkucmVwbGFjZVN0YXRlO1xuICAgICAgICBoaXN0b3J5LnJlcGxhY2VTdGF0ZSA9IGZ1bmN0aW9uICgpIHsgX3JzLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7IHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnbG9jYXRpb25jaGFuZ2UnKSk7IH07XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdwb3BzdGF0ZScsIGZpcmUpO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbG9jYXRpb25jaGFuZ2UnLCBmaXJlKTtcbiAgICAgICAgaGlzdG9yeS5fX3RtV3JhcHBlZCA9IHRydWU7XG4gICAgICAgIGZpcmUoKTsgLy8gaW1tZWRpYXRlIGZpcmUgZm9yIGluaXRpYWwgcm91dGVcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyA4KSBSb3V0ZSBtYXRjaGVyIChuZXcpOiBhY2NlcHRzIHJlZ2V4IG9yIGFycmF5IG9mIHJlZ2V4XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gbWF0Y2hSb3V0ZShyZWdleE9yQXJyYXksIHBhdGggPSBsb2NhdGlvbi5wYXRobmFtZSkge1xuICAgICAgICBpZiAoIXJlZ2V4T3JBcnJheSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAocmVnZXhPckFycmF5IGluc3RhbmNlb2YgUmVnRXhwKSByZXR1cm4gcmVnZXhPckFycmF5LnRlc3QocGF0aCk7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlZ2V4T3JBcnJheSkpIHJldHVybiByZWdleE9yQXJyYXkuc29tZShyeCA9PiByeC50ZXN0KHBhdGgpKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIExvZ2dlciBIZWxwZXJzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgbGV0IF9fdG1EZWJ1ZyA9IGZhbHNlOyAgICAgICAgICAgIC8vIGRlY2xhcmUgdGhpcyBzbyBzZXREZWJ1ZyB3b3Jrc1xuICAgIGZ1bmN0aW9uIHNldERlYnVnKHYpIHsgX190bURlYnVnID0gISF2OyB9XG4gICAgZnVuY3Rpb24gbWFrZUxvZ2dlcihucykge1xuICAgICAgICBjb25zdCBsYWJlbCA9IG5zIHx8ICdUTSc7XG4gICAgICAgIGNvbnN0IGVtaXQgPSAobSwgYmFkZ2UsIC4uLmEpID0+IChjb25zb2xlW21dIHx8IGNvbnNvbGUubG9nKS5jYWxsKGNvbnNvbGUsIGAke2xhYmVsfSAke2JhZGdlfWAsIC4uLmEpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbG9nOiAoLi4uYSkgPT4gZW1pdCgnbG9nJywgJ1x1MjVCNlx1RkUwRicsIC4uLmEpLFxuICAgICAgICAgICAgaW5mbzogKC4uLmEpID0+IGVtaXQoJ2luZm8nLCAnXHUyMTM5XHVGRTBGJywgLi4uYSksXG4gICAgICAgICAgICB3YXJuOiAoLi4uYSkgPT4gZW1pdCgnd2FybicsICdcdTI2QTBcdUZFMEYnLCAuLi5hKSxcbiAgICAgICAgICAgIGVycm9yOiAoLi4uYSkgPT4gZW1pdCgnZXJyb3InLCAnXHUyNzE2XHVGRTBGJywgLi4uYSksXG4gICAgICAgICAgICBvazogKC4uLmEpID0+IGVtaXQoJ2xvZycsICdcdTI3MDUnLCAuLi5hKSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBTaW1wbGUgZ2xvYmFsIHNoaW1zIHNvIFRNVXRpbHMubG9nL3dhcm4vZXJyb3IgZXhpc3QgKGhhbmR5IGZvciB5b3VyIGRsb2cvZHdhcm4vZGVycm9yKVxuICAgIGZ1bmN0aW9uIGxvZyguLi5hKSB7IGNvbnNvbGUubG9nKCdUTSBcdTI1QjZcdUZFMEYnLCAuLi5hKTsgfVxuICAgIGZ1bmN0aW9uIHdhcm4oLi4uYSkgeyBjb25zb2xlLndhcm4oJ1RNIFx1MjZBMFx1RkUwRicsIC4uLmEpOyB9XG4gICAgZnVuY3Rpb24gZXJyb3IoLi4uYSkgeyBjb25zb2xlLmVycm9yKCdUTSBcdTI3MTZcdUZFMEYnLCAuLi5hKTsgfVxuICAgIGZ1bmN0aW9uIG9rKC4uLmEpIHsgY29uc29sZS5sb2coJ1RNIFx1MjcwNScsIC4uLmEpOyB9XG5cbiAgICBmdW5jdGlvbiBkZXJpdmVOc0Zyb21TY3JpcHROYW1lKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgbmFtZSA9ICh0eXBlb2YgR01faW5mbyAhPT0gJ3VuZGVmaW5lZCcgJiYgR01faW5mbz8uc2NyaXB0Py5uYW1lKSB8fCAnJztcbiAgICAgICAgICAgIGlmICghbmFtZSkgcmV0dXJuICdUTSc7XG4gICAgICAgICAgICAvLyBncmFiIHRoZSBmaXJzdCB0b2tlbiBiZWZvcmUgYSBzcGFjZS9hcnJvdyAod29ya3MgZm9yIFx1MjAxQ1FUMTAgXHUyMDI2XHUyMDFELCBcdTIwMUNDUiZTMTAgXHUyNzlDIFx1MjAyNlx1MjAxRCwgZXRjLilcbiAgICAgICAgICAgIHJldHVybiBuYW1lLnNwbGl0KC9bIFxcdFx1MjAxM1x1MjAxNFxcLVx1MjE5Mlx1Mjc5Qz5dLylbMF0udHJpbSgpIHx8ICdUTSc7XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gJ1RNJzsgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldExvZ2dlcihucykge1xuICAgICAgICBjb25zdCBsYWJlbCA9IG5zIHx8IGRlcml2ZU5zRnJvbVNjcmlwdE5hbWUoKTtcbiAgICAgICAgcmV0dXJuIFRNVXRpbHMubWFrZUxvZ2dlciA/IFRNVXRpbHMubWFrZUxvZ2dlcihsYWJlbCkgOiB7XG4gICAgICAgICAgICBsb2c6ICguLi5hKSA9PiBjb25zb2xlLmxvZyhgJHtsYWJlbH0gXHUyNUI2XHVGRTBGYCwgLi4uYSksXG4gICAgICAgICAgICBpbmZvOiAoLi4uYSkgPT4gY29uc29sZS5pbmZvKGAke2xhYmVsfSBcdTIxMzlcdUZFMEZgLCAuLi5hKSxcbiAgICAgICAgICAgIHdhcm46ICguLi5hKSA9PiBjb25zb2xlLndhcm4oYCR7bGFiZWx9IFx1MjZBMFx1RkUwRmAsIC4uLmEpLFxuICAgICAgICAgICAgZXJyb3I6ICguLi5hKSA9PiBjb25zb2xlLmVycm9yKGAke2xhYmVsfSBcdTI3MTZcdUZFMEZgLCAuLi5hKSxcbiAgICAgICAgICAgIG9rOiAoLi4uYSkgPT4gY29uc29sZS5sb2coYCR7bGFiZWx9IFx1MjcwNWAsIC4uLmEpLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8vIE9wdGlvbmFsOiBzZXQgYSBnbG9iYWwgYExgIGZvciBjb252ZW5pZW5jZSAoYXZvaWQgaWYgeW91IGZlYXIgY29sbGlzaW9ucylcbiAgICBmdW5jdGlvbiBhdHRhY2hMb2dnZXJHbG9iYWwobnMpIHtcbiAgICAgICAgY29uc3QgbG9nZ2VyID0gZ2V0TG9nZ2VyKG5zKTtcbiAgICAgICAgd2luZG93LkwgPSBsb2dnZXI7XG4gICAgICAgIGlmICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJykgdW5zYWZlV2luZG93LkwgPSBsb2dnZXI7XG4gICAgICAgIHJldHVybiBsb2dnZXI7XG4gICAgfVxuXG4gICAgLy8gV2F0Y2ggYSBmaWVsZCBieSBpdHMgPGxhYmVsPiB0ZXh0LiBTdWJzY3JpYmVzIHRvIEtPIGlmIGF2YWlsYWJsZTsgZWxzZSBmYWxscyBiYWNrIHRvIERPTS5cbiAgICAvLyBSZXR1cm5zIGFuIHVuc3Vic2NyaWJlKCkgZnVuY3Rpb24uXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIHdhdGNoQnlMYWJlbCAoRFJPUC1JTikgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgVE1VdGlscy53YXRjaEJ5TGFiZWwgPSBmdW5jdGlvbiB3YXRjaEJ5TGFiZWwoe1xuICAgICAgICBsYWJlbFRleHQsXG4gICAgICAgIG9uQ2hhbmdlOiBvblZhbHVlLFxuICAgICAgICBpbml0aWFsID0gdHJ1ZSxcbiAgICAgICAgZmlyZU9uID0gJ2NoYW5nZScsICAgICAgICAgICAgIC8vICdjaGFuZ2UnIHwgJ2JsdXInXG4gICAgICAgIHNldHRsZU1zID0gMjUwLFxuICAgICAgICBrb1ByZWZlciA9ICdyb290JyxcbiAgICAgICAgYmFnS2V5cyA9IFsndmFsdWUnLCAnZGlzcGxheVZhbHVlJywgJ2JvdW5kRGlzcGxheVZhbHVlJywgJ3RleHRJbnB1dCddLFxuICAgICAgICB3aWRnZXRTZWxlY3RvciA9ICcuay1jb21ib2JveCwuay1kcm9wZG93biwuay1kcm9wZG93bmxpc3QsLmstYXV0b2NvbXBsZXRlLFtyb2xlPVwiY29tYm9ib3hcIl0nLFxuICAgICAgICB0aW1lb3V0TXMgPSAzMDAwMCxcbiAgICAgICAgbG9nZ2VyID0gbnVsbFxuICAgIH0gPSB7fSkge1xuICAgICAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgICAgIGNvbnN0IGlzT2JzID0gKHgpID0+IChLTz8uaXNPYnNlcnZhYmxlPy4oeCkpIHx8ICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgeC5zdWJzY3JpYmUgPT09ICdmdW5jdGlvbicpO1xuICAgICAgICBjb25zdCB1biA9ICh4KSA9PiBLTz8udW53cmFwID8gS08udW53cmFwKHgpIDogKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nID8geCgpIDogeCk7XG4gICAgICAgIGNvbnN0IGxvZyA9ICguLi5hKSA9PiBsb2dnZXI/LmxvZz8uKC4uLmEpO1xuXG4gICAgICAgIGNvbnN0IG5vcm0gPSAocykgPT4gU3RyaW5nKHMgfHwgJycpLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvXFx1MDBhMC9nLCAnICcpLnJlcGxhY2UoL1sqOl0vZywgJycpLnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IHdhbnQgPSBsYWJlbFRleHQgaW5zdGFuY2VvZiBSZWdFeHAgPyBsYWJlbFRleHQgOiBub3JtKGxhYmVsVGV4dCk7XG5cbiAgICAgICAgY29uc3QgZmluZExhYmVsID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbGFiZWxzID0gWy4uLmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2xhYmVsW2Zvcl0nKV07XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGwgb2YgbGFiZWxzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdHh0ID0gbm9ybShsLnRleHRDb250ZW50IHx8IGwuZ2V0QXR0cmlidXRlKCdkYXRhLW9yaWdpbmFsLXRleHQnKSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgaWYgKGxhYmVsVGV4dCBpbnN0YW5jZW9mIFJlZ0V4cCA/IGxhYmVsVGV4dC50ZXN0KHR4dCkgOiAodHh0ID09PSB3YW50IHx8IHR4dC5zdGFydHNXaXRoKHdhbnQpKSkgcmV0dXJuIGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfTtcblxuICAgICAgICBmdW5jdGlvbiBob29rTm93KCkge1xuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBmaW5kTGFiZWwoKTtcbiAgICAgICAgICAgIGlmICghbGFiZWwpIHJldHVybiBudWxsO1xuXG4gICAgICAgICAgICBjb25zdCBmb3JJZCA9IGxhYmVsLmdldEF0dHJpYnV0ZSgnZm9yJyk7XG4gICAgICAgICAgICBjb25zdCBlbCA9IGZvcklkICYmIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGZvcklkKTtcbiAgICAgICAgICAgIGlmICghZWwpIHJldHVybiBudWxsO1xuXG4gICAgICAgICAgICBsZXQgYm91bmQgPSBudWxsO1xuICAgICAgICAgICAgaWYgKEtPPy5jb250ZXh0Rm9yKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3R4ID0gS08uY29udGV4dEZvcihlbCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhZyA9IChrb1ByZWZlciA9PT0gJ2RhdGEnID8gY3R4Py4kZGF0YT8uZWxlbWVudHM/Lltmb3JJZF0gOiBjdHg/LiRyb290Py5lbGVtZW50cz8uW2ZvcklkXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHx8IChrb1ByZWZlciA9PT0gJ2RhdGEnID8gY3R4Py4kcm9vdD8uZWxlbWVudHM/Lltmb3JJZF0gOiBjdHg/LiRkYXRhPy5lbGVtZW50cz8uW2ZvcklkXSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChiYWcpIGJvdW5kID0gYmFnS2V5cy5tYXAoayA9PiBiYWdba10pLmZpbmQoQm9vbGVhbikgPz8gbnVsbDtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIWJvdW5kKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkYlJhdyA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1iaW5kJykgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtID0gLyg/OnZhbHVlfHRleHRJbnB1dClcXHMqOlxccyooW14sfV0rKS8uZXhlYyhkYlJhdyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cHIgPSBtWzFdLnRyaW0oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBldmFsSW4gPSAob2JqKSA9PiB7IHRyeSB7IHJldHVybiBGdW5jdGlvbignd2l0aCh0aGlzKXtyZXR1cm4gKCcgKyBleHByICsgJyl9JykuY2FsbChvYmopOyB9IGNhdGNoIHsgcmV0dXJuIHVuZGVmaW5lZDsgfSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJvdW5kID0gZXZhbEluKGN0eD8uJGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChib3VuZCA9PT0gdW5kZWZpbmVkKSBib3VuZCA9IGV2YWxJbihjdHg/LiRyb290KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub29wICovIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qga2VuZG9XcmFwID0gZWwuY2xvc2VzdCh3aWRnZXRTZWxlY3Rvcik7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBrZW5kb1dyYXA/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgZWw7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlYWQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IGJvdW5kICE9PSBudWxsID8gdW4oYm91bmQpIDogKGVsLnZhbHVlID8/ICcnKS50b1N0cmluZygpO1xuICAgICAgICAgICAgICAgIHJldHVybiAoQXJyYXkuaXNBcnJheSh2KSA/IHZbMF0gOiB2KT8udG9TdHJpbmcoKS50cmltKCkgfHwgJyc7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBmaXJlID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSByZWFkKCk7XG4gICAgICAgICAgICAgICAgaWYgKHYgJiYgdHlwZW9mIG9uVmFsdWUgPT09ICdmdW5jdGlvbicpIG9uVmFsdWUodik7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgcXVldWVGaXJlID0gX190bUNyZWF0ZVF1aWV0RGlzcGF0Y2hlcihmaXJlLCBzZXR0bGVNcyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHVuc3VicyA9IFtdO1xuXG4gICAgICAgICAgICBpZiAoaW5pdGlhbCAmJiBmaXJlT24gIT09ICdibHVyJykgcXVldWVGaXJlKCk7XG5cbiAgICAgICAgICAgIGlmIChpc09icyhib3VuZCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdWIgPSBib3VuZC5zdWJzY3JpYmUoKCkgPT4gcXVldWVGaXJlKCkpO1xuICAgICAgICAgICAgICAgIHVuc3Vicy5wdXNoKCgpID0+IHN1Yi5kaXNwb3NlPy4oKSk7XG4gICAgICAgICAgICAgICAgbG9nPy4oJ3dhdGNoQnlMYWJlbDogS08gc3Vic2NyaXB0aW9uIGF0dGFjaGVkIGZvcicsIGxhYmVsVGV4dCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChmaXJlT24gPT09ICdibHVyJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9uRm9jdXNPdXQgPSAoKSA9PiBxdWV1ZUZpcmUoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBvbkNoYW5nZSA9ICgpID0+IHF1ZXVlRmlyZSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG9uS2V5RG93biA9IChlKSA9PiB7IGlmIChlLmtleSA9PT0gJ1RhYicgfHwgZS5rZXkgPT09ICdFbnRlcicpIHNldFRpbWVvdXQocXVldWVGaXJlLCAwKTsgfTtcblxuICAgICAgICAgICAgICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKCdmb2N1c291dCcsIG9uRm9jdXNPdXQsIHRydWUpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBvbktleURvd24pO1xuXG4gICAgICAgICAgICAgICAgaWYgKGtlbmRvV3JhcCAmJiBrZW5kb1dyYXAgIT09IHRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICBrZW5kb1dyYXAuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCBvbkZvY3VzT3V0LCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAga2VuZG9XcmFwLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBtbyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHF1ZXVlRmlyZSgpKTtcbiAgICAgICAgICAgICAgICBtby5vYnNlcnZlKHRhcmdldCwgeyBjaGlsZExpc3Q6IHRydWUsIGNoYXJhY3RlckRhdGE6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICB1bnN1YnMucHVzaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5yZW1vdmVFdmVudExpc3RlbmVyKCdmb2N1c291dCcsIG9uRm9jdXNPdXQsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIG9uS2V5RG93bik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChrZW5kb1dyYXAgJiYga2VuZG9XcmFwICE9PSB0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtlbmRvV3JhcC5yZW1vdmVFdmVudExpc3RlbmVyKCdmb2N1c291dCcsIG9uRm9jdXNPdXQsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAga2VuZG9XcmFwLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBtby5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9uQ2hhbmdlID0gKCkgPT4gcXVldWVGaXJlKCk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlKTtcbiAgICAgICAgICAgICAgICB1bnN1YnMucHVzaCgoKSA9PiB0YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UpKTtcbiAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICBsb2c/Lignd2F0Y2hCeUxhYmVsOiBsaXN0ZW5lcnMgYXR0YWNoZWQgZm9yJywgbGFiZWxUZXh0LCB0YXJnZXQpO1xuICAgICAgICAgICAgcmV0dXJuICgpID0+IHsgdW5zdWJzLmZvckVhY2goZm4gPT4geyB0cnkgeyBmbigpOyB9IGNhdGNoIHsgfSB9KTsgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB1bnN1YiA9IGhvb2tOb3coKTtcbiAgICAgICAgaWYgKHR5cGVvZiB1bnN1YiA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIHVuc3ViO1xuXG4gICAgICAgIGNvbnN0IG1vID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICAgICAgdW5zdWIgPSBob29rTm93KCk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHVuc3ViID09PSAnZnVuY3Rpb24nKSBtby5kaXNjb25uZWN0KCk7XG4gICAgICAgIH0pO1xuICAgICAgICBtby5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IG1vLmRpc2Nvbm5lY3QoKSwgdGltZW91dE1zKTtcblxuICAgICAgICByZXR1cm4gKCkgPT4geyB0cnkgeyB0eXBlb2YgdW5zdWIgPT09ICdmdW5jdGlvbicgJiYgdW5zdWIoKTsgfSBjYXRjaCB7IH0gdHJ5IHsgbW8uZGlzY29ubmVjdCgpOyB9IGNhdGNoIHsgfSB9O1xuICAgIH07XG5cbiAgICAvLyBSZXNvbHZlIG9uY2Ugd2l0aCB0aGUgZmlyc3Qgbm9uLWVtcHR5IHZhbHVlLCB0aGVuIGF1dG8tdW5zdWJzY3JpYmVcbiAgICBUTVV0aWxzLmF3YWl0VmFsdWVCeUxhYmVsID0gZnVuY3Rpb24gYXdhaXRWYWx1ZUJ5TGFiZWwoeyBsYWJlbFRleHQsIHRpbWVvdXRNcyA9IDMwMDAwLCBsb2dnZXIgPSBudWxsIH0gPSB7fSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgbGV0IHN0b3AgPSBudWxsO1xuICAgICAgICAgICAgbGV0IGRvbmUgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IGlmICghZG9uZSkgeyBkb25lID0gdHJ1ZTsgc3RvcD8uKCk7IHJlamVjdChuZXcgRXJyb3IoJ1RpbWVvdXQnKSk7IH0gfSwgdGltZW91dE1zKTtcbiAgICAgICAgICAgIHN0b3AgPSBUTVV0aWxzLndhdGNoQnlMYWJlbCh7XG4gICAgICAgICAgICAgICAgbGFiZWxUZXh0LFxuICAgICAgICAgICAgICAgIGluaXRpYWw6IHRydWUsXG4gICAgICAgICAgICAgICAgbG9nZ2VyLFxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlOiAodikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZG9uZSB8fCAhdikgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICAgICAgICAgICAgICAgICAgc3RvcD8uKCk7ICAgICAgICAgICAvLyBjbGVhbiB1cFxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHYpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gd2F0Y2hCeVNlbGVjdG9yIChEUk9QLUlOKSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBUTVV0aWxzLndhdGNoQnlTZWxlY3RvciA9IGZ1bmN0aW9uIHdhdGNoQnlTZWxlY3Rvcih7XG4gICAgICAgIHNlbGVjdG9yLFxuICAgICAgICBvbkNoYW5nZTogb25WYWx1ZSxcbiAgICAgICAgaW5pdGlhbCA9IHRydWUsXG4gICAgICAgIGZpcmVPbiA9ICdjaGFuZ2UnLCAgICAgICAgICAgICAvLyAnY2hhbmdlJyB8ICdibHVyJ1xuICAgICAgICBzZXR0bGVNcyA9IDI1MCwgICAgICAgICAgICAgICAgLy8gd2FpdCBmb3IgS08vS2VuZG8vRE9NIHRvIHNldHRsZVxuICAgICAgICBrb1ByZWZlciA9ICdyb290JyxcbiAgICAgICAgYmFnS2V5cyA9IFsndmFsdWUnLCAnZGlzcGxheVZhbHVlJywgJ2JvdW5kRGlzcGxheVZhbHVlJywgJ3RleHRJbnB1dCddLFxuICAgICAgICB3aWRnZXRTZWxlY3RvciA9ICcuay1jb21ib2JveCwuay1kcm9wZG93biwuay1kcm9wZG93bmxpc3QsLmstYXV0b2NvbXBsZXRlLFtyb2xlPVwiY29tYm9ib3hcIl0nLFxuICAgICAgICB0aW1lb3V0TXMgPSAzMDAwMCxcbiAgICAgICAgbG9nZ2VyID0gbnVsbFxuICAgIH0gPSB7fSkge1xuICAgICAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgICAgIGNvbnN0IGlzT2JzID0gKHgpID0+IChLTz8uaXNPYnNlcnZhYmxlPy4oeCkpIHx8ICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgeC5zdWJzY3JpYmUgPT09ICdmdW5jdGlvbicpO1xuICAgICAgICBjb25zdCB1biA9ICh4KSA9PiBLTz8udW53cmFwID8gS08udW53cmFwKHgpIDogKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nID8geCgpIDogeCk7XG4gICAgICAgIGNvbnN0IGxvZyA9ICguLi5hKSA9PiBsb2dnZXI/LmxvZz8uKC4uLmEpO1xuXG4gICAgICAgIGZ1bmN0aW9uIGhvb2tOb3coKSB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgICAgICAgICAgaWYgKCFlbCkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgICAgIGxldCBjdHggPSBudWxsLCBiYWcgPSBudWxsLCBvYnMgPSBudWxsO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjdHggPSBLTz8uY29udGV4dEZvciA/IEtPLmNvbnRleHRGb3IoZWwpIDogbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCBpZCA9IGVsLmlkO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZyb21Sb290ID0gaWQgJiYgY3R4Py4kcm9vdD8uZWxlbWVudHM/LltpZF07XG4gICAgICAgICAgICAgICAgY29uc3QgZnJvbURhdGEgPSBpZCAmJiBjdHg/LiRkYXRhPy5lbGVtZW50cz8uW2lkXTtcbiAgICAgICAgICAgICAgICBiYWcgPSAoa29QcmVmZXIgPT09ICdkYXRhJyA/IGZyb21EYXRhIDogZnJvbVJvb3QpIHx8IChrb1ByZWZlciA9PT0gJ2RhdGEnID8gZnJvbVJvb3QgOiBmcm9tRGF0YSkgfHwgbnVsbDtcblxuICAgICAgICAgICAgICAgIGlmIChiYWcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FuZCA9IGJhZ0tleXMubWFwKGsgPT4gYmFnW2tdKS5maW5kKEJvb2xlYW4pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXNPYnMoY2FuZCkpIG9icyA9IGNhbmQ7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCFvYnMgJiYgS08/LmNvbnRleHRGb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGJSYXcgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtYmluZCcpIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtID0gLyg/OnZhbHVlfHRleHRJbnB1dClcXHMqOlxccyooW14sfV0rKS8uZXhlYyhkYlJhdyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBleHByID0gbVsxXS50cmltKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBldmFsSW4gPSAob2JqKSA9PiB7IHRyeSB7IHJldHVybiBGdW5jdGlvbignd2l0aCh0aGlzKXtyZXR1cm4gKCcgKyBleHByICsgJyl9JykuY2FsbChvYmopOyB9IGNhdGNoIHsgcmV0dXJuIHVuZGVmaW5lZDsgfSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvYmUgPSBldmFsSW4oY3R4Py5ba29QcmVmZXIgPT09ICdkYXRhJyA/ICckZGF0YScgOiAnJHJvb3QnXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNPYnMocHJvYmUpKSBvYnMgPSBwcm9iZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub29wICovIH1cblxuICAgICAgICAgICAgY29uc3Qga2VuZG9XcmFwID0gZWwuY2xvc2VzdCh3aWRnZXRTZWxlY3Rvcik7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBrZW5kb1dyYXA/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgZWw7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlYWQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHY7XG4gICAgICAgICAgICAgICAgaWYgKG9icykgdiA9IHVuKG9icyk7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoYmFnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhZ1ZhbCA9IGJhZ0tleXMubWFwKGsgPT4gYmFnW2tdKS5maW5kKEJvb2xlYW4pO1xuICAgICAgICAgICAgICAgICAgICB2ID0gdHlwZW9mIGJhZ1ZhbCA9PT0gJ2Z1bmN0aW9uJyA/IGJhZ1ZhbCgpIDogYmFnVmFsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodiA9PSBudWxsIHx8IHYgPT09ICcnKSB2ID0gKGVsLnZhbHVlID8/IGVsLnRleHRDb250ZW50ID8/ICcnKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzID0gQXJyYXkuaXNBcnJheSh2KSA/IHZbMF0gOiB2O1xuICAgICAgICAgICAgICAgIHJldHVybiAocyA/PyAnJykudG9TdHJpbmcoKS50cmltKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBmaXJlID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbCA9IHJlYWQoKTtcbiAgICAgICAgICAgICAgICBpZiAodmFsICE9PSAnJyAmJiB0eXBlb2Ygb25WYWx1ZSA9PT0gJ2Z1bmN0aW9uJykgb25WYWx1ZSh2YWwpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHF1ZXVlRmlyZSA9IF9fdG1DcmVhdGVRdWlldERpc3BhdGNoZXIoZmlyZSwgc2V0dGxlTXMpO1xuXG4gICAgICAgICAgICBjb25zdCB1bnN1YnMgPSBbXTtcblxuICAgICAgICAgICAgLy8gSW5pdGlhbCBmaXJlIChza2lwIGlmIGJsdXItbW9kZSwgYmVjYXVzZSB1c2VyIGhhc25cdTIwMTl0IGNvbmZpcm1lZCB5ZXQpXG4gICAgICAgICAgICBpZiAoaW5pdGlhbCAmJiBmaXJlT24gIT09ICdibHVyJykgcXVldWVGaXJlKCk7XG5cbiAgICAgICAgICAgIC8vIEtPIHN1YnNjcmlwdGlvbnMgY29sbGFwc2UgaW50byBhIHNpbmdsZSBxdWV1ZWQgZmlyZVxuICAgICAgICAgICAgaWYgKG9icyAmJiB0eXBlb2Ygb2JzLnN1YnNjcmliZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHN1YiA9IG9icy5zdWJzY3JpYmUoKCkgPT4gcXVldWVGaXJlKCkpO1xuICAgICAgICAgICAgICAgIHVuc3Vicy5wdXNoKCgpID0+IHN1Yi5kaXNwb3NlPy4oKSk7XG4gICAgICAgICAgICAgICAgbG9nPy4oJ3dhdGNoQnlTZWxlY3RvcjogS08gb2JzZXJ2YWJsZSBzdWJzY3JpcHRpb24gYXR0YWNoZWQgZm9yJywgc2VsZWN0b3IpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBCYWcgd3JhcHBlcnMgKG9wdGlvbmFsKVxuICAgICAgICAgICAgaWYgKGJhZykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJhZ1VuaG9va3MgPSBbXTtcbiAgICAgICAgICAgICAgICBjb25zdCB3cmFwID0gKG9iaiwgbmFtZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqW25hbWVdICE9PSAnZnVuY3Rpb24nKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG9yaWcgPSBvYmpbbmFtZV07XG4gICAgICAgICAgICAgICAgICAgIG9ialtuYW1lXSA9IGZ1bmN0aW9uIHdyYXBwZWQoLi4uYXJncykgeyB0cnkgeyBxdWV1ZUZpcmUoKTsgfSBjYXRjaCB7IH0gcmV0dXJuIG9yaWcuYXBwbHkodGhpcywgYXJncyk7IH07XG4gICAgICAgICAgICAgICAgICAgIGJhZ1VuaG9va3MucHVzaCgoKSA9PiB7IG9ialtuYW1lXSA9IG9yaWc7IH0pO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgWydvbmNoYW5nZScsICdvbmJsdXInLCAnb25rZXl1cCcsICdvbmtleWRvd24nXS5mb3JFYWNoKG4gPT4gd3JhcChiYWcsIG4pKTtcbiAgICAgICAgICAgICAgICB1bnN1YnMucHVzaCgoKSA9PiBiYWdVbmhvb2tzLmZvckVhY2goZm4gPT4geyB0cnkgeyBmbigpOyB9IGNhdGNoIHsgfSB9KSk7XG4gICAgICAgICAgICAgICAgbG9nPy4oJ3dhdGNoQnlTZWxlY3RvcjogYmFnIGV2ZW50IHdyYXBwZXJzIGF0dGFjaGVkIGZvcicsIHNlbGVjdG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRE9NIGxpc3RlbmVycyBcdTIwMTQgbm8gJ2lucHV0JyBoYW5kbGVyIGluIGJsdXIvY2hhbmdlIG1vZGUgPT4gbm8ga2V5c3Ryb2tlIHNwYW1cbiAgICAgICAgICAgIGlmIChmaXJlT24gPT09ICdibHVyJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9uRm9jdXNPdXQgPSAoKSA9PiBxdWV1ZUZpcmUoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBvbkNoYW5nZSA9ICgpID0+IHF1ZXVlRmlyZSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG9uS2V5RG93biA9IChlKSA9PiB7IGlmIChlLmtleSA9PT0gJ1RhYicgfHwgZS5rZXkgPT09ICdFbnRlcicpIHNldFRpbWVvdXQocXVldWVGaXJlLCAwKTsgfTtcblxuICAgICAgICAgICAgICAgIC8vIEZvY3VzLW91dCAoYnViYmxpbmcpIGlzIG1vcmUgcmVsaWFibGUgd2l0aCBLZW5kbyB3cmFwcGVyczsgdXNlIGNhcHR1cmVcbiAgICAgICAgICAgICAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCBvbkZvY3VzT3V0LCB0cnVlKTtcbiAgICAgICAgICAgICAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgb25LZXlEb3duKTtcblxuICAgICAgICAgICAgICAgIC8vIElmIHRoZXJlIGlzIGEgd2lkZ2V0IHdyYXBwZXIsIGxpc3RlbiB0aGVyZSB0b28gKHNvbWUgY29tYm9zIG1vdmUgZm9jdXMpXG4gICAgICAgICAgICAgICAgaWYgKGtlbmRvV3JhcCAmJiBrZW5kb1dyYXAgIT09IHRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICBrZW5kb1dyYXAuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCBvbkZvY3VzT3V0LCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAga2VuZG9XcmFwLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBtbyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHF1ZXVlRmlyZSgpKTtcbiAgICAgICAgICAgICAgICBtby5vYnNlcnZlKHRhcmdldCwgeyBjaGlsZExpc3Q6IHRydWUsIGNoYXJhY3RlckRhdGE6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICB1bnN1YnMucHVzaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5yZW1vdmVFdmVudExpc3RlbmVyKCdmb2N1c291dCcsIG9uRm9jdXNPdXQsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIG9uS2V5RG93bik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChrZW5kb1dyYXAgJiYga2VuZG9XcmFwICE9PSB0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtlbmRvV3JhcC5yZW1vdmVFdmVudExpc3RlbmVyKCdmb2N1c291dCcsIG9uRm9jdXNPdXQsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAga2VuZG9XcmFwLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBtby5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9uQ2hhbmdlID0gKCkgPT4gcXVldWVGaXJlKCk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlKTtcbiAgICAgICAgICAgICAgICB1bnN1YnMucHVzaCgoKSA9PiB0YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UpKTtcbiAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICBsb2c/Lignd2F0Y2hCeVNlbGVjdG9yOiBsaXN0ZW5lcnMgYXR0YWNoZWQgZm9yJywgc2VsZWN0b3IsIHRhcmdldCk7XG4gICAgICAgICAgICByZXR1cm4gKCkgPT4geyB1bnN1YnMuZm9yRWFjaChmbiA9PiB7IHRyeSB7IGZuKCk7IH0gY2F0Y2ggeyB9IH0pOyB9O1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHVuc3ViID0gaG9va05vdygpO1xuICAgICAgICBpZiAodHlwZW9mIHVuc3ViID09PSAnZnVuY3Rpb24nKSByZXR1cm4gdW5zdWI7XG5cbiAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgICAgICAgICB1bnN1YiA9IGhvb2tOb3coKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdW5zdWIgPT09ICdmdW5jdGlvbicpIG1vLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIG1vLm9ic2VydmUoZG9jdW1lbnQuYm9keSwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gbW8uZGlzY29ubmVjdCgpLCB0aW1lb3V0TXMpO1xuXG4gICAgICAgIHJldHVybiAoKSA9PiB7IHRyeSB7IHR5cGVvZiB1bnN1YiA9PT0gJ2Z1bmN0aW9uJyAmJiB1bnN1YigpOyB9IGNhdGNoIHsgfSB0cnkgeyBtby5kaXNjb25uZWN0KCk7IH0gY2F0Y2ggeyB9IH07XG4gICAgfTtcblxuICAgIChmdW5jdGlvbiBpbnN0YWxsVG1VcmxPYnNlcnZlcigpIHtcbiAgICAgICAgaWYgKHdpbmRvdy5fX3RtVXJsT2JzSW5zdGFsbGVkKSByZXR1cm47XG4gICAgICAgIHdpbmRvdy5fX3RtVXJsT2JzSW5zdGFsbGVkID0gdHJ1ZTtcblxuICAgICAgICBjb25zdCBFViA9ICd0bXV0aWxzOnVybGNoYW5nZSc7XG4gICAgICAgIGNvbnN0IGZpcmUgPSAoKSA9PiB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoRVYpKTtcblxuICAgICAgICBjb25zdCBvcmlnUHVzaCA9IGhpc3RvcnkucHVzaFN0YXRlO1xuICAgICAgICBoaXN0b3J5LnB1c2hTdGF0ZSA9IGZ1bmN0aW9uICgpIHsgY29uc3QgciA9IG9yaWdQdXNoLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7IGZpcmUoKTsgcmV0dXJuIHI7IH07XG5cbiAgICAgICAgY29uc3Qgb3JpZ1JlcGxhY2UgPSBoaXN0b3J5LnJlcGxhY2VTdGF0ZTtcbiAgICAgICAgaGlzdG9yeS5yZXBsYWNlU3RhdGUgPSBmdW5jdGlvbiAoKSB7IGNvbnN0IHIgPSBvcmlnUmVwbGFjZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyBmaXJlKCk7IHJldHVybiByOyB9O1xuXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdwb3BzdGF0ZScsIGZpcmUpO1xuXG4gICAgICAgIFRNVXRpbHMub25VcmxDaGFuZ2UgPSBmdW5jdGlvbiBvblVybENoYW5nZShjYikge1xuICAgICAgICAgICAgY29uc3QgaCA9ICgpID0+IGNiKGxvY2F0aW9uKTtcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKEVWLCBoKTtcbiAgICAgICAgICAgIHJldHVybiAoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihFViwgaCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgVE1VdGlscy5fZGlzcGF0Y2hVcmxDaGFuZ2UgPSBmaXJlOyAvLyBvcHRpb25hbDogbWFudWFsIHRyaWdnZXJcbiAgICB9KSgpO1xuXG4gICAgVE1VdGlscy5vYnNlcnZlSW5zZXJ0TWFueSA9IGZ1bmN0aW9uIG9ic2VydmVJbnNlcnRNYW55KHNlbGVjdG9yLCBjYWxsYmFjaywgeyByb290ID0gZG9jdW1lbnQuYm9keSwgc3VidHJlZSA9IHRydWUgfSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IHNlZW4gPSBuZXcgV2Vha1NldCgpO1xuXG4gICAgICAgIGZ1bmN0aW9uIHJ1bk9uKGN0eCkge1xuICAgICAgICAgICAgaWYgKGN0eCAmJiBjdHgubm9kZVR5cGUgPT09IDEpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGN0eC5tYXRjaGVzID09PSAnZnVuY3Rpb24nICYmIGN0eC5tYXRjaGVzKHNlbGVjdG9yKSAmJiAhc2Vlbi5oYXMoY3R4KSkge1xuICAgICAgICAgICAgICAgICAgICBzZWVuLmFkZChjdHgpO1xuICAgICAgICAgICAgICAgICAgICB0cnkgeyBjYWxsYmFjayhjdHgpOyB9IGNhdGNoIChlKSB7IGNvbnNvbGUuZXJyb3IoJ29ic2VydmVJbnNlcnRNYW55IGNhbGxiYWNrIGVycm9yOicsIGUpOyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY3R4LnF1ZXJ5U2VsZWN0b3JBbGwgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuLmhhcyhlbCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWVuLmFkZChlbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHsgY2FsbGJhY2soZWwpOyB9IGNhdGNoIChlKSB7IGNvbnNvbGUuZXJyb3IoJ29ic2VydmVJbnNlcnRNYW55IGNhbGxiYWNrIGVycm9yOicsIGUpOyB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG1vID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIobXV0cyA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IG0gb2YgbXV0cykge1xuICAgICAgICAgICAgICAgIGlmIChtLmFkZGVkTm9kZXMgJiYgbS5hZGRlZE5vZGVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBtLmFkZGVkTm9kZXMuZm9yRWFjaChydW5Pbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBtby5vYnNlcnZlKHJvb3QsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlIH0pO1xuICAgICAgICAvLyBmaXJlIGZvciBhbnl0aGluZyBhbHJlYWR5IG9uIHRoZSBwYWdlXG4gICAgICAgIHJ1bk9uKHJvb3QpO1xuXG4gICAgICAgIC8vIHJldHVybiBkaXNwb3NlclxuICAgICAgICByZXR1cm4gKCkgPT4gbW8uZGlzY29ubmVjdCgpO1xuICAgIH07XG5cbiAgICBUTVV0aWxzLnNsZWVwID0gKG1zKSA9PiBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgbXMpKTtcblxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gTmV0d29yayB3YXRjaGVyIChBZGRVcGRhdGVGb3JtIDEwMDMyKSBcdTIwMTQgZmV0Y2ggKyBYSFJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAoZnVuY3Rpb24gYWRkTmV0V2F0Y2hlcigpIHtcbiAgICAgICAgY29uc3Qgcm9vdCA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdyA6IHdpbmRvdyk7XG4gICAgICAgIGNvbnN0IFRNVSA9IHdpbmRvdy5UTVV0aWxzOyAgICAgICAgICAgIC8vIHNhbWUgb2JqZWN0IHlvdSBleHBvcnQgYXQgdGhlIGVuZFxuICAgICAgICBUTVUubmV0ID0gVE1VLm5ldCB8fCB7fTtcblxuICAgICAgICBUTVUubmV0LmVuc3VyZVdhdGNoZXIgPSBmdW5jdGlvbiBlbnN1cmVXYXRjaGVyKCkge1xuICAgICAgICAgICAgaWYgKHJvb3QuX19sdE5ldFBhdGNoZWQpIHJldHVybjtcbiAgICAgICAgICAgIHJvb3QuX19sdE5ldFBhdGNoZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICAvLyAtLS0tIGZldGNoKCkgLS0tLVxuICAgICAgICAgICAgY29uc3Qgb3JpZ0ZldGNoID0gcm9vdC5mZXRjaCAmJiByb290LmZldGNoLmJpbmQocm9vdCk7XG4gICAgICAgICAgICBpZiAob3JpZ0ZldGNoKSB7XG4gICAgICAgICAgICAgICAgcm9vdC5mZXRjaCA9IGZ1bmN0aW9uIChpbnB1dCwgaW5pdCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVxID0gKGlucHV0IGluc3RhbmNlb2YgUmVxdWVzdCkgPyBpbnB1dCA6IG5ldyBSZXF1ZXN0KGlucHV0LCBpbml0IHx8IHt9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHVybCA9IFN0cmluZyhyZXEudXJsIHx8ICcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1ldGhvZCA9IChyZXEubWV0aG9kIHx8IChpbml0ICYmIGluaXQubWV0aG9kKSB8fCAnR0VUJykudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc1RhcmdldCh1cmwsIG1ldGhvZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXEuY2xvbmUoKS5hcnJheUJ1ZmZlcigpLnRoZW4oYnVmID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3QgPSByZXEuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBib2R5ID0gcGFyc2VCb2R5RnJvbUJ1ZmZlcihidWYsIGN0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgVE1VLm5ldC5faGFuZGxlQWRkVXBkYXRlKHVybCwgYm9keSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4geyB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdGZXRjaChpbnB1dCwgaW5pdCk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gLS0tLSBYSFIgLS0tLVxuICAgICAgICAgICAgY29uc3QgWEhSID0gcm9vdC5YTUxIdHRwUmVxdWVzdDtcbiAgICAgICAgICAgIGlmIChYSFIgJiYgWEhSLnByb3RvdHlwZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9wZW4gPSBYSFIucHJvdG90eXBlLm9wZW47XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VuZCA9IFhIUi5wcm90b3R5cGUuc2VuZDtcbiAgICAgICAgICAgICAgICBjb25zdCBzZXRSZXF1ZXN0SGVhZGVyID0gWEhSLnByb3RvdHlwZS5zZXRSZXF1ZXN0SGVhZGVyO1xuXG4gICAgICAgICAgICAgICAgWEhSLnByb3RvdHlwZS5vcGVuID0gZnVuY3Rpb24gKG1ldGhvZCwgdXJsKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX19sdE1ldGhvZCA9IFN0cmluZyhtZXRob2QgfHwgJ0dFVCcpLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX19sdFVybCA9IFN0cmluZyh1cmwgfHwgJycpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9fbHRIZWFkZXJzID0ge307XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvcGVuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBYSFIucHJvdG90eXBlLnNldFJlcXVlc3RIZWFkZXIgPSBmdW5jdGlvbiAoaywgdikge1xuICAgICAgICAgICAgICAgICAgICB0cnkgeyB0aGlzLl9fbHRIZWFkZXJzW2sudG9Mb3dlckNhc2UoKV0gPSB2OyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2V0UmVxdWVzdEhlYWRlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgWEhSLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24gKGJvZHkpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHVybCA9IHRoaXMuX19sdFVybCB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1ldGhvZCA9IHRoaXMuX19sdE1ldGhvZCB8fCAnR0VUJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc1RhcmdldCh1cmwsIG1ldGhvZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdCA9ICh0aGlzLl9fbHRIZWFkZXJzWydjb250ZW50LXR5cGUnXSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG9iaiA9IHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgYm9keSA9PT0gJ3N0cmluZycpIG9iaiA9IHBhcnNlQm9keUZyb21TdHJpbmcoYm9keSwgY3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGJvZHkgaW5zdGFuY2VvZiBVUkxTZWFyY2hQYXJhbXMpIG9iaiA9IE9iamVjdC5mcm9tRW50cmllcyhib2R5LmVudHJpZXMoKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAocm9vdC5Gb3JtRGF0YSAmJiBib2R5IGluc3RhbmNlb2YgRm9ybURhdGEpIG9iaiA9IE9iamVjdC5mcm9tRW50cmllcyhib2R5LmVudHJpZXMoKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVE1VLm5ldC5faGFuZGxlQWRkVXBkYXRlKHVybCwgb2JqKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNlbmQuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIFRNVS5uZXQub25BZGRVcGRhdGUgPSBmdW5jdGlvbiBvbkFkZFVwZGF0ZShmbikge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuICgpID0+IHsgfTtcbiAgICAgICAgICAgIGNvbnN0IGggPSAoZSkgPT4gZm4oZS5kZXRhaWwgfHwge30pO1xuICAgICAgICAgICAgcm9vdC5hZGRFdmVudExpc3RlbmVyKCdMVDpRdW90ZVBhcnRBZGRVcGRhdGVGb3JtJywgaCk7XG4gICAgICAgICAgICByZXR1cm4gKCkgPT4gcm9vdC5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRdW90ZVBhcnRBZGRVcGRhdGVGb3JtJywgaCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgVE1VLm5ldC5nZXRMYXN0QWRkVXBkYXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKFRNVS5zdGF0ZT8ubGFzdEFkZFVwZGF0ZUZvcm0pIHJldHVybiBUTVUuc3RhdGUubGFzdEFkZFVwZGF0ZUZvcm07XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKCdMVF9MQVNUX0FERFVQREFURUZPUk0nKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcyA/IEpTT04ucGFyc2UocykgOiBudWxsO1xuICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiBudWxsOyB9XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gLS0tLSBpbnRlcm5hbHMgLS0tLVxuICAgICAgICBmdW5jdGlvbiBpc1RhcmdldCh1cmwsIG1ldGhvZCkge1xuICAgICAgICAgICAgcmV0dXJuIG1ldGhvZCA9PT0gJ1BPU1QnXG4gICAgICAgICAgICAgICAgJiYgL1xcL1NhbGVzQW5kQ1JNXFwvUXVvdGVQYXJ0XFwvQWRkVXBkYXRlRm9ybS9pLnRlc3QodXJsKVxuICAgICAgICAgICAgICAgICYmIC8oPzpcXD98Jilzb3VyY2VBY3Rpb25LZXk9MTAwMzIoPzomfCQpL2kudGVzdCh1cmwpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcGFyc2VCb2R5RnJvbUJ1ZmZlcihidWYsIGNvbnRlbnRUeXBlKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoYnVmIHx8IG5ldyBVaW50OEFycmF5KCkpO1xuICAgICAgICAgICAgICAgIHJldHVybiBwYXJzZUJvZHlGcm9tU3RyaW5nKHRleHQsIGNvbnRlbnRUeXBlKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4ge307IH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHBhcnNlQm9keUZyb21TdHJpbmcodGV4dCwgY29udGVudFR5cGUpIHtcbiAgICAgICAgICAgIGlmICghdGV4dCkgcmV0dXJuIHt9O1xuICAgICAgICAgICAgY29uc3QgY3QgPSAoY29udGVudFR5cGUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBpZiAoY3QuaW5jbHVkZXMoJ2FwcGxpY2F0aW9uL2pzb24nKSB8fCAvXltcXHN7XFxbXS8udGVzdCh0ZXh0KSkge1xuICAgICAgICAgICAgICAgIHRyeSB7IHJldHVybiBKU09OLnBhcnNlKHRleHQpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGN0LmluY2x1ZGVzKCdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnKSB8fCB0ZXh0LmluY2x1ZGVzKCc9JykpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyByZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKG5ldyBVUkxTZWFyY2hQYXJhbXModGV4dCkuZW50cmllcygpKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIFRNVS5uZXQuX2hhbmRsZUFkZFVwZGF0ZSA9IGZ1bmN0aW9uICh1cmwsIHBheWxvYWQpIHtcbiAgICAgICAgICAgIGNvbnN0IHF1b3RlS2V5ID1cbiAgICAgICAgICAgICAgICBOdW1iZXIocGF5bG9hZD8uUXVvdGVLZXkpIHx8XG4gICAgICAgICAgICAgICAgTnVtYmVyKCgvWz8mXVF1b3RlS2V5PShcXGQrKS9pLmV4ZWModXJsKSB8fCBbXSlbMV0pIHx8XG4gICAgICAgICAgICAgICAgdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICBjb25zdCBoYXNQYXJ0Tm8gPVxuICAgICAgICAgICAgICAgICEhKHBheWxvYWQ/LlBhcnRObyB8fCBwYXlsb2FkPy5QYXJ0S2V5IHx8IHBheWxvYWQ/LlBhcnROYW1lKSB8fFxuICAgICAgICAgICAgICAgIChBcnJheS5pc0FycmF5KHBheWxvYWQ/Ll9fcmV2aXNpb25UcmFja2luZ0RhdGEpICYmXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQuX19yZXZpc2lvblRyYWNraW5nRGF0YS5zb21lKHggPT5cbiAgICAgICAgICAgICAgICAgICAgICAgIEFycmF5LmlzQXJyYXkoeC5yZXZpc2lvblRyYWNraW5nRW50cmllcykgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHgucmV2aXNpb25UcmFja2luZ0VudHJpZXMuc29tZShlID0+IC9QYXJ0IE5vL2kudGVzdChlPy5GaWVsZCB8fCAnJykpXG4gICAgICAgICAgICAgICAgICAgICkpO1xuXG4gICAgICAgICAgICBjb25zdCBkZXRhaWwgPSB7XG4gICAgICAgICAgICAgICAgdXJsLFxuICAgICAgICAgICAgICAgIHF1b3RlS2V5LFxuICAgICAgICAgICAgICAgIGhhc1BhcnRObyxcbiAgICAgICAgICAgICAgICBwYXJ0Tm86IHBheWxvYWQ/LlBhcnRObyA/PyBudWxsLFxuICAgICAgICAgICAgICAgIGN1c3RvbWVyUGFydE5vOiBwYXlsb2FkPy5DdXN0b21lclBhcnRObyA/PyBudWxsLFxuICAgICAgICAgICAgICAgIHBhcnRLZXk6IHBheWxvYWQ/LlBhcnRLZXkgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICBhdDogRGF0ZS5ub3coKVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgVE1VLnN0YXRlID0gVE1VLnN0YXRlIHx8IHt9O1xuICAgICAgICAgICAgVE1VLnN0YXRlLmxhc3RBZGRVcGRhdGVGb3JtID0gZGV0YWlsO1xuICAgICAgICAgICAgdHJ5IHsgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnTFRfTEFTVF9BRERVUERBVEVGT1JNJywgSlNPTi5zdHJpbmdpZnkoZGV0YWlsKSk7IH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgICAgIHRyeSB7IHJvb3QuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlF1b3RlUGFydEFkZFVwZGF0ZUZvcm0nLCB7IGRldGFpbCB9KSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIH07XG4gICAgfSkoKTtcblxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gXHVEODNEXHVERDAxIEdsb2JhbCBleHBvc3VyZSBmb3IgVGFtcGVyTW9ua2V5IHNhbmRib3hcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3QuYXNzaWduKFRNVXRpbHMsIHtcbiAgICAgICAgZ2V0QXBpS2V5LFxuICAgICAgICBmZXRjaERhdGE6IFRNVXRpbHMuZmV0Y2hEYXRhLCBcbiAgICAgICAgd2FpdEZvck1vZGVsQXN5bmMsXG4gICAgICAgIHdhdGNoQnlMYWJlbDogVE1VdGlscy53YXRjaEJ5TGFiZWwsXG4gICAgICAgIGF3YWl0VmFsdWVCeUxhYmVsOiBUTVV0aWxzLmF3YWl0VmFsdWVCeUxhYmVsLFxuICAgICAgICB3YXRjaEJ5U2VsZWN0b3I6IFRNVXRpbHMud2F0Y2hCeVNlbGVjdG9yLFxuICAgICAgICBvYnNlcnZlSW5zZXJ0TWFueTogVE1VdGlscy5vYnNlcnZlSW5zZXJ0TWFueSxcbiAgICAgICAgc2hvd01lc3NhZ2UsIGhpZGVNZXNzYWdlLCBvYnNlcnZlSW5zZXJ0LFxuICAgICAgICBzZWxlY3RPcHRpb25CeVRleHQsIHNlbGVjdE9wdGlvbkJ5VmFsdWUsXG4gICAgICAgIHRvYXN0LFxuICAgICAgICBsb2csIHdhcm4sIGVycm9yLCBvayxcbiAgICAgICAgZW5zdXJlUm91dGUsIG9uUm91dGVDaGFuZ2UsIG1hdGNoUm91dGUsXG4gICAgICAgIHNldERlYnVnLCBtYWtlTG9nZ2VyLCBnZXRMb2dnZXIsIGF0dGFjaExvZ2dlckdsb2JhbCxcbiAgICAgICAgZHM6IFRNVXRpbHMuZHMsIGRzUm93czogVE1VdGlscy5kc1Jvd3MsXG4gICAgICAgIG5ldDogVE1VdGlscy5uZXQsXG5cbiAgICB9KTtcbn0pKHdpbmRvdyk7XG4iXSwKICAibWFwcGluZ3MiOiAiOztBQWNBLEdBQUMsU0FBVUEsU0FBUTtBQUNmO0FBTUEsVUFBTSxVQUFVLENBQUM7QUFDakIsSUFBQUEsUUFBTyxVQUFVO0FBQ2pCLFFBQUksT0FBTyxpQkFBaUIsWUFBYSxjQUFhLFVBQVU7QUFHaEUsUUFBSSxFQUFFLG1CQUFtQixTQUFVLFNBQVEsZ0JBQWdCO0FBRzNELGFBQVMsZUFBZSxLQUFLO0FBQ3pCLFVBQUksQ0FBQyxJQUFLLFFBQU87QUFDakIsVUFBSSxxQkFBcUIsS0FBSyxHQUFHLEVBQUcs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Q0E7QUFBQSxVQUNBLFFBQVEsU0FBUyxVQUFVO0FBQUEsVUFDM0IsZ0JBQWdCLFNBQVMsa0JBQWtCO0FBQUEsVUFDM0MsU0FBUyxTQUFTLFdBQVc7QUFBQSxVQUM3QixJQUFJLEtBQUssSUFBSTtBQUFBLFFBQ2pCO0FBRUEsWUFBSSxRQUFRLElBQUksU0FBUyxDQUFDO0FBQzFCLFlBQUksTUFBTSxvQkFBb0I7QUFDOUIsWUFBSTtBQUFFLHlCQUFlLFFBQVEseUJBQXlCLEtBQUssVUFBVSxNQUFNLENBQUM7QUFBQSxRQUFHLFFBQVE7QUFBQSxRQUFFO0FBRXpGLFlBQUk7QUFBRSxlQUFLLGNBQWMsSUFBSSxZQUFZLDZCQUE2QixFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQUEsUUFBRyxRQUFRO0FBQUEsUUFBRTtBQUFBLE1BQ2xHO0FBQUEsSUFDSixHQUFHO0FBTUgsV0FBTyxPQUFPLFNBQVM7QUFBQSxNQUNuQjtBQUFBLE1BQ0EsV0FBVyxRQUFRO0FBQUEsTUFDbkI7QUFBQSxNQUNBLGNBQWMsUUFBUTtBQUFBLE1BQ3RCLG1CQUFtQixRQUFRO0FBQUEsTUFDM0IsaUJBQWlCLFFBQVE7QUFBQSxNQUN6QixtQkFBbUIsUUFBUTtBQUFBLE1BQzNCO0FBQUEsTUFBYTtBQUFBLE1BQWE7QUFBQSxNQUMxQjtBQUFBLE1BQW9CO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFBSztBQUFBLE1BQU07QUFBQSxNQUFPO0FBQUEsTUFDbEI7QUFBQSxNQUFhO0FBQUEsTUFBZTtBQUFBLE1BQzVCO0FBQUEsTUFBVTtBQUFBLE1BQVk7QUFBQSxNQUFXO0FBQUEsTUFDakMsSUFBSSxRQUFRO0FBQUEsTUFBSSxRQUFRLFFBQVE7QUFBQSxNQUNoQyxLQUFLLFFBQVE7QUFBQSxJQUVqQixDQUFDO0FBQUEsRUFDTCxHQUFHLE1BQU07IiwKICAibmFtZXMiOiBbIndpbmRvdyIsICJvayIsICJyb290IiwgIktPIiwgImlzQXJyYXlUYXJnZXQiLCAiY3VyIiwgImxvZyIsICJtbyJdCn0K
