// Adds a “Validate Lines” button and wires it to the engine.
// Assumes your settings UI exports getSettings/onSettingsChange.

import { runValidation } from './engine';
import { getSettings, onSettingsChange } from './index';

const HUB_BTN_ID = 'qt50-validate';

async function getHub(opts = { mount: 'nav' }) {
    for (let i = 0; i < 50; i++) {
        const ensure = (window.ensureLTHub || unsafeWindow?.ensureLTHub);
        if (typeof ensure === 'function') {
            try { const hub = await ensure(opts); if (hub) return hub; } catch { }
        }
        await new Promise(r => setTimeout(r, 100));
    }
    return null;
}

export async function mountValidationButton(TMUtils) {
    const hub = await getHub({ mount: 'nav' });
    if (!hub?.registerButton) return () => { };

    // avoid duplicate
    if (hub.list?.()?.includes(HUB_BTN_ID)) return () => { };

    let btnEl = null;
    hub.registerButton('left', {
        id: HUB_BTN_ID,
        label: 'Validate Lines',
        title: 'Validate quote line rules',
        weight: 130,
        onClick: async () => {
            const settings = getSettings?.() || {};
            const task = lt.core.hub.beginTask?.('Validating…', 'info') || { done() { }, error() { } };

            try {
                // Clear old highlights
                clearValidationHighlights();

                const res = await runValidation(TMUtils, settings);

                if (res?.ok) {
                    lt.core.hub.notify?.('✅ Lines valid', 'success', { ms: 1800 });
                    task.done?.('Valid');
                    if (settings.blockNextUntilValid) setNextDisabled(false);
                } else {
                    // Show summary
                    const issues = Array.isArray(res?.issues) ? res.issues : [];
                    const count = issues.length;
                    const summary = buildIssuesSummary(issues);

                    lt.core.hub.notify?.(
                        `❌ ${count} validation ${count === 1 ? 'issue' : 'issues'}`,
                        'error',
                        { ms: 6500 }
                    );
                    lt.core.hub.setStatus?.(
                        `❌ ${count} issue${count === 1 ? '' : 's'} — ${summary}`,
                        'error',
                        { sticky: true }
                    );
                }

                // cache last status for SPA redraws
                TMUtils.state = TMUtils.state || {};
                TMUtils.state.lastValidation = res;

                // Keep "Next" button state sticky for a few SPA ticks if enabled
                if (settings.blockNextUntilValid) {
                    let ticks = 0;
                    const timer = setInterval(() => {
                        const last = TMUtils?.state?.lastValidation;
                        const shouldBlock = !!(last && last.ok === false);
                        syncNextButtonDisabled(shouldBlock);
                        if (++ticks >= 8) clearInterval(timer); // ~6s total
                    }, 750);
                }


            } catch (err) {
                lt.core.hub.notify?.(`Validation error: ${err?.message || err}`, 'error', { ms: 6000 });
                task.error?.('Error');
            }
        }
    });

    // Grab back the real DOM button to update title later
    btnEl = hub._shadow?.querySelector?.(`[data-id="${HUB_BTN_ID}"]`);

    const offSettings = onSettingsChange?.(() => refreshLabel(btnEl));
    refreshLabel(btnEl);

    return () => {
        offSettings?.();
        hub?.remove?.(HUB_BTN_ID);
    };
}

function syncNextButtonDisabled(disabled) {
    const next = document.querySelector('#NextWizardPage');
    if (next) next.disabled = !!disabled;
}

function refreshLabel(btn) {
    if (!btn) return;
    const s = getSettings();
    const parts = [];
    //if (s.requireResolvedPart) parts.push('Part');
    //if (s.forbidZeroPrice) parts.push('≠$0');
    //if (s.minUnitPrice != null) parts.push(`≥${s.minUnitPrice}`);
    if (s.maxUnitPrice != null) parts.push(`≤${s.maxUnitPrice}`);
    btn.title = `Rules: ${parts.join(', ') || 'none'}`;
}

function clearValidationHighlights() {
    document.querySelectorAll('.qtv-row-fail').forEach(el => el.classList.remove('qtv-row-fail'));
}
function buildIssuesSummary(issues, { maxGroups = 4, maxQpks = 5 } = {}) {
    const grouped = (issues || []).reduce((m, it) => {
        const k = it.kind || 'other';
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(it.quotePartKey);
        return m;
    }, new Map());

    const parts = [];
    let gIndex = 0;
    for (const [kind, qpks] of grouped) {
        if (gIndex++ >= maxGroups) { parts.push('…'); break; }
        const list = [...new Set(qpks)].slice(0, maxQpks).join(', ');
        parts.push(`${kind}: QPK ${list}${qpks.length > maxQpks ? ', …' : ''}`);
    }
    return parts.join(' • ') || 'See details';
}

