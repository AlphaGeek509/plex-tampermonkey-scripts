// ==UserScript==
// @name         CR&S10 ➜ Validate Certs Before Scheduling
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.173
// @author       Jeff Nichols
// @description  Validate certs by OrderNo+PartNo+SerialNo (display), call DS8566 (Heat_Key/Serial_No) then DS14343 by Heat_Key. Show results, require Acknowledgement when issues exist, offer quick email for misses, and provide a small settings GUI.
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.plex.com
// @connect      localhost
// @run-at       document-idle
// Don’t run in iframes
// @noframes
// ==/UserScript==

(async function () {
    'use strict';

    // ---------- Standard bootstrap ----------
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);

    const L = TMUtils.getLogger?.('CRS10'); // rename per file: QT20, QT30, QT35
    const dlog = (...a) => { if (IS_TEST_ENV) L?.log?.(...a); };
    const dwarn = (...a) => { if (IS_TEST_ENV) L?.warn?.(...a); };
    const derror = (...a) => { if (IS_TEST_ENV) L?.error?.(...a); };

    // Route allowlist (CASE-INSENSITIVE)
    const ROUTES = [/^\/SalesAndCRM\/SalesReleases(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) {
        dlog('Skipping route:', location.pathname);
        return;
    }

    // ---------- Guard cross-origin CSS access (SecurityError) ----------
    const _cssRulesDesc = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, 'cssRules');
    if (_cssRulesDesc?.get) {
        Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', {
            get() { try { return _cssRulesDesc.get.call(this); } catch { return []; } }
        });
    }
    const _rulesDesc = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, 'rules');
    if (_rulesDesc?.get) {
        Object.defineProperty(CSSStyleSheet.prototype, 'rules', {
            get() { try { return _rulesDesc.get.call(this); } catch { return []; } }
        });
    }

    // ---------- Settings keys / load ----------
    const SHOW_MISSING_KEY = 'crs10.showMissingOnly';
    const MISSING_TO_KEY = 'crs10.missingToAddress';
    const LIMIT_CUSTOMER_KEY = 'crs10.limitMCM199Only';

    let showMissingOnly = GM_getValue(SHOW_MISSING_KEY, false);
    let missingToAddress = GM_getValue(MISSING_TO_KEY, '');
    let limitMCM199Only = GM_getValue(LIMIT_CUSTOMER_KEY, false);


    // ---------- Settings button / panel ----------
    function injectSettingsButton() {
        const btn = document.createElement('button');
        btn.textContent = '⚙️';
        Object.assign(btn.style, {
            position: 'fixed', bottom: '20px', right: '20px',
            zIndex: 100001, padding: '6px', borderRadius: '50%',
            fontSize: '18px', cursor: 'pointer'
        });
        btn.title = 'CR&S10 Settings';
        btn.addEventListener('click', showSettingsPanel);
        document.body.appendChild(btn);
    }

    function showSettingsPanel() {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.35)', zIndex: 100002
        });
        const panel = document.createElement('div');
        Object.assign(panel.style, {
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            background: '#fff', padding: '20px', borderRadius: '10px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)', fontFamily: 'system-ui, sans-serif',
            width: '360px', maxWidth: '90vw'
        });
        panel.innerHTML = `
      <h3 style="margin:0 0 12px 0;">CR&S10 Settings</h3>
      <label style="display:block; margin:10px 0;">
        <input type="checkbox" id="cb-missing-only"> Show missing certs only
      </label>
      <label style="display:block; margin:10px 0;">
        <input type="checkbox" id="cb-limit-mcm"> Limit results to customer MCM199 only
      </label>
      <label style="display:block; margin:10px 0;">
        Missing Cert To Address:<br>
        <input type="email" id="input-missing-to"
               placeholder="user@example.com"
               style="width:100%; box-sizing:border-box; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
        <button id="btn-close">Close</button>
      </div>
    `;
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const cbMissing = panel.querySelector('#cb-missing-only');
        cbMissing.checked = showMissingOnly;
        cbMissing.addEventListener('change', () => {
            showMissingOnly = cbMissing.checked;
            GM_setValue(SHOW_MISSING_KEY, showMissingOnly);
        });

        const cbLimit = panel.querySelector('#cb-limit-mcm');
        cbLimit.checked = limitMCM199Only;
        cbLimit.addEventListener('change', () => {
            limitMCM199Only = cbLimit.checked;
            GM_setValue(LIMIT_CUSTOMER_KEY, limitMCM199Only);
        });

        const emailInput = panel.querySelector('#input-missing-to');
        emailInput.value = missingToAddress;
        emailInput.addEventListener('change', () => {
            missingToAddress = emailInput.value.trim();
            GM_setValue(MISSING_TO_KEY, missingToAddress);
        });

        panel.querySelector('#btn-close').addEventListener('click', () => overlay.remove());
    }

    injectSettingsButton();

    // ---------- Ensure TMUtils + KO ----------
    if (typeof TMUtils === 'undefined') {
        derror('TMUtils helper not found; check @require URLs.');
        return;
    }
    const ko = unsafeWindow.ko;
    if (!ko) {
        derror('Knockout not found.');
        return;
    }


    // ---------- Helpers ----------
    const unwrap = (v) => (typeof ko.unwrap === 'function' ? ko.unwrap(v) : (typeof v === 'function' ? v() : v));

    function launchMailtoRow({ orderNo, partNo, serialNo }) {
        const to = encodeURIComponent(missingToAddress || '');
        const cc = '';
        const subject = encodeURIComponent(`Missing Attachment: Order ${orderNo}`);
        let body = `OrderNo: ${orderNo}\nPartNo: ${partNo}\nSerialNo: ${serialNo}\n\nMissing attachment detected. Please investigate.\n`;
        const uri = `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${subject}&body=${encodeURIComponent(body)}`;
        window.open(uri, '_blank');
    }

    function showDecisionTable(statusArray, onAck) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100000
        });

        const box = document.createElement('div');
        Object.assign(box.style, {
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: '#fff', padding: '20px', borderRadius: '10px',
            maxWidth: '90%', maxHeight: '80%', overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)', fontFamily: 'system-ui, sans-serif'
        });

        const total = statusArray.length;
        const issues = statusArray.filter(x => x.error || x.count === 0).length;

        const title = document.createElement('div');
        title.innerHTML = `<h3 style="margin:0 0 10px 0;">Attachment Check</h3>
      <div style="opacity:.8; font-size:12px; margin-bottom:10px;">
        Checked <b>${total}</b> entries • Issues: <b>${issues}</b>
      </div>`;
        box.appendChild(title);

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['OrderNo', 'PartNo', 'SerialNo', 'Has Attachments', 'Email'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            Object.assign(th.style, { border: '1px solid #ccc', padding: '8px', background: '#f6f6f6', textAlign: 'left' });
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        let prevOrder = null, prevPart = null;
        statusArray.forEach(item => {
            const tr = document.createElement('tr');

            const showOrder = item.orderNo !== prevOrder ? item.orderNo : '';
            const showPart = item.partNo !== prevPart ? item.partNo : '';
            prevOrder = item.orderNo;
            prevPart = item.partNo;

            const hasAttach = item.error ? '⚠️' : (item.count > 0 ? '✅' : '❌');

            [showOrder, showPart, item.serialNo, hasAttach].forEach((val, idx) => {
                const td = document.createElement('td');
                td.textContent = val;
                Object.assign(td.style, { border: '1px solid #ddd', padding: '6px', textAlign: idx < 3 ? 'left' : 'center' });
                tr.appendChild(td);
            });

            const tdEmail = document.createElement('td');
            Object.assign(tdEmail.style, { border: '1px solid #ddd', padding: '6px', textAlign: 'center' });
            if (item.error || item.count === 0) {
                const mail = document.createElement('span');
                mail.textContent = '✉️';
                mail.title = 'Email this missing cert';
                mail.style.cursor = 'pointer';
                mail.addEventListener('click', e => { e.stopPropagation(); launchMailtoRow(item); });
                tdEmail.appendChild(mail);
            }
            tr.appendChild(tdEmail);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        box.appendChild(table);

        const footer = document.createElement('div');
        footer.style.textAlign = 'center';
        footer.style.marginTop = '14px';
        const btnAck = document.createElement('button');
        btnAck.textContent = 'Acknowledged';
        btnAck.addEventListener('click', () => { overlay.remove(); onAck(); });
        footer.appendChild(btnAck);
        box.appendChild(footer);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    // ---------- Core: hook Schedule button (once) and validate ----------
    async function waitForRootVM() {
        if (typeof TMUtils.waitForModelAsync === 'function') {
            const { viewModel } = await TMUtils.waitForModelAsync('.plex-grid', {
                pollMs: 250,
                timeoutMs: 30000,
                logger: IS_TEST_ENV ? L : null
            });
            return viewModel || null;
        }

        // Fallback (if utils not loaded): poll DOM + KO safely
        return new Promise(resolve => {
            const getKo = () =>
                (typeof window !== 'undefined' && window.ko) ||
                (typeof unsafeWindow !== 'undefined' && unsafeWindow.ko) || null;

            const tick = () => {
                const el = document.querySelector('.plex-grid');
                const koObj = getKo();
                let vm = null;
                if (el && koObj && typeof koObj.contextFor === 'function') {
                    const ctx = koObj.contextFor(el);
                    vm = ctx?.$root?.data || ctx?.$root || null;
                }
                if (vm) return resolve(vm);
                setTimeout(tick, 250);
            };
            tick();
        });
    }

    function showMsg(msg, opts) {
        if (TMUtils?.showMessage) TMUtils.showMessage(msg, opts);
        else dlog(msg);
    }

    const vm = await waitForRootVM();
    if (!vm) {
        derror?.('Could not resolve root VM under .plex-grid');
        return;
    }

    // ---------- Core: robust "Schedule" interception (delegated) ----------

    // Match both <a> and <button> (text-based)
    function isScheduleControl(el) {
        const btn = el?.closest?.('a,button,input[type="button"],input[type="submit"]');
        if (!btn) return null;
        const label = (btn.innerText || btn.textContent || btn.value || '').trim();
        // allow "Schedule" and "Schedule..." (case-insensitive)
        if (/^schedule(?:\s*\.\.\.)?$/i.test(label)) return btn;
        return null;
    }

    async function onScheduleClick(e) {
        // ---------- API key ----------
        // Warm the key; if we don’t have one, prompt the user to set it
        const apiKey = await TMUtils.getApiKey({ wait: true, timeoutMs: 8000 });
        if (!apiKey) {
            TMUtils.toast('🔐 No Plex API key found. Use “⚙️ Set Plex API Key” in the Tampermonkey menu.', 'error', 4000);
            return;
        }

        const btn = isScheduleControl(e.target);
        if (!btn) return;          // not our control
        if (!e.isTrusted) return;  // ignore programmatic clicks (lets our later btn.click() pass through)

        // intercept native click
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();

        dlog('Intercepted Schedule click:', btn);
        showMsg('⏳ Validating certificates…', { type: 'info', autoClear: false });

        try {
            // We already resolved the root VM above:
            //   const vm = await waitForRootVM();
            if (!vm) {
                derror('Could not resolve root VM under .plex-grid');
                showMsg('❌ Could not resolve grid VM.', { type: 'error', autoClear: 3500 });
                return;
            }

            // Gather results
            const results = unwrap(vm.results) || [];

            // Filter “flagged for schedule”
            let flagged = results
                .filter(r => unwrap(r.IsScheduleShipment))
                .map(r => ({
                    orderNo: unwrap(r.OrderNo),
                    partNo: unwrap(r.PartNo),
                    partKey: unwrap(r.PartKey),
                    customerCode: unwrap(r.CustomerCode),
                }));

            if (limitMCM199Only) flagged = flagged.filter(r => r.customerCode === 'MCM199');

            if (flagged.length === 0) {
                showMsg('⚠️ No shipments flagged', { type: 'warning', autoClear: 2500 });
                return btn.click(); // pass-through to native Schedule
            }

            if (IS_TEST_ENV) {
                const peek = (await TMUtils.getApiKey()).toString();
                L?.info?.('CRS10 auth present:', !!peek, 'prefix:', peek.slice(0, 10));
            }

            // DS8566: Heat_Key + Serial_No per flagged part
            const res8566 = await Promise.all(
                flagged.map(item =>
                    TMUtils.ds(8566, { Part_Key: item.partKey })
                        .catch(err => ({ rows: [], error: String(err) }))
                )
            );

            // Flatten unique combos
            const combos = [];
            const seen = new Set();
            res8566.forEach((data, idx) => {
                const { orderNo, partNo } = flagged[idx];
                (data.rows || []).forEach(r => {
                    const hk = r.Heat_Key, sn = r.Serial_No;
                    const key = `${orderNo}|${partNo}|${hk}|${sn}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        combos.push({ orderNo, partNo, heatKey: hk, serialNo: sn });
                    }
                });
            });

            // DS14343: attachments by Heat_Key
            const statusArray = await Promise.all(
                combos.map(async ({ orderNo, partNo, heatKey, serialNo }) => {
                    try {
                        const { rows } = await TMUtils.ds(14343, {
                            Record_Key_Value: String(heatKey),
                            Attachment_Group_Key: 45
                        });
                        return { orderNo, partNo, serialNo, count: (rows ?? []).length };
                    } catch (err) {
                        return { orderNo, partNo, serialNo, error: String(err) };
                    }
                })
            );

            dlog('Final status:', statusArray);
            showMsg(`🔍 Checked ${statusArray.length} entries`, { type: 'info', autoClear: 2000 });

            // Decide what to display
            const issuesOnly = showMissingOnly
                ? statusArray.filter(x => x.error || x.count === 0)
                : statusArray;

            const hasIssues = statusArray.some(x => x.error || x.count === 0);
            if (!hasIssues) {
                showMsg('✅ All attachments present. Proceeding…', { type: 'success', autoClear: 1800 });
                return btn.click(); // continue to native Schedule
            }

            // Require acknowledgement if any issues
            showDecisionTable(issuesOnly, () => {
                showMsg('✅ Acknowledged', { type: 'success', autoClear: 1800 });
                btn.click(); // programmatic click → not re-intercepted (we ignore !e.isTrusted)
            });

        } catch (err) {
            derror('Schedule validation failed:', err);
            showMsg(`❌ ${err?.message || err}`, { type: 'error', autoClear: 4000 });
            // Fail-open so ops aren’t blocked
            btn.click();
        }
    }

    // Attach once, capture phase so we run before KO’s handlers
    document.addEventListener('click', onScheduleClick, true);
    dlog('Schedule interceptor attached (delegated)');


    // ---------- Menu command ----------
    GM_registerMenuCommand('🔧 Re-hook CR&S10 Schedule', () => location.reload());
})();
