// Pure, testable logic for QT10's customer-driven catalog flow
export function makeCustomerFlow({ buildPayload, onResult }) {
    // returns a function you call with the new customerNo
    return async function run(customerNo, deps) {
        if (!customerNo) return;
        const payload = buildPayload({ customerNo });
        // no network here — just compute the payload and hand it to the adapter
        await onResult({ kind: 'payload', payload, deps });
    };
}
