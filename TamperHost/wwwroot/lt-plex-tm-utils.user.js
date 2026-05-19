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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LXBsZXgtdG0tdXRpbHMudXNlci5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gPT1Vc2VyU2NyaXB0PT1cbi8vIEBuYW1lICAgICAgICAgTFQgXHUyMDNBIFBsZXggVE0gVXRpbHNcbi8vIEBuYW1lc3BhY2UgICAgaHR0cHM6Ly9naXRodWIuY29tL0FscGhhR2VlazUwOS9wbGV4LXRhbXBlcm1vbmtleS1zY3JpcHRzXG4vLyBAdmVyc2lvbiAgICAgIDIwMjYuMDUuMTkuMTNcbi8vIEBkZXNjcmlwdGlvbiAgU2hhcmVkIHV0aWxpdGllc1xuLy8gQG1hdGNoICAgICAgICBodHRwczovLyoub24ucGxleC5jb20vKlxuLy8gQG1hdGNoICAgICAgICBodHRwczovLyoucGxleC5jb20vKlxuLy8gQGdyYW50ICAgICAgICBHTV94bWxodHRwUmVxdWVzdFxuLy8gQGdyYW50ICAgICAgICB1bnNhZmVXaW5kb3dcbi8vIEBncmFudCAgICAgICAgR01fZ2V0VmFsdWVcbi8vIEBncmFudCAgICAgICAgR01fc2V0VmFsdWVcbi8vIEBjb25uZWN0ICAgICAgKi5wbGV4LmNvbVxuLy8gPT0vVXNlclNjcmlwdD09XG5cbihmdW5jdGlvbiAod2luZG93KSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gRU5WIC8gRkxBR1NcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBDcmVhdGUgKyBleHBvc2UgZmlyc3Qgc28gd2UgY2FuIHNhZmVseSBhdHRhY2ggcHJvcHMgYmVsb3dcbiAgICBjb25zdCBUTVV0aWxzID0ge307XG4gICAgd2luZG93LlRNVXRpbHMgPSBUTVV0aWxzO1xuICAgIGlmICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJykgdW5zYWZlV2luZG93LlRNVXRpbHMgPSBUTVV0aWxzO1xuXG4gICAgLy8gZW5zdXJlIGEgcGxhY2UgdG8gY2FjaGUgdGhlIGtleSBsaXZlcyBvbiB0aGUgc2hhcmVkIG9iamVjdFxuICAgIGlmICghKCdfX2FwaUtleUNhY2hlJyBpbiBUTVV0aWxzKSkgVE1VdGlscy5fX2FwaUtleUNhY2hlID0gbnVsbDtcblxuICAgIC8vIE5vcm1hbGl6ZSBsaWtlIHRoZSBhdXRoIGhlbHBlciAoYWNjZXB0cyBcInVzZXI6cGFzc1wiLCBcIkJhc2ljIFx1MjAyNlwiLCBcIkJlYXJlciBcdTIwMjZcIilcbiAgICBmdW5jdGlvbiBfbm9ybWFsaXplQXV0aChyYXcpIHtcbiAgICAgICAgaWYgKCFyYXcpIHJldHVybiAnJztcbiAgICAgICAgaWYgKC9eKEJhc2ljfEJlYXJlcilcXHMvaS50ZXN0KHJhdykpIHJldHVybiByYXcudHJpbSgpO1xuICAgICAgICAvLyBBY2NlcHQgXCJ1c2VyOnBhc3NcIiBhbmQgZW5jb2RlIGFzIEJhc2ljXG4gICAgICAgIHRyeSB7IHJldHVybiBgQmFzaWMgJHtidG9hKHJhdy50cmltKCkpfWA7IH0gY2F0Y2ggeyByZXR1cm4gJyc7IH1cbiAgICB9XG5cbiAgICAvLyBSZXNvbHZlIEFQSSBrZXkgYWNyb3NzIHJvdXRlczogcHJlZmVyIFBsZXhBdXRoL1BsZXhBUEksIGZhbGxiYWNrIHRvIEdNL2xvY2FsU3RvcmFnZS5cbiAgICAvLyBNaXJyb3JzIHRoZSByZXNvbHZlZCBrZXkgdG8gbG9jYWxTdG9yYWdlICsgR00gc28gZnV0dXJlIGxvYWRzIG9uIHRoaXMgc3ViZG9tYWluIGRvblx1MjAxOXQgbmVlZCB0byB3YWl0LlxuICAgIGFzeW5jIGZ1bmN0aW9uIGdldEFwaUtleSh7XG4gICAgICAgIHdhaXQgPSBmYWxzZSwgICAgICAgLy8gc2V0IHRydWUgb24gcm91dGVzIHRoYXQgbG9hZCBQbGV4QXV0aCBsYXRlXG4gICAgICAgIHRpbWVvdXRNcyA9IDAsXG4gICAgICAgIHBvbGxNcyA9IDIwMCxcbiAgICAgICAgdXNlQ2FjaGUgPSB0cnVlLFxuICAgICAgICBjYWNoZU1zID0gNSAqIDYwXzAwMFxuICAgIH0gPSB7fSkge1xuICAgICAgICAvLyBjYWNoZSBmYXN0LXBhdGggKGxpdmVzIG9uIFRNVXRpbHMgdG8gYXZvaWQgc2NvcGUgaXNzdWVzKVxuICAgICAgICBjb25zdCBjYWNoZWQgPSBUTVV0aWxzLl9fYXBpS2V5Q2FjaGU7XG4gICAgICAgIGlmICh1c2VDYWNoZSAmJiBjYWNoZWQgJiYgKERhdGUubm93KCkgLSBjYWNoZWQudHMpIDwgY2FjaGVNcykge1xuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZC52YWx1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJvb3QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xuXG4gICAgICAgIGNvbnN0IHJlc29sdmVHZXR0ZXIgPSAoKSA9PlxuICAgICAgICAgICAgKHJvb3Q/LlBsZXhBdXRoICYmIHR5cGVvZiByb290LlBsZXhBdXRoLmdldEtleSA9PT0gJ2Z1bmN0aW9uJyAmJiByb290LlBsZXhBdXRoLmdldEtleSkgfHxcbiAgICAgICAgICAgIChyb290Py5QbGV4QVBJICYmIHR5cGVvZiByb290LlBsZXhBUEkuZ2V0S2V5ID09PSAnZnVuY3Rpb24nICYmIHJvb3QuUGxleEFQSS5nZXRLZXkpIHx8XG4gICAgICAgICAgICBudWxsO1xuXG4gICAgICAgIGxldCBnZXR0ZXIgPSByZXNvbHZlR2V0dGVyKCk7XG5cbiAgICAgICAgaWYgKCFnZXR0ZXIgJiYgd2FpdCAmJiB0aW1lb3V0TXMgPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICB3aGlsZSAoIWdldHRlciAmJiAoRGF0ZS5ub3coKSAtIHN0YXJ0KSA8IHRpbWVvdXRNcykge1xuICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBwb2xsTXMpKTtcbiAgICAgICAgICAgICAgICBnZXR0ZXIgPSByZXNvbHZlR2V0dGVyKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyAxKSBQcmVmZXJyZWQ6IGhlbHBlciBvYmplY3QgaWYgYXZhaWxhYmxlXG4gICAgICAgIGlmIChnZXR0ZXIpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsID0gZ2V0dGVyLmNhbGwocm9vdCk7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gKHZhbCAmJiB0eXBlb2YgdmFsLnRoZW4gPT09ICdmdW5jdGlvbicpID8gYXdhaXQgdmFsIDogdmFsO1xuICAgICAgICAgICAgICAgIGNvbnN0IG91dCA9IF9ub3JtYWxpemVBdXRoKGtleSk7XG4gICAgICAgICAgICAgICAgaWYgKG91dCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBNaXJyb3Igc28gc3Vic2VxdWVudCBsb2FkcyBvbiB0aGlzIHN1YmRvbWFpbiBkb25cdTIwMTl0IGRlcGVuZCBvbiB0aGUgaGVscGVyIGJlaW5nIHByZXNlbnRcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ1BsZXhBcGlLZXknLCBvdXQpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgICAgICB0cnkgeyBpZiAodHlwZW9mIEdNX3NldFZhbHVlID09PSAnZnVuY3Rpb24nKSBHTV9zZXRWYWx1ZSgnUGxleEFwaUtleScsIG91dCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgIGlmICh1c2VDYWNoZSkgVE1VdGlscy5fX2FwaUtleUNhY2hlID0geyB2YWx1ZTogb3V0LCB0czogRGF0ZS5ub3coKSB9O1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBmYWxsIHRocm91Z2ggKi8gfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gMikgRmFsbGJhY2s6IEdNIHN0b3JlIChhdXRob3JpdGF0aXZlIGlmIHNldCB2aWEgbWVudSlcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJhd0dNID0gdHlwZW9mIEdNX2dldFZhbHVlID09PSAnZnVuY3Rpb24nID8gR01fZ2V0VmFsdWUoJ1BsZXhBcGlLZXknLCAnJykgOiAnJztcbiAgICAgICAgICAgIGlmIChyYXdHTSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG91dCA9IF9ub3JtYWxpemVBdXRoKHJhd0dNKTtcbiAgICAgICAgICAgICAgICBpZiAodXNlQ2FjaGUpIFRNVXRpbHMuX19hcGlLZXlDYWNoZSA9IHsgdmFsdWU6IG91dCwgdHM6IERhdGUubm93KCkgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuXG4gICAgICAgIC8vIDMpIEZhbGxiYWNrOiBsb2NhbFN0b3JhZ2Ugb24gdGhpcyBzdWJkb21haW5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJhd0xTID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ1BsZXhBcGlLZXknKSB8fCAnJztcbiAgICAgICAgICAgIGlmIChyYXdMUykge1xuICAgICAgICAgICAgICAgIGNvbnN0IG91dCA9IF9ub3JtYWxpemVBdXRoKHJhd0xTKTtcbiAgICAgICAgICAgICAgICBpZiAodXNlQ2FjaGUpIFRNVXRpbHMuX19hcGlLZXlDYWNoZSA9IHsgdmFsdWU6IG91dCwgdHM6IERhdGUubm93KCkgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuXG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cblxuICAgIC8vIExvdy1sZXZlbDogb25lIHBsYWNlIHRoYXQgYWN0dWFsbHkgZXhlY3V0ZXMgdGhlIEhUVFAgY2FsbFxuICAgIFRNVXRpbHMuZmV0Y2hEYXRhID0gYXN5bmMgZnVuY3Rpb24gZmV0Y2hEYXRhKHVybCwgeyBtZXRob2QgPSAnR0VUJywgaGVhZGVycyA9IHt9LCBib2R5LCB0aW1lb3V0TXMgPSAxNTAwMCwgdXNlWEhSID0gZmFsc2UgfSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBfbm9ybWFsaXplQXV0aChhd2FpdCBUTVV0aWxzLmdldEFwaUtleSgpLmNhdGNoKCgpID0+ICcnKSk7XG5cbiAgICAgICAgY29uc3QgZmluYWxIZWFkZXJzID0ge1xuICAgICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgIC4uLihib2R5ID8geyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb247Y2hhcnNldD1VVEYtOCcgfSA6IHt9KSxcbiAgICAgICAgICAgIC4uLihhdXRoID8geyAnQXV0aG9yaXphdGlvbic6IGF1dGggfSA6IHt9KSxcbiAgICAgICAgICAgIC4uLmhlYWRlcnNcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IHR5cGVvZiBib2R5ID09PSAnc3RyaW5nJyA/IGJvZHkgOiAoYm9keSA/IEpTT04uc3RyaW5naWZ5KGJvZHkpIDogdW5kZWZpbmVkKTtcblxuICAgICAgICBpZiAodXNlWEhSICYmIHR5cGVvZiBHTV94bWxodHRwUmVxdWVzdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4gcmVqZWN0KG5ldyBFcnJvcignTmV0d29yayB0aW1lb3V0JykpLCB0aW1lb3V0TXMpO1xuICAgICAgICAgICAgICAgIEdNX3htbGh0dHBSZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kLCB1cmwsIGhlYWRlcnM6IGZpbmFsSGVhZGVycywgZGF0YTogcGF5bG9hZCwgdGltZW91dDogdGltZW91dE1zLFxuICAgICAgICAgICAgICAgICAgICBvbmxvYWQ6IChyZXMpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvayA9IHJlcy5zdGF0dXMgPj0gMjAwICYmIHJlcy5zdGF0dXMgPCAzMDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW9rKSByZXR1cm4gcmVqZWN0KG5ldyBFcnJvcihgJHtyZXMuc3RhdHVzfSAke3Jlcy5zdGF0dXNUZXh0IHx8ICdSZXF1ZXN0IGZhaWxlZCd9YCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHsgcmVzb2x2ZShKU09OLnBhcnNlKHJlcy5yZXNwb25zZVRleHQgfHwgJ3t9JykpOyB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRjaCB7IHJlc29sdmUoe30pOyB9IC8vIHRvbGVyYXRlIGVtcHR5L2ludmFsaWQganNvbiA9PiB7fVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBvbmVycm9yOiAoKSA9PiB7IGNsZWFyVGltZW91dCh0aW1lcik7IHJlamVjdChuZXcgRXJyb3IoJ05ldHdvcmsgZXJyb3InKSk7IH0sXG4gICAgICAgICAgICAgICAgICAgIG9udGltZW91dDogKCkgPT4geyBjbGVhclRpbWVvdXQodGltZXIpOyByZWplY3QobmV3IEVycm9yKCdOZXR3b3JrIHRpbWVvdXQnKSk7IH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZmV0Y2ggcGF0aFxuICAgICAgICBjb25zdCBjdHJsID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgICAgICBjb25zdCB0ID0gc2V0VGltZW91dCgoKSA9PiBjdHJsLmFib3J0KCksIHRpbWVvdXRNcyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgZmV0Y2godXJsLCB7XG4gICAgICAgICAgICAgICAgbWV0aG9kLFxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IGZpbmFsSGVhZGVycyxcbiAgICAgICAgICAgICAgICBib2R5OiBwYXlsb2FkLFxuICAgICAgICAgICAgICAgIHNpZ25hbDogY3RybC5zaWduYWwsXG4gICAgICAgICAgICAgICAgY3JlZGVudGlhbHM6ICdpbmNsdWRlJyAgIC8vIGtlZXAgc2FtZS1vcmlnaW4gY29va2llcyB3aGVyZSBuZWVkZWRcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3Aub2spIHRocm93IG5ldyBFcnJvcihgJHtyZXNwLnN0YXR1c30gJHtyZXNwLnN0YXR1c1RleHR9YCk7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgcmVzcC50ZXh0KCk7XG4gICAgICAgICAgICByZXR1cm4gdGV4dCA/IEpTT04ucGFyc2UodGV4dCkgOiB7fTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0KTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyBEUyBoZWxwZXJzOiB0aGUgb25seSBBUEkgeW91ciB1c2Vyc2NyaXB0cyBuZWVkIHRvIGNhbGxcbiAgICBUTVV0aWxzLmRzID0gYXN5bmMgZnVuY3Rpb24gZHMoc291cmNlSWQsIHBheWxvYWQsIG9wdHMgPSB7fSkge1xuICAgICAgICBjb25zdCB1cmwgPSBgJHtsb2NhdGlvbi5vcmlnaW59L2FwaS9kYXRhc291cmNlcy8ke3NvdXJjZUlkfS9leGVjdXRlP2Zvcm1hdD0yYDtcbiAgICAgICAgY29uc3QganNvbiA9IGF3YWl0IFRNVXRpbHMuZmV0Y2hEYXRhKHVybCwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogcGF5bG9hZCwgLi4ub3B0cyB9KTtcbiAgICAgICAgLy8gbm9ybWFsaXplOiBhbHdheXMgcmV0dXJuIHsgcm93czogWy4uLl0gfVxuICAgICAgICBjb25zdCByb3dzID0gQXJyYXkuaXNBcnJheShqc29uPy5yb3dzKSA/IGpzb24ucm93cyA6IFtdO1xuICAgICAgICByZXR1cm4geyAuLi5qc29uLCByb3dzIH07IC8vIGtlZXAgYW55IGV4dHJhIGZpZWxkcyBpZiBQbGV4IGFkZHMgdGhlbVxuICAgIH07XG5cbiAgICBUTVV0aWxzLmRzUm93cyA9IGFzeW5jIGZ1bmN0aW9uIGRzUm93cyhzb3VyY2VJZCwgcGF5bG9hZCwgb3B0cyA9IHt9KSB7XG4gICAgICAgIGNvbnN0IHsgcm93cyB9ID0gYXdhaXQgVE1VdGlscy5kcyhzb3VyY2VJZCwgcGF5bG9hZCwgb3B0cyk7XG4gICAgICAgIHJldHVybiByb3dzO1xuICAgIH07XG5cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIEtPIHVud3JhcCBoZWxwZXJzIChleHBvcnRlZClcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBUTVV0aWxzLnVud3JhcCh2KTogcmV0dXJucyB0aGUgcGxhaW4gdmFsdWUgb2YgYSBLTyBvYnNlcnZhYmxlL2NvbXB1dGVkLCBlbHNlIHZcbiAgICAvLyBUTVV0aWxzLnVud3JhcERlZXAoeCk6IHJlY3Vyc2l2ZWx5IHVud3JhcHMgYXJyYXlzL29iamVjdHMgb2YgS08gdmFsdWVzIChzYWZlIGZvciBKU09OKVxuICAgIC8vIFRNVXRpbHMuanNvblBsYWluKHgsIHNwYWNlPyk6IEpTT04uc3RyaW5naWZ5KFRNVXRpbHMudW53cmFwRGVlcCh4KSwgc3BhY2UpXG4gICAgKGZ1bmN0aW9uIGFkZFVud3JhcEhlbHBlcnMoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG5cbiAgICAgICAgICAgIGlmICghVE1VdGlscy51bndyYXApIHtcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnVud3JhcCA9IGZ1bmN0aW9uIHVud3JhcCh2KSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoS08gJiYgdHlwZW9mIEtPLnVud3JhcCA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIEtPLnVud3JhcCh2KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAodHlwZW9mIHYgPT09ICdmdW5jdGlvbicpID8gdigpIDogdjtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiB2OyB9XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFUTVV0aWxzLnVud3JhcERlZXApIHtcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnVud3JhcERlZXAgPSBmdW5jdGlvbiB1bndyYXBEZWVwKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2VlbiA9IG5ldyBXZWFrTWFwKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNLTyA9IChmbikgPT4gISFmbiAmJiB0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicgJiYgKFxuICAgICAgICAgICAgICAgICAgICAgICAgKEtPICYmIEtPLmlzT2JzZXJ2YWJsZSAmJiBLTy5pc09ic2VydmFibGUoZm4pKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgKEtPICYmIEtPLmlzQ29tcHV0ZWQgJiYgS08uaXNDb21wdXRlZChmbikpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAodHlwZW9mIGZuLnN1YnNjcmliZSA9PT0gJ2Z1bmN0aW9uJykgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZuLl9pc09icyA9PT0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHVuID0gKHYpID0+IChLTyAmJiB0eXBlb2YgS08udW53cmFwID09PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgICAgICAgICAgICAgPyBLTy51bndyYXAodilcbiAgICAgICAgICAgICAgICAgICAgICAgIDogKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nID8gKGlzS08odikgPyB2KCkgOiB2KSA6IHYpO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHdhbGsgPSAodikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIHY7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gdHlwZW9mIHY7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0ID09PSAnc3RyaW5nJyB8fCB0ID09PSAnbnVtYmVyJyB8fCB0ID09PSAnYm9vbGVhbicpIHJldHVybiB2O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodikpIHJldHVybiB2Lm1hcCh3YWxrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0ID09PSAnZnVuY3Rpb24nKSByZXR1cm4gdW4odik7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2Vlbi5oYXModikpIHJldHVybiBzZWVuLmdldCh2KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvdXQgPSBBcnJheS5pc0FycmF5KHYpID8gW10gOiB7fTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWVuLnNldCh2LCBvdXQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgayBpbiB2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodiwgaykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG91dFtrXSA9IHdhbGsodltrXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2O1xuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB3YWxrKHgpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghVE1VdGlscy5qc29uUGxhaW4pIHtcbiAgICAgICAgICAgICAgICBUTVV0aWxzLmpzb25QbGFpbiA9IGZ1bmN0aW9uIGpzb25QbGFpbih4LCBzcGFjZSA9IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgcmV0dXJuIEpTT04uc3RyaW5naWZ5KFRNVXRpbHMudW53cmFwRGVlcCh4KSwgbnVsbCwgc3BhY2UpOyB9XG4gICAgICAgICAgICAgICAgICAgIGNhdGNoIHsgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHgsIG51bGwsIHNwYWNlKTsgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIG5vLW9wOiBLTyBtYXkgbm90IGJlIHByZXNlbnQgeWV0IGluIHNvbWUgY29udGV4dHNcbiAgICAgICAgfVxuICAgIH0pKCk7XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBLTy9QbGV4IG9ic2VydmFibGUgcmVhZCAmIHdyaXRlIGhlbHBlcnNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAoZnVuY3Rpb24gYWRkT2JzQWNjZXNzb3JzKCkge1xuICAgICAgICBjb25zdCByb290ID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICAgICAgY29uc3QgS08gPSByb290LmtvO1xuXG4gICAgICAgIC8vIFJldHVybnMgdGhlIGdldHRlci9zZXR0ZXIgb3IgcGxhaW4gcHJvcCBmcm9tIFBsZXggaGVscGVyIGlmIGF2YWlsYWJsZVxuICAgICAgICBmdW5jdGlvbiBfcGxleEdldHRlcih2bSwgcHJvcCkge1xuICAgICAgICAgICAgY29uc3QgZyA9IHJvb3Q/LnBsZXg/LmRhdGE/LmdldE9ic2VydmFibGVPclZhbHVlO1xuICAgICAgICAgICAgcmV0dXJuICh0eXBlb2YgZyA9PT0gJ2Z1bmN0aW9uJykgPyBnKHZtLCBwcm9wKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZWFkIGEgcHJvcGVydHkgZnJvbSBhIFBsZXggS08gdmlldy1tb2RlbCBhbmQgZnVsbHkgdW53cmFwIGl0LlxuICAgICAgICAgKiAtIFN1cHBvcnRzIGRvdHRlZCBwYXRocyBcIkZvby5CYXJcIlxuICAgICAgICAgKiAtIElmIHRoZSBmaW5hbCB2YWx1ZSBpcyBhbiBhcnJheSBhbmQgb3B0aW9ucy5maXJzdCA9PT0gdHJ1ZSwgcmV0dXJucyBmaXJzdCBpdGVtXG4gICAgICAgICAqIC0gb3B0aW9ucy50cmltOiBpZiB0cnVlLCByZXR1cm5zIGEgdHJpbW1lZCBzdHJpbmcgZm9yIHN0cmluZy9udW1iZXJcbiAgICAgICAgICovXG4gICAgICAgIFRNVXRpbHMuZ2V0T2JzVmFsdWUgPSBmdW5jdGlvbiBnZXRPYnNWYWx1ZSh2bU9yRWwsIHBhdGhPclBhdGhzLCB7XG4gICAgICAgICAgICBmaXJzdCA9IHRydWUsICAgICAgLy8gaWYgdmFsdWUgaXMgYW4gYXJyYXksIHJldHVybiBmaXJzdCBpdGVtXG4gICAgICAgICAgICB0cmltID0gZmFsc2UsICAgICAgLy8gdHJpbSBzdHJpbmcvbnVtYmVyIHRvIHN0cmluZ1xuICAgICAgICAgICAgZGVlcCA9IHRydWUsICAgICAgIC8vIGRlZXAgdW53cmFwIChLTyArIG5lc3RlZClcbiAgICAgICAgICAgIGFsbG93UGxleCA9IHRydWUsICAvLyB1c2UgcGxleC5kYXRhLmdldE9ic2VydmFibGVPclZhbHVlIHdoZW4gYXZhaWxhYmxlXG4gICAgICAgICAgICBjb2FsZXNjZUZhbHN5ID0gZmFsc2UgLy8gaWYgZmFsc2UsIGVtcHR5IHN0cmluZyBpcyB0cmVhdGVkIGFzIFwibm90IGZvdW5kXCIgYW5kIHRyaWVzIG5leHQgY2FuZGlkYXRlXG4gICAgICAgIH0gPSB7fSkge1xuICAgICAgICAgICAgaWYgKCF2bU9yRWwgfHwgIXBhdGhPclBhdGhzKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICBjb25zdCByb290ID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICAgICAgICAgIGNvbnN0IEtPID0gcm9vdC5rbztcbiAgICAgICAgICAgIGNvbnN0IHVud3JhcE9uY2UgPSAodikgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChUTVV0aWxzLnVud3JhcCkgcmV0dXJuIFRNVXRpbHMudW53cmFwKHYpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoS08/LnVud3JhcCkgcmV0dXJuIEtPLnVud3JhcCh2KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJykgPyB2KCkgOiB2O1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gdjsgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHVud3JhcERlZXAgPSAodikgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChUTVV0aWxzLnVud3JhcERlZXApIHJldHVybiBUTVV0aWxzLnVud3JhcERlZXAodik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChLTz8udW53cmFwKSByZXR1cm4gS08udW53cmFwKHYpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nKSA/IHYoKSA6IHY7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiB2OyB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgaXNLT0Z1bmMgPSAoZikgPT4gISFmICYmIHR5cGVvZiBmID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgICAgICAgICAgKEtPPy5pc09ic2VydmFibGU/LihmKSB8fCAncGVlaycgaW4gZiB8fCAnc3Vic2NyaWJlJyBpbiBmIHx8ICdub3RpZnlTdWJzY3JpYmVycycgaW4gZik7XG5cbiAgICAgICAgICAgIC8vIElmIGdpdmVuIGEgRE9NIG5vZGUsIHJlc29sdmUgS08gcm9vdCBWTVxuICAgICAgICAgICAgbGV0IHZtID0gdm1PckVsO1xuICAgICAgICAgICAgaWYgKHZtT3JFbCAmJiB2bU9yRWwubm9kZVR5cGUgPT09IDEpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdHggPSBLTz8uY29udGV4dEZvcj8uKHZtT3JFbCk7XG4gICAgICAgICAgICAgICAgICAgIHZtID0gY3R4Py4kcm9vdD8uZGF0YSA/PyBjdHg/LiRyb290ID8/IGN0eD8uJGRhdGEgPz8gdm1PckVsO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gQXJyYXkuaXNBcnJheShwYXRoT3JQYXRocykgPyBwYXRoT3JQYXRocyA6IFtwYXRoT3JQYXRoc107XG5cbiAgICAgICAgICAgIGNvbnN0IHJlYWRWaWFQbGV4ID0gKHApID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBnID0gcm9vdD8ucGxleD8uZGF0YT8uZ2V0T2JzZXJ2YWJsZU9yVmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhbGxvd1BsZXggJiYgdHlwZW9mIGcgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFjYyA9IGcodm0sIHApOyAgICAgICAgICAgICAgIC8vIEtPIG9ic2VydmFibGUvY29tcHV0ZWQgT1IgcGxhaW4gdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAodHlwZW9mIGFjYyA9PT0gJ2Z1bmN0aW9uJykgPyBhY2MoKSA6IGFjYztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCByZWFkVmlhUGF0aCA9IChwKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2VnbWVudHMgPSBTdHJpbmcocCkuc3BsaXQoJy4nKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGN1ciA9IHZtO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2Ygc2VnbWVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1ciA9IChjdXIgPT0gbnVsbCkgPyB1bmRlZmluZWQgOiBjdXJba107XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY3VyID09PSB1bmRlZmluZWQpIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY3VyID09PSAnZnVuY3Rpb24nKSByZXR1cm4gaXNLT0Z1bmMoY3VyKSA/IGN1cigpIDogY3VyOyAvLyBkb24ndCBhY2NpZGVudGFsbHkgZXhlY3V0ZSBub24tS08gbWV0aG9kc1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY3VyO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgcCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgICAgICAgICAgbGV0IHYgPSByZWFkVmlhUGxleChwKTtcbiAgICAgICAgICAgICAgICBpZiAodiA9PT0gdW5kZWZpbmVkKSB2ID0gcmVhZFZpYVBhdGgocCk7XG5cbiAgICAgICAgICAgICAgICB2ID0gZGVlcCA/IHVud3JhcERlZXAodikgOiB1bndyYXBPbmNlKHYpO1xuICAgICAgICAgICAgICAgIGlmIChmaXJzdCAmJiBBcnJheS5pc0FycmF5KHYpKSB2ID0gdi5sZW5ndGggPyB2WzBdIDogdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRyaW0gJiYgKHR5cGVvZiB2ID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgdiA9PT0gJ251bWJlcicpKSB2ID0gU3RyaW5nKHYpLnRyaW0oKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGhhc1ZhbHVlID0gKHYgIT09IHVuZGVmaW5lZCAmJiB2ICE9PSBudWxsICYmIChjb2FsZXNjZUZhbHN5IHx8IHYgIT09ICcnKSk7XG4gICAgICAgICAgICAgICAgaWYgKGhhc1ZhbHVlKSByZXR1cm4gdjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBXcml0ZSBhIHZhbHVlIHRvIGEgUGxleCBLTyB2aWV3LW1vZGVsIHByb3BlcnR5LlxuICAgICAgICAgKiAtIFN1cHBvcnRzIGRvdHRlZCBwYXRocyBcIkZvby5CYXJcIlxuICAgICAgICAgKiAtIElmIHRoZSB0YXJnZXQgaXMgYW4gb2JzZXJ2YWJsZSBmdW5jdGlvbiwgY2FsbHMgaXQgd2l0aCB2YWx1ZVxuICAgICAgICAgKiAtIElmIHRoZSB0YXJnZXQgaXMgYW4gYXJyYXksIHJlcGxhY2VzIGNvbnRlbnRzIHdpdGggYSBzaW5nbGUgdmFsdWVcbiAgICAgICAgICogLSBFbHNlIGFzc2lnbnMgZGlyZWN0bHlcbiAgICAgICAgICovXG4gICAgICAgIC8vIEFycmF5LWF3YXJlIHdyaXRlOiByZXNwZWN0cyBLTyBvYnNlcnZhYmxlQXJyYXksIEtPIG9ic2VydmFibGUsIG9yIHBsYWluIHByb3BcbiAgICAgICAgVE1VdGlscy5zZXRPYnNWYWx1ZSA9IGZ1bmN0aW9uIHNldE9ic1ZhbHVlKHZtLCBwYXRoLCB2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKCF2bSB8fCAhcGF0aCkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCByb290ID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICAgICAgICAgIGNvbnN0IEtPID0gcm9vdC5rbztcblxuICAgICAgICAgICAgLy8gSGVscGVyIHRvIGNvZXJjZSB0byBhcnJheSBpZmYgdGFyZ2V0IGlzIGFycmF5LXNoYXBlZFxuICAgICAgICAgICAgY29uc3QgdG9BcnJheUlmID0gKGlzQXJyYXlUYXJnZXQsIHYpID0+IGlzQXJyYXlUYXJnZXQgPyAoQXJyYXkuaXNBcnJheSh2KSA/IHYgOiBbdl0pIDogdjtcblxuICAgICAgICAgICAgLy8gVHJ5IFBsZXggYWNjZXNzb3IgZmlyc3QgKHVzdWFsbHkgcmV0dXJucyBhIEtPIG9ic2VydmFibGUgZnVuY3Rpb24pXG4gICAgICAgICAgICBjb25zdCBwbGV4R2V0ID0gcm9vdD8ucGxleD8uZGF0YT8uZ2V0T2JzZXJ2YWJsZU9yVmFsdWU7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHBsZXhHZXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY2MgPSBwbGV4R2V0KHZtLCBwYXRoKTsgICAgICAgICAgICAvLyBnZXR0ZXIvc2V0dGVyIGZ1bmN0aW9uIG9yIHZhbHVlXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBhY2MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRGV0ZWN0IG9ic2VydmFibGVBcnJheSB2aWEgbWV0aG9kIHByZXNlbmNlXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzT2JzQXJyYXkgPSAhIShhY2MgJiYgdHlwZW9mIGFjYy5wdXNoID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiBhY2MucmVtb3ZlQWxsID09PSAnZnVuY3Rpb24nKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzT2JzQXJyYXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjYy5yZW1vdmVBbGwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyciA9IHRvQXJyYXlJZih0cnVlLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXJyLmxlbmd0aCkgYWNjLnB1c2goLi4uYXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBGb3Igbm9ybWFsIG9ic2VydmFibGUvY29tcHV0ZWQ6IGNvZXJjZSBvbmx5IGlmIGN1cnJlbnQgaXMgYXJyYXlcbiAgICAgICAgICAgICAgICAgICAgbGV0IGN1cjtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgY3VyID0gYWNjKCk7IH0gY2F0Y2ggeyBjdXIgPSB1bmRlZmluZWQ7IH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNBcnJheVRhcmdldCA9IEFycmF5LmlzQXJyYXkoY3VyKTtcbiAgICAgICAgICAgICAgICAgICAgYWNjKHRvQXJyYXlJZihpc0FycmF5VGFyZ2V0LCB2YWx1ZSkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIElmIHBsZXggZ2F2ZSB1cyBhIHBsYWluIHZhbHVlIChyYXJlKSwgZmFsbCB0aHJvdWdoIHRvIGRpcmVjdCBwYXRoXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERpcmVjdCBwYXRoOiB3YWxrIHRvIHBhcmVudCArIGtleVxuICAgICAgICAgICAgY29uc3Qga2V5cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICAgICAgICAgIGNvbnN0IGZpbmFsS2V5ID0ga2V5cy5wb3AoKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IGtleXMucmVkdWNlKChhY2MsIGspID0+IChhY2MgPT0gbnVsbCA/IGFjYyA6IGFjY1trXSksIHZtKTtcbiAgICAgICAgICAgIGlmICghcGFyZW50KSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IGN1ciA9IHBhcmVudFtmaW5hbEtleV07XG5cbiAgICAgICAgICAgIC8vIEtPIG9ic2VydmFibGVBcnJheVxuICAgICAgICAgICAgaWYgKEtPICYmIHR5cGVvZiBLTy5pc09ic2VydmFibGUgPT09ICdmdW5jdGlvbicgJiYgS08uaXNPYnNlcnZhYmxlKGN1cikgJiZcbiAgICAgICAgICAgICAgICB0eXBlb2YgY3VyLnB1c2ggPT09ICdmdW5jdGlvbicgJiYgdHlwZW9mIGN1ci5yZW1vdmVBbGwgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBjdXIucmVtb3ZlQWxsKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYXJyID0gdG9BcnJheUlmKHRydWUsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAoYXJyLmxlbmd0aCkgY3VyLnB1c2goLi4uYXJyKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEtPIG9ic2VydmFibGUgc2NhbGFyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGN1ciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGxldCBjdXJyZW50VmFsO1xuICAgICAgICAgICAgICAgIHRyeSB7IGN1cnJlbnRWYWwgPSBjdXIoKTsgfSBjYXRjaCB7IGN1cnJlbnRWYWwgPSB1bmRlZmluZWQ7IH1cbiAgICAgICAgICAgICAgICBjb25zdCBpc0FycmF5VGFyZ2V0ID0gQXJyYXkuaXNBcnJheShjdXJyZW50VmFsKTtcbiAgICAgICAgICAgICAgICBjdXIodG9BcnJheUlmKGlzQXJyYXlUYXJnZXQsIHZhbHVlKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBQbGFpbiBwcm9wZXJ0eSAoYXJyYXkgb3Igc2NhbGFyKVxuICAgICAgICAgICAgY29uc3QgaXNBcnJheVRhcmdldCA9IEFycmF5LmlzQXJyYXkoY3VyKTtcbiAgICAgICAgICAgIHBhcmVudFtmaW5hbEtleV0gPSB0b0FycmF5SWYoaXNBcnJheVRhcmdldCwgdmFsdWUpO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLyoqIENvbnZlbmllbmNlOiBjb2VyY2UgYW55IG9icy9wbGFpbi9hcnJheSB0byBhIHRyaW1tZWQgc3RyaW5nIGlkICovXG4gICAgICAgIFRNVXRpbHMuY29lcmNlSWQgPSBmdW5jdGlvbiBjb2FsZXNjZVRvSWQodikge1xuICAgICAgICAgICAgY29uc3QgdSA9IFRNVXRpbHMudW53cmFwRGVlcCA/IFRNVXRpbHMudW53cmFwRGVlcCh2KSA6IHY7XG4gICAgICAgICAgICBjb25zdCB4ID0gQXJyYXkuaXNBcnJheSh1KSA/ICh1Lmxlbmd0aCA/IHVbMF0gOiB1bmRlZmluZWQpIDogdTtcbiAgICAgICAgICAgIHJldHVybiBTdHJpbmcoeCA/PyAnJykudHJpbSgpO1xuICAgICAgICB9O1xuICAgIH0pKCk7XG5cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIDMpIEZsb2F0aW5nIG1lc3NhZ2UgVUkgKGtlcHQgYXMtaXM7IGFkZGVkIHRvYXN0KCkgYWxpYXMgKyBsb2coKSlcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBmdW5jdGlvbiBoaWRlTWVzc2FnZSgpIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RtLW1zZycpPy5yZW1vdmUoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzaG93TWVzc2FnZSh0ZXh0LCB7IHR5cGUgPSAnaW5mbycsIGF1dG9DbGVhciA9IDQwMDAgfSA9IHt9KSB7XG4gICAgICAgIGhpZGVNZXNzYWdlKCk7XG4gICAgICAgIGNvbnN0IGNvbG9ycyA9IHtcbiAgICAgICAgICAgIGluZm86IHsgYmc6ICcjZDllZGY3JywgZmc6ICcjMzE3MDhmJyB9LFxuICAgICAgICAgICAgc3VjY2VzczogeyBiZzogJyNkZmYwZDgnLCBmZzogJyMzYzc2M2QnIH0sXG4gICAgICAgICAgICB3YXJuaW5nOiB7IGJnOiAnI2ZjZjhlMycsIGZnOiAnIzhhNmQzYicgfSxcbiAgICAgICAgICAgIGVycm9yOiB7IGJnOiAnI2YyZGVkZScsIGZnOiAnI2E5NDQ0MicgfVxuICAgICAgICB9W3R5cGVdIHx8IHsgYmc6ICcjZmZmJywgZmc6ICcjMDAwJyB9O1xuICAgICAgICBjb25zdCBib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgYm94LmlkID0gJ3RtLW1zZyc7XG4gICAgICAgIE9iamVjdC5hc3NpZ24oYm94LnN0eWxlLCB7XG4gICAgICAgICAgICBwb3NpdGlvbjogJ2ZpeGVkJywgdG9wOiAnMTBweCcsIHJpZ2h0OiAnMTBweCcsXG4gICAgICAgICAgICBwYWRkaW5nOiAnOHB4IDEycHgnLCBiYWNrZ3JvdW5kQ29sb3I6IGNvbG9ycy5iZyxcbiAgICAgICAgICAgIGNvbG9yOiBjb2xvcnMuZmcsIGJvcmRlcjogYDFweCBzb2xpZCAke2NvbG9ycy5mZ31gLFxuICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnNHB4JywgYm94U2hhZG93OiAnMCAycHggNnB4IHJnYmEoMCwwLDAsMC4yKScsXG4gICAgICAgICAgICB6SW5kZXg6IDEwMDAwLCBmb250U2l6ZTogJzAuOWVtJywgbWF4V2lkdGg6ICc4MCUnLFxuICAgICAgICAgICAgd2hpdGVTcGFjZTogJ3ByZS1saW5lJ1xuICAgICAgICB9KTtcbiAgICAgICAgYm94LnRleHRDb250ZW50ID0gdGV4dDtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChib3gpO1xuICAgICAgICBpZiAoYXV0b0NsZWFyKSBzZXRUaW1lb3V0KGhpZGVNZXNzYWdlLCBhdXRvQ2xlYXIpO1xuICAgIH1cblxuICAgIC8vIEFsaWFzOiB1bmlmaWVkIHRvYXN0IEFQSVxuICAgIGZ1bmN0aW9uIHRvYXN0KG1zZywgbGV2ZWwgPSAnaW5mbycsIG1zKSB7XG4gICAgICAgIHNob3dNZXNzYWdlKG1zZywgeyB0eXBlOiBsZXZlbCwgYXV0b0NsZWFyOiBtcyA/PyA0MDAwIH0pO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIDQpIERPTSBpbnNlcnRpb24gb2JzZXJ2ZXIgKGtlcHQgYXMtaXMpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gb2JzZXJ2ZUluc2VydChzZWxlY3RvciwgY2FsbGJhY2spIHtcbiAgICAgICAgY29uc3Qgb2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICAgICAgICAgIGlmIChlbCkge1xuICAgICAgICAgICAgICAgIG9icy5kaXNjb25uZWN0KCk7IGNhbGxiYWNrKGVsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIG9icy5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuICAgICAgICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHsgb2JzLmRpc2Nvbm5lY3QoKTsgY2FsbGJhY2soZXhpc3RpbmcpOyB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gNSkgS08gY29udHJvbGxlciArIFZNIHdhaXRlcnMgKGtlcHQ7IGFzeW5jIHZhcmlhbnQgcHJlc2VydmVkKVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIHdhaXRGb3JNb2RlbEFzeW5jKHNlbCwge1xuICAgICAgICBwb2xsTXMgPSAyNTAsXG4gICAgICAgIHRpbWVvdXRNcyA9IDMwMDAwLFxuICAgICAgICByZXF1aXJlS28gPSB0cnVlLCAgIC8vIGlmIGZhbHNlLCByZXNvbHZlIGFzIHNvb24gYXMgdGhlIGVsZW1lbnQgaXMgZm91bmRcbiAgICAgICAgbG9nZ2VyID0gbnVsbCwgICAgICAvLyBwYXNzIFRNVXRpbHMuZ2V0TG9nZ2VyKCdRVDEwJykgLyBfbG9nZ2VyLCBldGMuXG4gICAgICAgIGxvZyA9IGZhbHNlICAgICAgICAgLy8gc2V0IHRydWUgdG8gcHJpbnQgZGVidWcgd2l0aCBjb25zb2xlLiogZXZlbiB3aXRob3V0IGEgbG9nZ2VyXG4gICAgfSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcblxuICAgICAgICBjb25zdCBnZXRLbyA9ICgpID0+XG4gICAgICAgICAgICAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93LmtvKSB8fFxuICAgICAgICAgICAgKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbykgfHwgbnVsbDtcblxuICAgICAgICBjb25zdCBkYmcgPSAoZm4sIC4uLmFyZ3MpID0+IHtcbiAgICAgICAgICAgIGlmIChsb2dnZXIgJiYgdHlwZW9mIGxvZ2dlcltmbl0gPT09ICdmdW5jdGlvbicpIGxvZ2dlcltmbl0oLi4uYXJncyk7XG4gICAgICAgICAgICBlbHNlIGlmIChsb2cpIChjb25zb2xlW2ZuXSB8fCBjb25zb2xlLmxvZykoLi4uYXJncyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGZ1bmN0aW9uIHRpY2soKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbCk7XG4gICAgICAgICAgICAgICAgaWYgKCFlbCkgcmV0dXJuIHNjaGVkdWxlKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIXJlcXVpcmVLbykge1xuICAgICAgICAgICAgICAgICAgICAvLyByZXR1cm4gZWFybHkgd2l0aG91dCBLTyBjb250ZXh0XG4gICAgICAgICAgICAgICAgICAgIGxvZyAmJiBjb25zb2xlLmRlYnVnKCdcdUQ4M0RcdUREMEQgd2FpdEZvck1vZGVsQXN5bmMgKG5vIEtPKTonLCB7IHNlbCwgZWwgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHsgZWxlbWVudDogZWwsIGNvbnRyb2xsZXI6IG51bGwsIHZpZXdNb2RlbDogbnVsbCB9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBrb09iaiA9IGdldEtvKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFrb09iaiB8fCB0eXBlb2Yga29PYmouY29udGV4dEZvciAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIHNjaGVkdWxlKCk7XG5cbiAgICAgICAgICAgICAgICBsZXQgY29udHJvbGxlciA9IG51bGwsIHZpZXdNb2RlbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3R4ID0ga29PYmouY29udGV4dEZvcihlbCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2xsZXIgPSBjdHggJiYgY3R4LiRkYXRhIHx8IG51bGw7ICAgICAgICAgICAgICAgICAgLy8gZS5nLiwgY29udHJvbGxlclxuICAgICAgICAgICAgICAgICAgICB2aWV3TW9kZWwgPSAoY29udHJvbGxlciAmJiBjb250cm9sbGVyLm1vZGVsKSB8fCBudWxsOyAgLy8gZS5nLiwgVk0gb24gY29udHJvbGxlclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXZpZXdNb2RlbCAmJiBjdHgpIHZpZXdNb2RlbCA9IGN0eC4kcm9vdD8uZGF0YSB8fCBjdHguJHJvb3QgfHwgbnVsbDsgLy8gVk0gZmFsbGJhY2tcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogbm90IHJlYWR5IHlldCAqLyB9XG5cbiAgICAgICAgICAgICAgICBpZiAobG9nZ2VyIHx8IGxvZykge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmdyb3VwQ29sbGFwc2VkKCdcdUQ4M0RcdUREMEQgd2FpdEZvck1vZGVsQXN5bmMnKTtcbiAgICAgICAgICAgICAgICAgICAgZGJnKCdkZWJ1ZycsICdzZWxlY3RvciBcdTIxOTInLCBzZWwpO1xuICAgICAgICAgICAgICAgICAgICBkYmcoJ2RlYnVnJywgJ2NvbnRyb2xsZXIgXHUyMTkyJywgY29udHJvbGxlcik7XG4gICAgICAgICAgICAgICAgICAgIGRiZygnZGVidWcnLCAndm0gXHUyMTkyJywgdmlld01vZGVsKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHJldHVybiByZXNvbHZlKHsgZWxlbWVudDogZWwsIGNvbnRyb2xsZXIsIHZpZXdNb2RlbCB9KTtcbiAgICAgICAgICAgICAgICBzY2hlZHVsZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBzY2hlZHVsZSgpIHtcbiAgICAgICAgICAgICAgICBpZiAoKERhdGUubm93KCkgLSBzdGFydCkgPj0gdGltZW91dE1zKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IGBUaW1lZCBvdXQgd2FpdGluZyBmb3IgXCIke3NlbH1cIiBhZnRlciAke3RpbWVvdXRNc31tc2A7XG4gICAgICAgICAgICAgICAgICAgIGRiZygnd2FybicsICdcdTIzMUIgd2FpdEZvck1vZGVsQXN5bmMnLCBtc2cpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG5ldyBFcnJvcihtc2cpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCh0aWNrLCBwb2xsTXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBcdTI3MDUgYWRkIHRoaXMgcmlnaHQgYWZ0ZXIgdGhlIHdhaXRGb3JNb2RlbEFzeW5jIGZ1bmN0aW9uIGRlZmluaXRpb25cbiAgICBUTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jID0gd2FpdEZvck1vZGVsQXN5bmM7XG5cblxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gNikgU2VsZWN0IDxvcHRpb24+IGhlbHBlcnMgKGtlcHQpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gc2VsZWN0T3B0aW9uQnlUZXh0KHNlbGVjdEVsLCB0ZXh0KSB7XG4gICAgICAgIGNvbnN0IG9wdCA9IEFycmF5LmZyb20oc2VsZWN0RWwub3B0aW9ucylcbiAgICAgICAgICAgIC5maW5kKG8gPT4gby50ZXh0Q29udGVudC50cmltKCkgPT09IHRleHQpO1xuICAgICAgICBpZiAob3B0KSB7IHNlbGVjdEVsLnZhbHVlID0gb3B0LnZhbHVlOyBzZWxlY3RFbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTsgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNlbGVjdE9wdGlvbkJ5VmFsdWUoc2VsZWN0RWwsIHZhbHVlKSB7XG4gICAgICAgIGNvbnN0IG9wdCA9IEFycmF5LmZyb20oc2VsZWN0RWwub3B0aW9ucylcbiAgICAgICAgICAgIC5maW5kKG8gPT4gby52YWx1ZSA9PSB2YWx1ZSk7XG4gICAgICAgIGlmIChvcHQpIHsgc2VsZWN0RWwudmFsdWUgPSBvcHQudmFsdWU7IHNlbGVjdEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpOyB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gNykgUm91dGUgaGVscGVycyAobmV3KTogZW5zdXJlUm91dGUocmVnZXgpICsgb25Sb3V0ZUNoYW5nZShoYW5kbGVyKVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIGVuc3VyZVJvdXRlKHJlZ2V4KSB7XG4gICAgICAgIHRyeSB7IHJldHVybiByZWdleC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKTsgfVxuICAgICAgICBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuICAgIH1cblxuICAgIC8vIEhlbHBlciB1c2VkIGJ5IGJvdGggd2F0Y2hlcnNcbiAgICBmdW5jdGlvbiBfX3RtQ3JlYXRlUXVpZXREaXNwYXRjaGVyKGZuLCBkZWxheSkge1xuICAgICAgICBsZXQgdCA9IG51bGw7XG4gICAgICAgIHJldHVybiAoKSA9PiB7IGlmICh0KSBjbGVhclRpbWVvdXQodCk7IHQgPSBzZXRUaW1lb3V0KCgpID0+IHsgdCA9IG51bGw7IGZuKCk7IH0sIGRlbGF5KTsgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvblJvdXRlQ2hhbmdlKGhhbmRsZXIpIHtcbiAgICAgICAgaWYgKGhpc3RvcnkuX190bVdyYXBwZWQpIHsgaGFuZGxlcihsb2NhdGlvbi5wYXRobmFtZSk7IHJldHVybjsgfVxuICAgICAgICBjb25zdCBmaXJlID0gKCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHsgaGFuZGxlcihsb2NhdGlvbi5wYXRobmFtZSk7IH0gY2F0Y2ggKGUpIHsgY29uc29sZS53YXJuKCdvblJvdXRlQ2hhbmdlIGhhbmRsZXIgZXJyb3InLCBlKTsgfVxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBfcHMgPSBoaXN0b3J5LnB1c2hTdGF0ZTtcbiAgICAgICAgaGlzdG9yeS5wdXNoU3RhdGUgPSBmdW5jdGlvbiAoKSB7IF9wcy5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2xvY2F0aW9uY2hhbmdlJykpOyB9O1xuICAgICAgICBjb25zdCBfcnMgPSBoaXN0b3J5LnJlcGxhY2VTdGF0ZTtcbiAgICAgICAgaGlzdG9yeS5yZXBsYWNlU3RhdGUgPSBmdW5jdGlvbiAoKSB7IF9ycy5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2xvY2F0aW9uY2hhbmdlJykpOyB9O1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9wc3RhdGUnLCBmaXJlKTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2xvY2F0aW9uY2hhbmdlJywgZmlyZSk7XG4gICAgICAgIGhpc3RvcnkuX190bVdyYXBwZWQgPSB0cnVlO1xuICAgICAgICBmaXJlKCk7IC8vIGltbWVkaWF0ZSBmaXJlIGZvciBpbml0aWFsIHJvdXRlXG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gOCkgUm91dGUgbWF0Y2hlciAobmV3KTogYWNjZXB0cyByZWdleCBvciBhcnJheSBvZiByZWdleFxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIG1hdGNoUm91dGUocmVnZXhPckFycmF5LCBwYXRoID0gbG9jYXRpb24ucGF0aG5hbWUpIHtcbiAgICAgICAgaWYgKCFyZWdleE9yQXJyYXkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKHJlZ2V4T3JBcnJheSBpbnN0YW5jZW9mIFJlZ0V4cCkgcmV0dXJuIHJlZ2V4T3JBcnJheS50ZXN0KHBhdGgpO1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZWdleE9yQXJyYXkpKSByZXR1cm4gcmVnZXhPckFycmF5LnNvbWUocnggPT4gcngudGVzdChwYXRoKSk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBMb2dnZXIgSGVscGVyc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGxldCBfX3RtRGVidWcgPSBmYWxzZTsgICAgICAgICAgICAvLyBkZWNsYXJlIHRoaXMgc28gc2V0RGVidWcgd29ya3NcbiAgICBmdW5jdGlvbiBzZXREZWJ1Zyh2KSB7IF9fdG1EZWJ1ZyA9ICEhdjsgfVxuICAgIGZ1bmN0aW9uIG1ha2VMb2dnZXIobnMpIHtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBucyB8fCAnVE0nO1xuICAgICAgICBjb25zdCBlbWl0ID0gKG0sIGJhZGdlLCAuLi5hKSA9PiAoY29uc29sZVttXSB8fCBjb25zb2xlLmxvZykuY2FsbChjb25zb2xlLCBgJHtsYWJlbH0gJHtiYWRnZX1gLCAuLi5hKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGxvZzogKC4uLmEpID0+IGVtaXQoJ2xvZycsICdcdTI1QjZcdUZFMEYnLCAuLi5hKSxcbiAgICAgICAgICAgIGluZm86ICguLi5hKSA9PiBlbWl0KCdpbmZvJywgJ1x1MjEzOVx1RkUwRicsIC4uLmEpLFxuICAgICAgICAgICAgd2FybjogKC4uLmEpID0+IGVtaXQoJ3dhcm4nLCAnXHUyNkEwXHVGRTBGJywgLi4uYSksXG4gICAgICAgICAgICBlcnJvcjogKC4uLmEpID0+IGVtaXQoJ2Vycm9yJywgJ1x1MjcxNlx1RkUwRicsIC4uLmEpLFxuICAgICAgICAgICAgb2s6ICguLi5hKSA9PiBlbWl0KCdsb2cnLCAnXHUyNzA1JywgLi4uYSksXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gU2ltcGxlIGdsb2JhbCBzaGltcyBzbyBUTVV0aWxzLmxvZy93YXJuL2Vycm9yIGV4aXN0IChoYW5keSBmb3IgeW91ciBkbG9nL2R3YXJuL2RlcnJvcilcbiAgICBmdW5jdGlvbiBsb2coLi4uYSkgeyBjb25zb2xlLmxvZygnVE0gXHUyNUI2XHVGRTBGJywgLi4uYSk7IH1cbiAgICBmdW5jdGlvbiB3YXJuKC4uLmEpIHsgY29uc29sZS53YXJuKCdUTSBcdTI2QTBcdUZFMEYnLCAuLi5hKTsgfVxuICAgIGZ1bmN0aW9uIGVycm9yKC4uLmEpIHsgY29uc29sZS5lcnJvcignVE0gXHUyNzE2XHVGRTBGJywgLi4uYSk7IH1cbiAgICBmdW5jdGlvbiBvayguLi5hKSB7IGNvbnNvbGUubG9nKCdUTSBcdTI3MDUnLCAuLi5hKTsgfVxuXG4gICAgZnVuY3Rpb24gZGVyaXZlTnNGcm9tU2NyaXB0TmFtZSgpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG5hbWUgPSAodHlwZW9mIEdNX2luZm8gIT09ICd1bmRlZmluZWQnICYmIEdNX2luZm8/LnNjcmlwdD8ubmFtZSkgfHwgJyc7XG4gICAgICAgICAgICBpZiAoIW5hbWUpIHJldHVybiAnVE0nO1xuICAgICAgICAgICAgLy8gZ3JhYiB0aGUgZmlyc3QgdG9rZW4gYmVmb3JlIGEgc3BhY2UvYXJyb3cgKHdvcmtzIGZvciBcdTIwMUNRVDEwIFx1MjAyNlx1MjAxRCwgXHUyMDFDQ1ImUzEwIFx1Mjc5QyBcdTIwMjZcdTIwMUQsIGV0Yy4pXG4gICAgICAgICAgICByZXR1cm4gbmFtZS5zcGxpdCgvWyBcXHRcdTIwMTNcdTIwMTRcXC1cdTIxOTJcdTI3OUM+XS8pWzBdLnRyaW0oKSB8fCAnVE0nO1xuICAgICAgICB9IGNhdGNoIHsgcmV0dXJuICdUTSc7IH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRMb2dnZXIobnMpIHtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBucyB8fCBkZXJpdmVOc0Zyb21TY3JpcHROYW1lKCk7XG4gICAgICAgIHJldHVybiBUTVV0aWxzLm1ha2VMb2dnZXIgPyBUTVV0aWxzLm1ha2VMb2dnZXIobGFiZWwpIDoge1xuICAgICAgICAgICAgbG9nOiAoLi4uYSkgPT4gY29uc29sZS5sb2coYCR7bGFiZWx9IFx1MjVCNlx1RkUwRmAsIC4uLmEpLFxuICAgICAgICAgICAgaW5mbzogKC4uLmEpID0+IGNvbnNvbGUuaW5mbyhgJHtsYWJlbH0gXHUyMTM5XHVGRTBGYCwgLi4uYSksXG4gICAgICAgICAgICB3YXJuOiAoLi4uYSkgPT4gY29uc29sZS53YXJuKGAke2xhYmVsfSBcdTI2QTBcdUZFMEZgLCAuLi5hKSxcbiAgICAgICAgICAgIGVycm9yOiAoLi4uYSkgPT4gY29uc29sZS5lcnJvcihgJHtsYWJlbH0gXHUyNzE2XHVGRTBGYCwgLi4uYSksXG4gICAgICAgICAgICBvazogKC4uLmEpID0+IGNvbnNvbGUubG9nKGAke2xhYmVsfSBcdTI3MDVgLCAuLi5hKSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBPcHRpb25hbDogc2V0IGEgZ2xvYmFsIGBMYCBmb3IgY29udmVuaWVuY2UgKGF2b2lkIGlmIHlvdSBmZWFyIGNvbGxpc2lvbnMpXG4gICAgZnVuY3Rpb24gYXR0YWNoTG9nZ2VyR2xvYmFsKG5zKSB7XG4gICAgICAgIGNvbnN0IGxvZ2dlciA9IGdldExvZ2dlcihucyk7XG4gICAgICAgIHdpbmRvdy5MID0gbG9nZ2VyO1xuICAgICAgICBpZiAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHVuc2FmZVdpbmRvdy5MID0gbG9nZ2VyO1xuICAgICAgICByZXR1cm4gbG9nZ2VyO1xuICAgIH1cblxuICAgIC8vIFdhdGNoIGEgZmllbGQgYnkgaXRzIDxsYWJlbD4gdGV4dC4gU3Vic2NyaWJlcyB0byBLTyBpZiBhdmFpbGFibGU7IGVsc2UgZmFsbHMgYmFjayB0byBET00uXG4gICAgLy8gUmV0dXJucyBhbiB1bnN1YnNjcmliZSgpIGZ1bmN0aW9uLlxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSB3YXRjaEJ5TGFiZWwgKERST1AtSU4pIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIFRNVXRpbHMud2F0Y2hCeUxhYmVsID0gZnVuY3Rpb24gd2F0Y2hCeUxhYmVsKHtcbiAgICAgICAgbGFiZWxUZXh0LFxuICAgICAgICBvbkNoYW5nZTogb25WYWx1ZSxcbiAgICAgICAgaW5pdGlhbCA9IHRydWUsXG4gICAgICAgIGZpcmVPbiA9ICdjaGFuZ2UnLCAgICAgICAgICAgICAvLyAnY2hhbmdlJyB8ICdibHVyJ1xuICAgICAgICBzZXR0bGVNcyA9IDI1MCxcbiAgICAgICAga29QcmVmZXIgPSAncm9vdCcsXG4gICAgICAgIGJhZ0tleXMgPSBbJ3ZhbHVlJywgJ2Rpc3BsYXlWYWx1ZScsICdib3VuZERpc3BsYXlWYWx1ZScsICd0ZXh0SW5wdXQnXSxcbiAgICAgICAgd2lkZ2V0U2VsZWN0b3IgPSAnLmstY29tYm9ib3gsLmstZHJvcGRvd24sLmstZHJvcGRvd25saXN0LC5rLWF1dG9jb21wbGV0ZSxbcm9sZT1cImNvbWJvYm94XCJdJyxcbiAgICAgICAgdGltZW91dE1zID0gMzAwMDAsXG4gICAgICAgIGxvZ2dlciA9IG51bGxcbiAgICB9ID0ge30pIHtcbiAgICAgICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xuICAgICAgICBjb25zdCBpc09icyA9ICh4KSA9PiAoS08/LmlzT2JzZXJ2YWJsZT8uKHgpKSB8fCAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgdHlwZW9mIHguc3Vic2NyaWJlID09PSAnZnVuY3Rpb24nKTtcbiAgICAgICAgY29uc3QgdW4gPSAoeCkgPT4gS08/LnVud3JhcCA/IEtPLnVud3JhcCh4KSA6ICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyA/IHgoKSA6IHgpO1xuICAgICAgICBjb25zdCBsb2cgPSAoLi4uYSkgPT4gbG9nZ2VyPy5sb2c/LiguLi5hKTtcblxuICAgICAgICBjb25zdCBub3JtID0gKHMpID0+IFN0cmluZyhzIHx8ICcnKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1xcdTAwYTAvZywgJyAnKS5yZXBsYWNlKC9bKjpdL2csICcnKS5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xuICAgICAgICBjb25zdCB3YW50ID0gbGFiZWxUZXh0IGluc3RhbmNlb2YgUmVnRXhwID8gbGFiZWxUZXh0IDogbm9ybShsYWJlbFRleHQpO1xuXG4gICAgICAgIGNvbnN0IGZpbmRMYWJlbCA9ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGxhYmVscyA9IFsuLi5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdsYWJlbFtmb3JdJyldO1xuICAgICAgICAgICAgZm9yIChjb25zdCBsIG9mIGxhYmVscykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR4dCA9IG5vcm0obC50ZXh0Q29udGVudCB8fCBsLmdldEF0dHJpYnV0ZSgnZGF0YS1vcmlnaW5hbC10ZXh0JykgfHwgJycpO1xuICAgICAgICAgICAgICAgIGlmIChsYWJlbFRleHQgaW5zdGFuY2VvZiBSZWdFeHAgPyBsYWJlbFRleHQudGVzdCh0eHQpIDogKHR4dCA9PT0gd2FudCB8fCB0eHQuc3RhcnRzV2l0aCh3YW50KSkpIHJldHVybiBsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH07XG5cbiAgICAgICAgZnVuY3Rpb24gaG9va05vdygpIHtcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gZmluZExhYmVsKCk7XG4gICAgICAgICAgICBpZiAoIWxhYmVsKSByZXR1cm4gbnVsbDtcblxuICAgICAgICAgICAgY29uc3QgZm9ySWQgPSBsYWJlbC5nZXRBdHRyaWJ1dGUoJ2ZvcicpO1xuICAgICAgICAgICAgY29uc3QgZWwgPSBmb3JJZCAmJiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChmb3JJZCk7XG4gICAgICAgICAgICBpZiAoIWVsKSByZXR1cm4gbnVsbDtcblxuICAgICAgICAgICAgbGV0IGJvdW5kID0gbnVsbDtcbiAgICAgICAgICAgIGlmIChLTz8uY29udGV4dEZvcikge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN0eCA9IEtPLmNvbnRleHRGb3IoZWwpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiYWcgPSAoa29QcmVmZXIgPT09ICdkYXRhJyA/IGN0eD8uJGRhdGE/LmVsZW1lbnRzPy5bZm9ySWRdIDogY3R4Py4kcm9vdD8uZWxlbWVudHM/Lltmb3JJZF0pXG4gICAgICAgICAgICAgICAgICAgICAgICB8fCAoa29QcmVmZXIgPT09ICdkYXRhJyA/IGN0eD8uJHJvb3Q/LmVsZW1lbnRzPy5bZm9ySWRdIDogY3R4Py4kZGF0YT8uZWxlbWVudHM/Lltmb3JJZF0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYmFnKSBib3VuZCA9IGJhZ0tleXMubWFwKGsgPT4gYmFnW2tdKS5maW5kKEJvb2xlYW4pID8/IG51bGw7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFib3VuZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZGJSYXcgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtYmluZCcpIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbSA9IC8oPzp2YWx1ZXx0ZXh0SW5wdXQpXFxzKjpcXHMqKFteLH1dKykvLmV4ZWMoZGJSYXcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBleHByID0gbVsxXS50cmltKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXZhbEluID0gKG9iaikgPT4geyB0cnkgeyByZXR1cm4gRnVuY3Rpb24oJ3dpdGgodGhpcyl7cmV0dXJuICgnICsgZXhwciArICcpfScpLmNhbGwob2JqKTsgfSBjYXRjaCB7IHJldHVybiB1bmRlZmluZWQ7IH0gfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBib3VuZCA9IGV2YWxJbihjdHg/LiRkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYm91bmQgPT09IHVuZGVmaW5lZCkgYm91bmQgPSBldmFsSW4oY3R4Py4kcm9vdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogbm9vcCAqLyB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGtlbmRvV3JhcCA9IGVsLmNsb3Nlc3Qod2lkZ2V0U2VsZWN0b3IpO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0ga2VuZG9XcmFwPy5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGVsO1xuXG4gICAgICAgICAgICBjb25zdCByZWFkID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSBib3VuZCAhPT0gbnVsbCA/IHVuKGJvdW5kKSA6IChlbC52YWx1ZSA/PyAnJykudG9TdHJpbmcoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKEFycmF5LmlzQXJyYXkodikgPyB2WzBdIDogdik/LnRvU3RyaW5nKCkudHJpbSgpIHx8ICcnO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgZmlyZSA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gcmVhZCgpO1xuICAgICAgICAgICAgICAgIGlmICh2ICYmIHR5cGVvZiBvblZhbHVlID09PSAnZnVuY3Rpb24nKSBvblZhbHVlKHYpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHF1ZXVlRmlyZSA9IF9fdG1DcmVhdGVRdWlldERpc3BhdGNoZXIoZmlyZSwgc2V0dGxlTXMpO1xuXG4gICAgICAgICAgICBjb25zdCB1bnN1YnMgPSBbXTtcblxuICAgICAgICAgICAgaWYgKGluaXRpYWwgJiYgZmlyZU9uICE9PSAnYmx1cicpIHF1ZXVlRmlyZSgpO1xuXG4gICAgICAgICAgICBpZiAoaXNPYnMoYm91bmQpKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3ViID0gYm91bmQuc3Vic2NyaWJlKCgpID0+IHF1ZXVlRmlyZSgpKTtcbiAgICAgICAgICAgICAgICB1bnN1YnMucHVzaCgoKSA9PiBzdWIuZGlzcG9zZT8uKCkpO1xuICAgICAgICAgICAgICAgIGxvZz8uKCd3YXRjaEJ5TGFiZWw6IEtPIHN1YnNjcmlwdGlvbiBhdHRhY2hlZCBmb3InLCBsYWJlbFRleHQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZmlyZU9uID09PSAnYmx1cicpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvbkZvY3VzT3V0ID0gKCkgPT4gcXVldWVGaXJlKCk7XG4gICAgICAgICAgICAgICAgY29uc3Qgb25DaGFuZ2UgPSAoKSA9PiBxdWV1ZUZpcmUoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBvbktleURvd24gPSAoZSkgPT4geyBpZiAoZS5rZXkgPT09ICdUYWInIHx8IGUua2V5ID09PSAnRW50ZXInKSBzZXRUaW1lb3V0KHF1ZXVlRmlyZSwgMCk7IH07XG5cbiAgICAgICAgICAgICAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCBvbkZvY3VzT3V0LCB0cnVlKTtcbiAgICAgICAgICAgICAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgb25DaGFuZ2UpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgb25LZXlEb3duKTtcblxuICAgICAgICAgICAgICAgIGlmIChrZW5kb1dyYXAgJiYga2VuZG9XcmFwICE9PSB0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAga2VuZG9XcmFwLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3Vzb3V0Jywgb25Gb2N1c091dCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIGtlbmRvV3JhcC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiBxdWV1ZUZpcmUoKSk7XG4gICAgICAgICAgICAgICAgbW8ub2JzZXJ2ZSh0YXJnZXQsIHsgY2hpbGRMaXN0OiB0cnVlLCBjaGFyYWN0ZXJEYXRhOiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICAgICAgdW5zdWJzLnB1c2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCBvbkZvY3VzT3V0LCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBvbktleURvd24pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoa2VuZG9XcmFwICYmIGtlbmRvV3JhcCAhPT0gdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZW5kb1dyYXAucmVtb3ZlRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCBvbkZvY3VzT3V0LCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtlbmRvV3JhcC5yZW1vdmVFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbW8uZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvbkNoYW5nZSA9ICgpID0+IHF1ZXVlRmlyZSgpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSk7XG4gICAgICAgICAgICAgICAgdW5zdWJzLnB1c2goKCkgPT4gdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlKSk7XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgbG9nPy4oJ3dhdGNoQnlMYWJlbDogbGlzdGVuZXJzIGF0dGFjaGVkIGZvcicsIGxhYmVsVGV4dCwgdGFyZ2V0KTtcbiAgICAgICAgICAgIHJldHVybiAoKSA9PiB7IHVuc3Vicy5mb3JFYWNoKGZuID0+IHsgdHJ5IHsgZm4oKTsgfSBjYXRjaCB7IH0gfSk7IH07XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdW5zdWIgPSBob29rTm93KCk7XG4gICAgICAgIGlmICh0eXBlb2YgdW5zdWIgPT09ICdmdW5jdGlvbicpIHJldHVybiB1bnN1YjtcblxuICAgICAgICBjb25zdCBtbyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICAgICAgICAgIHVuc3ViID0gaG9va05vdygpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB1bnN1YiA9PT0gJ2Z1bmN0aW9uJykgbW8uZGlzY29ubmVjdCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgbW8ub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBtby5kaXNjb25uZWN0KCksIHRpbWVvdXRNcyk7XG5cbiAgICAgICAgcmV0dXJuICgpID0+IHsgdHJ5IHsgdHlwZW9mIHVuc3ViID09PSAnZnVuY3Rpb24nICYmIHVuc3ViKCk7IH0gY2F0Y2ggeyB9IHRyeSB7IG1vLmRpc2Nvbm5lY3QoKTsgfSBjYXRjaCB7IH0gfTtcbiAgICB9O1xuXG4gICAgLy8gUmVzb2x2ZSBvbmNlIHdpdGggdGhlIGZpcnN0IG5vbi1lbXB0eSB2YWx1ZSwgdGhlbiBhdXRvLXVuc3Vic2NyaWJlXG4gICAgVE1VdGlscy5hd2FpdFZhbHVlQnlMYWJlbCA9IGZ1bmN0aW9uIGF3YWl0VmFsdWVCeUxhYmVsKHsgbGFiZWxUZXh0LCB0aW1lb3V0TXMgPSAzMDAwMCwgbG9nZ2VyID0gbnVsbCB9ID0ge30pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGxldCBzdG9wID0gbnVsbDtcbiAgICAgICAgICAgIGxldCBkb25lID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4geyBpZiAoIWRvbmUpIHsgZG9uZSA9IHRydWU7IHN0b3A/LigpOyByZWplY3QobmV3IEVycm9yKCdUaW1lb3V0JykpOyB9IH0sIHRpbWVvdXRNcyk7XG4gICAgICAgICAgICBzdG9wID0gVE1VdGlscy53YXRjaEJ5TGFiZWwoe1xuICAgICAgICAgICAgICAgIGxhYmVsVGV4dCxcbiAgICAgICAgICAgICAgICBpbml0aWFsOiB0cnVlLFxuICAgICAgICAgICAgICAgIGxvZ2dlcixcbiAgICAgICAgICAgICAgICBvbkNoYW5nZTogKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRvbmUgfHwgIXYpIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgZG9uZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgICAgICAgICAgICAgICAgIHN0b3A/LigpOyAgICAgICAgICAgLy8gY2xlYW4gdXBcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh2KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIHdhdGNoQnlTZWxlY3RvciAoRFJPUC1JTikgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgVE1VdGlscy53YXRjaEJ5U2VsZWN0b3IgPSBmdW5jdGlvbiB3YXRjaEJ5U2VsZWN0b3Ioe1xuICAgICAgICBzZWxlY3RvcixcbiAgICAgICAgb25DaGFuZ2U6IG9uVmFsdWUsXG4gICAgICAgIGluaXRpYWwgPSB0cnVlLFxuICAgICAgICBmaXJlT24gPSAnY2hhbmdlJywgICAgICAgICAgICAgLy8gJ2NoYW5nZScgfCAnYmx1cidcbiAgICAgICAgc2V0dGxlTXMgPSAyNTAsICAgICAgICAgICAgICAgIC8vIHdhaXQgZm9yIEtPL0tlbmRvL0RPTSB0byBzZXR0bGVcbiAgICAgICAga29QcmVmZXIgPSAncm9vdCcsXG4gICAgICAgIGJhZ0tleXMgPSBbJ3ZhbHVlJywgJ2Rpc3BsYXlWYWx1ZScsICdib3VuZERpc3BsYXlWYWx1ZScsICd0ZXh0SW5wdXQnXSxcbiAgICAgICAgd2lkZ2V0U2VsZWN0b3IgPSAnLmstY29tYm9ib3gsLmstZHJvcGRvd24sLmstZHJvcGRvd25saXN0LC5rLWF1dG9jb21wbGV0ZSxbcm9sZT1cImNvbWJvYm94XCJdJyxcbiAgICAgICAgdGltZW91dE1zID0gMzAwMDAsXG4gICAgICAgIGxvZ2dlciA9IG51bGxcbiAgICB9ID0ge30pIHtcbiAgICAgICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xuICAgICAgICBjb25zdCBpc09icyA9ICh4KSA9PiAoS08/LmlzT2JzZXJ2YWJsZT8uKHgpKSB8fCAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgdHlwZW9mIHguc3Vic2NyaWJlID09PSAnZnVuY3Rpb24nKTtcbiAgICAgICAgY29uc3QgdW4gPSAoeCkgPT4gS08/LnVud3JhcCA/IEtPLnVud3JhcCh4KSA6ICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyA/IHgoKSA6IHgpO1xuICAgICAgICBjb25zdCBsb2cgPSAoLi4uYSkgPT4gbG9nZ2VyPy5sb2c/LiguLi5hKTtcblxuICAgICAgICBmdW5jdGlvbiBob29rTm93KCkge1xuICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICAgICAgICAgIGlmICghZWwpIHJldHVybiBudWxsO1xuXG4gICAgICAgICAgICBsZXQgY3R4ID0gbnVsbCwgYmFnID0gbnVsbCwgb2JzID0gbnVsbDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY3R4ID0gS08/LmNvbnRleHRGb3IgPyBLTy5jb250ZXh0Rm9yKGVsKSA6IG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3QgaWQgPSBlbC5pZDtcbiAgICAgICAgICAgICAgICBjb25zdCBmcm9tUm9vdCA9IGlkICYmIGN0eD8uJHJvb3Q/LmVsZW1lbnRzPy5baWRdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZyb21EYXRhID0gaWQgJiYgY3R4Py4kZGF0YT8uZWxlbWVudHM/LltpZF07XG4gICAgICAgICAgICAgICAgYmFnID0gKGtvUHJlZmVyID09PSAnZGF0YScgPyBmcm9tRGF0YSA6IGZyb21Sb290KSB8fCAoa29QcmVmZXIgPT09ICdkYXRhJyA/IGZyb21Sb290IDogZnJvbURhdGEpIHx8IG51bGw7XG5cbiAgICAgICAgICAgICAgICBpZiAoYmFnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNhbmQgPSBiYWdLZXlzLm1hcChrID0+IGJhZ1trXSkuZmluZChCb29sZWFuKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzT2JzKGNhbmQpKSBvYnMgPSBjYW5kO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghb2JzICYmIEtPPy5jb250ZXh0Rm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRiUmF3ID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWJpbmQnKSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbSA9IC8oPzp2YWx1ZXx0ZXh0SW5wdXQpXFxzKjpcXHMqKFteLH1dKykvLmV4ZWMoZGJSYXcpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwciA9IG1bMV0udHJpbSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXZhbEluID0gKG9iaikgPT4geyB0cnkgeyByZXR1cm4gRnVuY3Rpb24oJ3dpdGgodGhpcyl7cmV0dXJuICgnICsgZXhwciArICcpfScpLmNhbGwob2JqKTsgfSBjYXRjaCB7IHJldHVybiB1bmRlZmluZWQ7IH0gfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb2JlID0gZXZhbEluKGN0eD8uW2tvUHJlZmVyID09PSAnZGF0YScgPyAnJGRhdGEnIDogJyRyb290J10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzT2JzKHByb2JlKSkgb2JzID0gcHJvYmU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogbm9vcCAqLyB9XG5cbiAgICAgICAgICAgIGNvbnN0IGtlbmRvV3JhcCA9IGVsLmNsb3Nlc3Qod2lkZ2V0U2VsZWN0b3IpO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0ga2VuZG9XcmFwPy5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGVsO1xuXG4gICAgICAgICAgICBjb25zdCByZWFkID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCB2O1xuICAgICAgICAgICAgICAgIGlmIChvYnMpIHYgPSB1bihvYnMpO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGJhZykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiYWdWYWwgPSBiYWdLZXlzLm1hcChrID0+IGJhZ1trXSkuZmluZChCb29sZWFuKTtcbiAgICAgICAgICAgICAgICAgICAgdiA9IHR5cGVvZiBiYWdWYWwgPT09ICdmdW5jdGlvbicgPyBiYWdWYWwoKSA6IGJhZ1ZhbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCB8fCB2ID09PSAnJykgdiA9IChlbC52YWx1ZSA/PyBlbC50ZXh0Q29udGVudCA/PyAnJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IEFycmF5LmlzQXJyYXkodikgPyB2WzBdIDogdjtcbiAgICAgICAgICAgICAgICByZXR1cm4gKHMgPz8gJycpLnRvU3RyaW5nKCkudHJpbSgpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgZmlyZSA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWwgPSByZWFkKCk7XG4gICAgICAgICAgICAgICAgaWYgKHZhbCAhPT0gJycgJiYgdHlwZW9mIG9uVmFsdWUgPT09ICdmdW5jdGlvbicpIG9uVmFsdWUodmFsKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBxdWV1ZUZpcmUgPSBfX3RtQ3JlYXRlUXVpZXREaXNwYXRjaGVyKGZpcmUsIHNldHRsZU1zKTtcblxuICAgICAgICAgICAgY29uc3QgdW5zdWJzID0gW107XG5cbiAgICAgICAgICAgIC8vIEluaXRpYWwgZmlyZSAoc2tpcCBpZiBibHVyLW1vZGUsIGJlY2F1c2UgdXNlciBoYXNuXHUyMDE5dCBjb25maXJtZWQgeWV0KVxuICAgICAgICAgICAgaWYgKGluaXRpYWwgJiYgZmlyZU9uICE9PSAnYmx1cicpIHF1ZXVlRmlyZSgpO1xuXG4gICAgICAgICAgICAvLyBLTyBzdWJzY3JpcHRpb25zIGNvbGxhcHNlIGludG8gYSBzaW5nbGUgcXVldWVkIGZpcmVcbiAgICAgICAgICAgIGlmIChvYnMgJiYgdHlwZW9mIG9icy5zdWJzY3JpYmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdWIgPSBvYnMuc3Vic2NyaWJlKCgpID0+IHF1ZXVlRmlyZSgpKTtcbiAgICAgICAgICAgICAgICB1bnN1YnMucHVzaCgoKSA9PiBzdWIuZGlzcG9zZT8uKCkpO1xuICAgICAgICAgICAgICAgIGxvZz8uKCd3YXRjaEJ5U2VsZWN0b3I6IEtPIG9ic2VydmFibGUgc3Vic2NyaXB0aW9uIGF0dGFjaGVkIGZvcicsIHNlbGVjdG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQmFnIHdyYXBwZXJzIChvcHRpb25hbClcbiAgICAgICAgICAgIGlmIChiYWcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBiYWdVbmhvb2tzID0gW107XG4gICAgICAgICAgICAgICAgY29uc3Qgd3JhcCA9IChvYmosIG5hbWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFvYmogfHwgdHlwZW9mIG9ialtuYW1lXSAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvcmlnID0gb2JqW25hbWVdO1xuICAgICAgICAgICAgICAgICAgICBvYmpbbmFtZV0gPSBmdW5jdGlvbiB3cmFwcGVkKC4uLmFyZ3MpIHsgdHJ5IHsgcXVldWVGaXJlKCk7IH0gY2F0Y2ggeyB9IHJldHVybiBvcmlnLmFwcGx5KHRoaXMsIGFyZ3MpOyB9O1xuICAgICAgICAgICAgICAgICAgICBiYWdVbmhvb2tzLnB1c2goKCkgPT4geyBvYmpbbmFtZV0gPSBvcmlnOyB9KTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIFsnb25jaGFuZ2UnLCAnb25ibHVyJywgJ29ua2V5dXAnLCAnb25rZXlkb3duJ10uZm9yRWFjaChuID0+IHdyYXAoYmFnLCBuKSk7XG4gICAgICAgICAgICAgICAgdW5zdWJzLnB1c2goKCkgPT4gYmFnVW5ob29rcy5mb3JFYWNoKGZuID0+IHsgdHJ5IHsgZm4oKTsgfSBjYXRjaCB7IH0gfSkpO1xuICAgICAgICAgICAgICAgIGxvZz8uKCd3YXRjaEJ5U2VsZWN0b3I6IGJhZyBldmVudCB3cmFwcGVycyBhdHRhY2hlZCBmb3InLCBzZWxlY3Rvcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERPTSBsaXN0ZW5lcnMgXHUyMDE0IG5vICdpbnB1dCcgaGFuZGxlciBpbiBibHVyL2NoYW5nZSBtb2RlID0+IG5vIGtleXN0cm9rZSBzcGFtXG4gICAgICAgICAgICBpZiAoZmlyZU9uID09PSAnYmx1cicpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvbkZvY3VzT3V0ID0gKCkgPT4gcXVldWVGaXJlKCk7XG4gICAgICAgICAgICAgICAgY29uc3Qgb25DaGFuZ2UgPSAoKSA9PiBxdWV1ZUZpcmUoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBvbktleURvd24gPSAoZSkgPT4geyBpZiAoZS5rZXkgPT09ICdUYWInIHx8IGUua2V5ID09PSAnRW50ZXInKSBzZXRUaW1lb3V0KHF1ZXVlRmlyZSwgMCk7IH07XG5cbiAgICAgICAgICAgICAgICAvLyBGb2N1cy1vdXQgKGJ1YmJsaW5nKSBpcyBtb3JlIHJlbGlhYmxlIHdpdGggS2VuZG8gd3JhcHBlcnM7IHVzZSBjYXB0dXJlXG4gICAgICAgICAgICAgICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3Vzb3V0Jywgb25Gb2N1c091dCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlKTtcbiAgICAgICAgICAgICAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIG9uS2V5RG93bik7XG5cbiAgICAgICAgICAgICAgICAvLyBJZiB0aGVyZSBpcyBhIHdpZGdldCB3cmFwcGVyLCBsaXN0ZW4gdGhlcmUgdG9vIChzb21lIGNvbWJvcyBtb3ZlIGZvY3VzKVxuICAgICAgICAgICAgICAgIGlmIChrZW5kb1dyYXAgJiYga2VuZG9XcmFwICE9PSB0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAga2VuZG9XcmFwLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3Vzb3V0Jywgb25Gb2N1c091dCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIGtlbmRvV3JhcC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiBxdWV1ZUZpcmUoKSk7XG4gICAgICAgICAgICAgICAgbW8ub2JzZXJ2ZSh0YXJnZXQsIHsgY2hpbGRMaXN0OiB0cnVlLCBjaGFyYWN0ZXJEYXRhOiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICAgICAgdW5zdWJzLnB1c2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCBvbkZvY3VzT3V0LCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBvbktleURvd24pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoa2VuZG9XcmFwICYmIGtlbmRvV3JhcCAhPT0gdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZW5kb1dyYXAucmVtb3ZlRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCBvbkZvY3VzT3V0LCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtlbmRvV3JhcC5yZW1vdmVFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbW8uZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvbkNoYW5nZSA9ICgpID0+IHF1ZXVlRmlyZSgpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbkNoYW5nZSk7XG4gICAgICAgICAgICAgICAgdW5zdWJzLnB1c2goKCkgPT4gdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uQ2hhbmdlKSk7XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgbG9nPy4oJ3dhdGNoQnlTZWxlY3RvcjogbGlzdGVuZXJzIGF0dGFjaGVkIGZvcicsIHNlbGVjdG9yLCB0YXJnZXQpO1xuICAgICAgICAgICAgcmV0dXJuICgpID0+IHsgdW5zdWJzLmZvckVhY2goZm4gPT4geyB0cnkgeyBmbigpOyB9IGNhdGNoIHsgfSB9KTsgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB1bnN1YiA9IGhvb2tOb3coKTtcbiAgICAgICAgaWYgKHR5cGVvZiB1bnN1YiA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIHVuc3ViO1xuXG4gICAgICAgIGNvbnN0IG1vID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICAgICAgdW5zdWIgPSBob29rTm93KCk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHVuc3ViID09PSAnZnVuY3Rpb24nKSBtby5kaXNjb25uZWN0KCk7XG4gICAgICAgIH0pO1xuICAgICAgICBtby5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IG1vLmRpc2Nvbm5lY3QoKSwgdGltZW91dE1zKTtcblxuICAgICAgICByZXR1cm4gKCkgPT4geyB0cnkgeyB0eXBlb2YgdW5zdWIgPT09ICdmdW5jdGlvbicgJiYgdW5zdWIoKTsgfSBjYXRjaCB7IH0gdHJ5IHsgbW8uZGlzY29ubmVjdCgpOyB9IGNhdGNoIHsgfSB9O1xuICAgIH07XG5cbiAgICAoZnVuY3Rpb24gaW5zdGFsbFRtVXJsT2JzZXJ2ZXIoKSB7XG4gICAgICAgIGlmICh3aW5kb3cuX190bVVybE9ic0luc3RhbGxlZCkgcmV0dXJuO1xuICAgICAgICB3aW5kb3cuX190bVVybE9ic0luc3RhbGxlZCA9IHRydWU7XG5cbiAgICAgICAgY29uc3QgRVYgPSAndG11dGlsczp1cmxjaGFuZ2UnO1xuICAgICAgICBjb25zdCBmaXJlID0gKCkgPT4gd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KEVWKSk7XG5cbiAgICAgICAgY29uc3Qgb3JpZ1B1c2ggPSBoaXN0b3J5LnB1c2hTdGF0ZTtcbiAgICAgICAgaGlzdG9yeS5wdXNoU3RhdGUgPSBmdW5jdGlvbiAoKSB7IGNvbnN0IHIgPSBvcmlnUHVzaC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyBmaXJlKCk7IHJldHVybiByOyB9O1xuXG4gICAgICAgIGNvbnN0IG9yaWdSZXBsYWNlID0gaGlzdG9yeS5yZXBsYWNlU3RhdGU7XG4gICAgICAgIGhpc3RvcnkucmVwbGFjZVN0YXRlID0gZnVuY3Rpb24gKCkgeyBjb25zdCByID0gb3JpZ1JlcGxhY2UuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgZmlyZSgpOyByZXR1cm4gcjsgfTtcblxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9wc3RhdGUnLCBmaXJlKTtcblxuICAgICAgICBUTVV0aWxzLm9uVXJsQ2hhbmdlID0gZnVuY3Rpb24gb25VcmxDaGFuZ2UoY2IpIHtcbiAgICAgICAgICAgIGNvbnN0IGggPSAoKSA9PiBjYihsb2NhdGlvbik7XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihFViwgaCk7XG4gICAgICAgICAgICByZXR1cm4gKCkgPT4gd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoRVYsIGgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIFRNVXRpbHMuX2Rpc3BhdGNoVXJsQ2hhbmdlID0gZmlyZTsgLy8gb3B0aW9uYWw6IG1hbnVhbCB0cmlnZ2VyXG4gICAgfSkoKTtcblxuICAgIFRNVXRpbHMub2JzZXJ2ZUluc2VydE1hbnkgPSBmdW5jdGlvbiBvYnNlcnZlSW5zZXJ0TWFueShzZWxlY3RvciwgY2FsbGJhY2ssIHsgcm9vdCA9IGRvY3VtZW50LmJvZHksIHN1YnRyZWUgPSB0cnVlIH0gPSB7fSkge1xuICAgICAgICBjb25zdCBzZWVuID0gbmV3IFdlYWtTZXQoKTtcblxuICAgICAgICBmdW5jdGlvbiBydW5PbihjdHgpIHtcbiAgICAgICAgICAgIGlmIChjdHggJiYgY3R4Lm5vZGVUeXBlID09PSAxKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjdHgubWF0Y2hlcyA9PT0gJ2Z1bmN0aW9uJyAmJiBjdHgubWF0Y2hlcyhzZWxlY3RvcikgJiYgIXNlZW4uaGFzKGN0eCkpIHtcbiAgICAgICAgICAgICAgICAgICAgc2Vlbi5hZGQoY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgY2FsbGJhY2soY3R4KTsgfSBjYXRjaCAoZSkgeyBjb25zb2xlLmVycm9yKCdvYnNlcnZlSW5zZXJ0TWFueSBjYWxsYmFjayBlcnJvcjonLCBlKTsgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGN0eC5xdWVyeVNlbGVjdG9yQWxsID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2Vlbi5oYXMoZWwpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2Vlbi5hZGQoZWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7IGNhbGxiYWNrKGVsKTsgfSBjYXRjaCAoZSkgeyBjb25zb2xlLmVycm9yKCdvYnNlcnZlSW5zZXJ0TWFueSBjYWxsYmFjayBlcnJvcjonLCBlKTsgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBtbyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG11dHMgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBtIG9mIG11dHMpIHtcbiAgICAgICAgICAgICAgICBpZiAobS5hZGRlZE5vZGVzICYmIG0uYWRkZWROb2Rlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgbS5hZGRlZE5vZGVzLmZvckVhY2gocnVuT24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgbW8ub2JzZXJ2ZShyb290LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZSB9KTtcbiAgICAgICAgLy8gZmlyZSBmb3IgYW55dGhpbmcgYWxyZWFkeSBvbiB0aGUgcGFnZVxuICAgICAgICBydW5Pbihyb290KTtcblxuICAgICAgICAvLyByZXR1cm4gZGlzcG9zZXJcbiAgICAgICAgcmV0dXJuICgpID0+IG1vLmRpc2Nvbm5lY3QoKTtcbiAgICB9O1xuXG4gICAgVE1VdGlscy5zbGVlcCA9IChtcykgPT4gbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIG1zKSk7XG5cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIE5ldHdvcmsgd2F0Y2hlciAoQWRkVXBkYXRlRm9ybSAxMDAzMikgXHUyMDE0IGZldGNoICsgWEhSXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgKGZ1bmN0aW9uIGFkZE5ldFdhdGNoZXIoKSB7XG4gICAgICAgIGNvbnN0IHJvb3QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xuICAgICAgICBjb25zdCBUTVUgPSB3aW5kb3cuVE1VdGlsczsgICAgICAgICAgICAvLyBzYW1lIG9iamVjdCB5b3UgZXhwb3J0IGF0IHRoZSBlbmRcbiAgICAgICAgVE1VLm5ldCA9IFRNVS5uZXQgfHwge307XG5cbiAgICAgICAgVE1VLm5ldC5lbnN1cmVXYXRjaGVyID0gZnVuY3Rpb24gZW5zdXJlV2F0Y2hlcigpIHtcbiAgICAgICAgICAgIGlmIChyb290Ll9fbHROZXRQYXRjaGVkKSByZXR1cm47XG4gICAgICAgICAgICByb290Ll9fbHROZXRQYXRjaGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgLy8gLS0tLSBmZXRjaCgpIC0tLS1cbiAgICAgICAgICAgIGNvbnN0IG9yaWdGZXRjaCA9IHJvb3QuZmV0Y2ggJiYgcm9vdC5mZXRjaC5iaW5kKHJvb3QpO1xuICAgICAgICAgICAgaWYgKG9yaWdGZXRjaCkge1xuICAgICAgICAgICAgICAgIHJvb3QuZmV0Y2ggPSBmdW5jdGlvbiAoaW5wdXQsIGluaXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlcSA9IChpbnB1dCBpbnN0YW5jZW9mIFJlcXVlc3QpID8gaW5wdXQgOiBuZXcgUmVxdWVzdChpbnB1dCwgaW5pdCB8fCB7fSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB1cmwgPSBTdHJpbmcocmVxLnVybCB8fCAnJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtZXRob2QgPSAocmVxLm1ldGhvZCB8fCAoaW5pdCAmJiBpbml0Lm1ldGhvZCkgfHwgJ0dFVCcpLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNUYXJnZXQodXJsLCBtZXRob2QpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVxLmNsb25lKCkuYXJyYXlCdWZmZXIoKS50aGVuKGJ1ZiA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN0ID0gcmVxLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYm9keSA9IHBhcnNlQm9keUZyb21CdWZmZXIoYnVmLCBjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFRNVS5uZXQuX2hhbmRsZUFkZFVwZGF0ZSh1cmwsIGJvZHkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHsgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvcmlnRmV0Y2goaW5wdXQsIGluaXQpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIC0tLS0gWEhSIC0tLS1cbiAgICAgICAgICAgIGNvbnN0IFhIUiA9IHJvb3QuWE1MSHR0cFJlcXVlc3Q7XG4gICAgICAgICAgICBpZiAoWEhSICYmIFhIUi5wcm90b3R5cGUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcGVuID0gWEhSLnByb3RvdHlwZS5vcGVuO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlbmQgPSBYSFIucHJvdG90eXBlLnNlbmQ7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2V0UmVxdWVzdEhlYWRlciA9IFhIUi5wcm90b3R5cGUuc2V0UmVxdWVzdEhlYWRlcjtcblxuICAgICAgICAgICAgICAgIFhIUi5wcm90b3R5cGUub3BlbiA9IGZ1bmN0aW9uIChtZXRob2QsIHVybCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9fbHRNZXRob2QgPSBTdHJpbmcobWV0aG9kIHx8ICdHRVQnKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9fbHRVcmwgPSBTdHJpbmcodXJsIHx8ICcnKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fX2x0SGVhZGVycyA9IHt9O1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb3Blbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgWEhSLnByb3RvdHlwZS5zZXRSZXF1ZXN0SGVhZGVyID0gZnVuY3Rpb24gKGssIHYpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgdGhpcy5fX2x0SGVhZGVyc1trLnRvTG93ZXJDYXNlKCldID0gdjsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNldFJlcXVlc3RIZWFkZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIFhIUi5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uIChib2R5KSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB1cmwgPSB0aGlzLl9fbHRVcmwgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtZXRob2QgPSB0aGlzLl9fbHRNZXRob2QgfHwgJ0dFVCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNUYXJnZXQodXJsLCBtZXRob2QpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3QgPSAodGhpcy5fX2x0SGVhZGVyc1snY29udGVudC10eXBlJ10gfHwgJycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBvYmogPSB7fTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGJvZHkgPT09ICdzdHJpbmcnKSBvYmogPSBwYXJzZUJvZHlGcm9tU3RyaW5nKGJvZHksIGN0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChib2R5IGluc3RhbmNlb2YgVVJMU2VhcmNoUGFyYW1zKSBvYmogPSBPYmplY3QuZnJvbUVudHJpZXMoYm9keS5lbnRyaWVzKCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHJvb3QuRm9ybURhdGEgJiYgYm9keSBpbnN0YW5jZW9mIEZvcm1EYXRhKSBvYmogPSBPYmplY3QuZnJvbUVudHJpZXMoYm9keS5lbnRyaWVzKCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFRNVS5uZXQuX2hhbmRsZUFkZFVwZGF0ZSh1cmwsIG9iaik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzZW5kLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBUTVUubmV0Lm9uQWRkVXBkYXRlID0gZnVuY3Rpb24gb25BZGRVcGRhdGUoZm4pIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgICAgICAgICBjb25zdCBoID0gKGUpID0+IGZuKGUuZGV0YWlsIHx8IHt9KTtcbiAgICAgICAgICAgIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcignTFQ6UXVvdGVQYXJ0QWRkVXBkYXRlRm9ybScsIGgpO1xuICAgICAgICAgICAgcmV0dXJuICgpID0+IHJvb3QucmVtb3ZlRXZlbnRMaXN0ZW5lcignTFQ6UXVvdGVQYXJ0QWRkVXBkYXRlRm9ybScsIGgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIFRNVS5uZXQuZ2V0TGFzdEFkZFVwZGF0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChUTVUuc3RhdGU/Lmxhc3RBZGRVcGRhdGVGb3JtKSByZXR1cm4gVE1VLnN0YXRlLmxhc3RBZGRVcGRhdGVGb3JtO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzID0gc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbSgnTFRfTEFTVF9BRERVUERBVEVGT1JNJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMgPyBKU09OLnBhcnNlKHMpIDogbnVsbDtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gbnVsbDsgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIC0tLS0gaW50ZXJuYWxzIC0tLS1cbiAgICAgICAgZnVuY3Rpb24gaXNUYXJnZXQodXJsLCBtZXRob2QpIHtcbiAgICAgICAgICAgIHJldHVybiBtZXRob2QgPT09ICdQT1NUJ1xuICAgICAgICAgICAgICAgICYmIC9cXC9TYWxlc0FuZENSTVxcL1F1b3RlUGFydFxcL0FkZFVwZGF0ZUZvcm0vaS50ZXN0KHVybClcbiAgICAgICAgICAgICAgICAmJiAvKD86XFw/fCYpc291cmNlQWN0aW9uS2V5PTEwMDMyKD86JnwkKS9pLnRlc3QodXJsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHBhcnNlQm9keUZyb21CdWZmZXIoYnVmLCBjb250ZW50VHlwZSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGJ1ZiB8fCBuZXcgVWludDhBcnJheSgpKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcGFyc2VCb2R5RnJvbVN0cmluZyh0ZXh0LCBjb250ZW50VHlwZSk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIHt9OyB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBwYXJzZUJvZHlGcm9tU3RyaW5nKHRleHQsIGNvbnRlbnRUeXBlKSB7XG4gICAgICAgICAgICBpZiAoIXRleHQpIHJldHVybiB7fTtcbiAgICAgICAgICAgIGNvbnN0IGN0ID0gKGNvbnRlbnRUeXBlIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgaWYgKGN0LmluY2x1ZGVzKCdhcHBsaWNhdGlvbi9qc29uJykgfHwgL15bXFxze1xcW10vLnRlc3QodGV4dCkpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyByZXR1cm4gSlNPTi5wYXJzZSh0ZXh0KTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjdC5pbmNsdWRlcygnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJykgfHwgdGV4dC5pbmNsdWRlcygnPScpKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgcmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhuZXcgVVJMU2VhcmNoUGFyYW1zKHRleHQpLmVudHJpZXMoKSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH1cblxuICAgICAgICBUTVUubmV0Ll9oYW5kbGVBZGRVcGRhdGUgPSBmdW5jdGlvbiAodXJsLCBwYXlsb2FkKSB7XG4gICAgICAgICAgICBjb25zdCBxdW90ZUtleSA9XG4gICAgICAgICAgICAgICAgTnVtYmVyKHBheWxvYWQ/LlF1b3RlS2V5KSB8fFxuICAgICAgICAgICAgICAgIE51bWJlcigoL1s/Jl1RdW90ZUtleT0oXFxkKykvaS5leGVjKHVybCkgfHwgW10pWzFdKSB8fFxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgY29uc3QgaGFzUGFydE5vID1cbiAgICAgICAgICAgICAgICAhIShwYXlsb2FkPy5QYXJ0Tm8gfHwgcGF5bG9hZD8uUGFydEtleSB8fCBwYXlsb2FkPy5QYXJ0TmFtZSkgfHxcbiAgICAgICAgICAgICAgICAoQXJyYXkuaXNBcnJheShwYXlsb2FkPy5fX3JldmlzaW9uVHJhY2tpbmdEYXRhKSAmJlxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkLl9fcmV2aXNpb25UcmFja2luZ0RhdGEuc29tZSh4ID0+XG4gICAgICAgICAgICAgICAgICAgICAgICBBcnJheS5pc0FycmF5KHgucmV2aXNpb25UcmFja2luZ0VudHJpZXMpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB4LnJldmlzaW9uVHJhY2tpbmdFbnRyaWVzLnNvbWUoZSA9PiAvUGFydCBOby9pLnRlc3QoZT8uRmllbGQgfHwgJycpKVxuICAgICAgICAgICAgICAgICAgICApKTtcblxuICAgICAgICAgICAgY29uc3QgZGV0YWlsID0ge1xuICAgICAgICAgICAgICAgIHVybCxcbiAgICAgICAgICAgICAgICBxdW90ZUtleSxcbiAgICAgICAgICAgICAgICBoYXNQYXJ0Tm8sXG4gICAgICAgICAgICAgICAgcGFydE5vOiBwYXlsb2FkPy5QYXJ0Tm8gPz8gbnVsbCxcbiAgICAgICAgICAgICAgICBjdXN0b21lclBhcnRObzogcGF5bG9hZD8uQ3VzdG9tZXJQYXJ0Tm8gPz8gbnVsbCxcbiAgICAgICAgICAgICAgICBwYXJ0S2V5OiBwYXlsb2FkPy5QYXJ0S2V5ID8/IG51bGwsXG4gICAgICAgICAgICAgICAgYXQ6IERhdGUubm93KClcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIFRNVS5zdGF0ZSA9IFRNVS5zdGF0ZSB8fCB7fTtcbiAgICAgICAgICAgIFRNVS5zdGF0ZS5sYXN0QWRkVXBkYXRlRm9ybSA9IGRldGFpbDtcbiAgICAgICAgICAgIHRyeSB7IHNlc3Npb25TdG9yYWdlLnNldEl0ZW0oJ0xUX0xBU1RfQUREVVBEQVRFRk9STScsIEpTT04uc3RyaW5naWZ5KGRldGFpbCkpOyB9IGNhdGNoIHsgfVxuXG4gICAgICAgICAgICB0cnkgeyByb290LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdMVDpRdW90ZVBhcnRBZGRVcGRhdGVGb3JtJywgeyBkZXRhaWwgfSkpOyB9IGNhdGNoIHsgfVxuICAgICAgICB9O1xuICAgIH0pKCk7XG5cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFx1RDgzRFx1REQwMSBHbG9iYWwgZXhwb3N1cmUgZm9yIFRhbXBlck1vbmtleSBzYW5kYm94XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmFzc2lnbihUTVV0aWxzLCB7XG4gICAgICAgIGdldEFwaUtleSxcbiAgICAgICAgZmV0Y2hEYXRhOiBUTVV0aWxzLmZldGNoRGF0YSwgXG4gICAgICAgIHdhaXRGb3JNb2RlbEFzeW5jLFxuICAgICAgICB3YXRjaEJ5TGFiZWw6IFRNVXRpbHMud2F0Y2hCeUxhYmVsLFxuICAgICAgICBhd2FpdFZhbHVlQnlMYWJlbDogVE1VdGlscy5hd2FpdFZhbHVlQnlMYWJlbCxcbiAgICAgICAgd2F0Y2hCeVNlbGVjdG9yOiBUTVV0aWxzLndhdGNoQnlTZWxlY3RvcixcbiAgICAgICAgb2JzZXJ2ZUluc2VydE1hbnk6IFRNVXRpbHMub2JzZXJ2ZUluc2VydE1hbnksXG4gICAgICAgIHNob3dNZXNzYWdlLCBoaWRlTWVzc2FnZSwgb2JzZXJ2ZUluc2VydCxcbiAgICAgICAgc2VsZWN0T3B0aW9uQnlUZXh0LCBzZWxlY3RPcHRpb25CeVZhbHVlLFxuICAgICAgICB0b2FzdCxcbiAgICAgICAgbG9nLCB3YXJuLCBlcnJvciwgb2ssXG4gICAgICAgIGVuc3VyZVJvdXRlLCBvblJvdXRlQ2hhbmdlLCBtYXRjaFJvdXRlLFxuICAgICAgICBzZXREZWJ1ZywgbWFrZUxvZ2dlciwgZ2V0TG9nZ2VyLCBhdHRhY2hMb2dnZXJHbG9iYWwsXG4gICAgICAgIGRzOiBUTVV0aWxzLmRzLCBkc1Jvd3M6IFRNVXRpbHMuZHNSb3dzLFxuICAgICAgICBuZXQ6IFRNVXRpbHMubmV0LFxuXG4gICAgfSk7XG59KSh3aW5kb3cpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFjQSxHQUFDLFNBQVVBLFNBQVE7QUFDZjtBQU1BLFVBQU0sVUFBVSxDQUFDO0FBQ2pCLElBQUFBLFFBQU8sVUFBVTtBQUNqQixRQUFJLE9BQU8saUJBQWlCLFlBQWEsY0FBYSxVQUFVO0FBR2hFLFFBQUksRUFBRSxtQkFBbUIsU0FBVSxTQUFRLGdCQUFnQjtBQUczRCxhQUFTLGVBQWUsS0FBSztBQUN6QixVQUFJLENBQUMsSUFBSyxRQUFPO0FBQ2pCLFVBQUkscUJBQXFCLEtBQUssR0FBRyxF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VUFDWDtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQSxRQUFRLFNBQVMsVUFBVTtBQUFBLFVBQzNCLGdCQUFnQixTQUFTLGtCQUFrQjtBQUFBLFVBQzNDLFNBQVMsU0FBUyxXQUFXO0FBQUEsVUFDN0IsSUFBSSxLQUFLLElBQUk7QUFBQSxRQUNqQjtBQUVBLFlBQUksUUFBUSxJQUFJLFNBQVMsQ0FBQztBQUMxQixZQUFJLE1BQU0sb0JBQW9CO0FBQzlCLFlBQUk7QUFBRSx5QkFBZSxRQUFRLHlCQUF5QixLQUFLLFVBQVUsTUFBTSxDQUFDO0FBQUEsUUFBRyxRQUFRO0FBQUEsUUFBRTtBQUV6RixZQUFJO0FBQUUsZUFBSyxjQUFjLElBQUksWUFBWSw2QkFBNkIsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUFBLFFBQUcsUUFBUTtBQUFBLFFBQUU7QUFBQSxNQUNsRztBQUFBLElBQ0osR0FBRztBQU1ILFdBQU8sT0FBTyxTQUFTO0FBQUEsTUFDbkI7QUFBQSxNQUNBLFdBQVcsUUFBUTtBQUFBLE1BQ25CO0FBQUEsTUFDQSxjQUFjLFFBQVE7QUFBQSxNQUN0QixtQkFBbUIsUUFBUTtBQUFBLE1BQzNCLGlCQUFpQixRQUFRO0FBQUEsTUFDekIsbUJBQW1CLFFBQVE7QUFBQSxNQUMzQjtBQUFBLE1BQWE7QUFBQSxNQUFhO0FBQUEsTUFDMUI7QUFBQSxNQUFvQjtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQUs7QUFBQSxNQUFNO0FBQUEsTUFBTztBQUFBLE1BQ2xCO0FBQUEsTUFBYTtBQUFBLE1BQWU7QUFBQSxNQUM1QjtBQUFBLE1BQVU7QUFBQSxNQUFZO0FBQUEsTUFBVztBQUFBLE1BQ2pDLElBQUksUUFBUTtBQUFBLE1BQUksUUFBUSxRQUFRO0FBQUEsTUFDaEMsS0FBSyxRQUFRO0FBQUEsSUFFakIsQ0FBQztBQUFBLEVBQ0wsR0FBRyxNQUFNOyIsCiAgIm5hbWVzIjogWyJ3aW5kb3ciLCAib2siLCAicm9vdCIsICJLTyIsICJpc0FycmF5VGFyZ2V0IiwgImN1ciIsICJsb2ciLCAibW8iXQp9Cg==
