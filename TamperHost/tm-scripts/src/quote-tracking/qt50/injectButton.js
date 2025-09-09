// Adds a “Validate Lines” button and wires it to the engine.
// Assumes your settings UI exports getSettings/onSettingsChange.

import { runValidation } from './engine';
import { getSettings, onSettingsChange } from './index';

const CFG = {
    ACTION_BAR_SEL: '#QuoteWizardSharedActionBar',
    NEXT_SEL: '#NextWizardPage',
    BUTTON_ID: 'lt-validate-lines'
};

export function mountValidationButton(TMUtils) {
    if (document.getElementById(CFG.BUTTON_ID)) return () => { };

    const nextBtn = document.querySelector(CFG.NEXT_SEL);
    const actionBar = document.querySelector(CFG.ACTION_BAR_SEL);

    const btn = document.createElement('button');
    btn.id = CFG.BUTTON_ID;
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-secondary';
    btn.textContent = 'Validate Lines';

    if (nextBtn && nextBtn.parentNode) {
        nextBtn.parentNode.insertBefore(btn, nextBtn);
    } else if (actionBar) {
        actionBar.appendChild(btn);
    } else {
        // fallback position if action bar isn't present yet
        Object.assign(btn.style, { position: 'fixed', bottom: '80px', left: '20px', zIndex: 100000 });
        document.body.appendChild(btn);
    }

    const offSettings = onSettingsChange?.(() => refreshLabel(btn));
    refreshLabel(btn);

    btn.addEventListener('click', async () => {
        const settings = getSettings();
        btn.disabled = true;
        const prior = btn.textContent;
        btn.textContent = 'Validating…';

        try {
            const { ok, issues } = await runValidation(TMUtils, settings);
            if (ok) {
                btn.classList.remove('btn-secondary', 'btn-danger');
                btn.classList.add('btn-success');
                btn.textContent = 'Valid ✓';
                TMUtils.toast?.('✅ Lines valid', 'success', 1800);
            } else {
                btn.classList.remove('btn-secondary', 'btn-success');
                btn.classList.add('btn-danger');
                btn.textContent = 'Fix Issues';
                TMUtils.toast?.('❌ Validation failed:\n' + issues.map(i => `• ${i.message}`).join('\n'), 'error', 6000);
                console.table?.(issues);
            }
        } catch (err) {
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-danger');
            btn.textContent = 'Error';
            TMUtils.toast?.(`Validation error: ${err?.message || err}`, 'error', 5000);
        } finally {
            btn.disabled = false;
            setTimeout(() => { btn.textContent = prior; refreshLabel(btn); }, 2500);
        }
    });

    return () => {
        offSettings?.();
        btn.remove();
    };
}

function refreshLabel(btn) {
    const s = getSettings();
    const parts = [];
    //if (s.requireResolvedPart) parts.push('Part');
    //if (s.forbidZeroPrice) parts.push('≠$0');
    //if (s.minUnitPrice != null) parts.push(`≥${s.minUnitPrice}`);
    if (s.maxUnitPrice != null) parts.push(`≤${s.maxUnitPrice}`);
    btn.title = `Rules: ${parts.join(', ') || 'none'}`;
}
