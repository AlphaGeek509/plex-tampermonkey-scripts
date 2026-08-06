# Tampermonkey Exception Request — Usage Documentation

**Prepared:** 2026-08-04
**System:** Plex ERP (QuoteWizard / Sales & CRM / Scheduling)
**Repository:** https://github.com/AlphaGeek509/plex-tampermonkey-scripts — **public repository**, internal-use scripts. The source contains no credentials, API keys, or company data; it is automation over Plex's own UI and documented Data Source API. A GitHub Pages install page is published from this repository at https://alphageek509.github.io/plex-tampermonkey-scripts/, which links to the released script builds.

This document answers the specific questions required to evaluate the Tampermonkey browser-extension exception request for the Lyn-Tron Plex quoting and scheduling workflow.

---

## 1. All Tampermonkey scripts currently in use

| ID | Script | Status |
|---|---|---|
| QT05 | Customer Contact Add | Active |
| QT10 | Customer Catalog Get | Active |
| QT20 | Part Stock Level Get | Active |
| QT30 | Catalog Pricing Apply | Active |
| QT35 | Attachments Get (doc/attachment count) | Active |
| QT50 | Quote Validation | Active |

Plus five **shared libraries** that every script above depends on (not independently useful, but part of the same install/update footprint):

- `lt-plex-tm-utils` — DOM/Knockout utilities, Plex DataSource (DS) API wrapper
- `lt-plex-auth` — stores/attaches the Plex API credential used for DS calls
- `lt-core` — HTTP/toast/hub UI facade, quote-context helpers
- `lt-data-core` — local per-tab/per-quote draft-data storage
- `lt-ui-hub` — shared toolbar ("Hub Bar") UI rendered into the Plex page

---

## 2. Business purpose for each script

| Script | Business purpose |
|---|---|
| **QT05** | Speeds up creating a new Plex Contact record for the customer on a quote, avoiding a manual multi-click navigation to the Contact form. |
| **QT10** | Auto-populates the correct sales catalog for a quote based on the selected customer, removing a manual lookup step and reducing quotes built against the wrong catalog/pricing structure. |
| **QT20** | Lets quoting staff check on-hand stock for a part directly from the Quote Part Detail screen, and enforces a pricing-entry lockout (hides/disables Unit Price and Markup fields) as a company pricing-control policy. |
| **QT30** | Automates applying customer/catalog breakpoint pricing to quote lines and cleans up zero-quantity price rows, reducing manual pricing entry errors. |
| **QT35** | Surfaces the count of attachments (drawings, specs, etc.) tied to a quote directly in the quoting UI so staff know supporting documents are present before quoting/releasing. |
| **QT50** | Runs configurable business-rule validation across quote lines (e.g., minimum/maximum unit price, zero lead time) before a quote is finalized, and can auto-assign an internal Lyn-Tron part number for parts still in "Quote" status. |

---

## 3. Users who require Tampermonkey access

Access is tied to job function, not individual named accounts:

- **Sales / Quoting team** — users who build and price quotes in Plex QuoteWizard need QT05, QT10, QT20, QT30, QT35, QT50.

*(Requestor to confirm the specific named users/roles/AD groups that need the Chrome/Edge Tampermonkey extension enabled — this is organizational information not derivable from the code and should be filled in before submission.)*

---

## 4. Plex pages/URLs where each script runs

All scripts are restricted via Tampermonkey `@match` rules to specific Plex pages on the company's own Plex instance (production and test/sandbox tenants only — no other domains):

| Script | Runs on |
|---|---|
| QT05, QT10, QT20, QT30, QT35, QT50 | `https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*` and `https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*` (both `QuoteWizard` and legacy `QuoteWizard` case-variant URLs) |
| Shared libraries | Broader match (`https://*.on.plex.com/*`, `https://*.plex.com/*`) since they're loaded as dependencies on any Plex page, but they take no action unless one of the scripts above is also active on that page. |

None of the scripts run on any non-Plex website.

---

## 5. What each script reads, writes, hides, validates, or auto-fills

| Script | Reads | Writes / Changes | Hides / Disables | Validates |
|---|---|---|---|---|
| **QT05** | Customer number from the Quote Wizard view-model | Nothing in Plex — only opens a new browser tab to the existing Plex "Add Contact" form | — | — |
| **QT10** | Customer number (on change/blur) | Writes `Catalog Key` / `Catalog Code` onto the quote and updates the on-page catalog dropdown | — | — |
| **QT20** | Part number from the Quote Part Detail modal | Appends a stock-level note (e.g., "Stock: N pcs") into the part's Notes field | Hides/disables the Unit Price, % Markup, and $ Markup columns in that modal (pricing-control policy, not a data change) | — |
| **QT30** | Quote's catalog key, per-part breakpoint pricing | Writes calculated unit price onto quote lines; deletes zero-quantity price rows via Plex's own price-delete action | — | — |
| **QT35** | Attachment records linked to the quote | Writes the attachment count into a UI badge / stored quote-header value | — | — |
| **QT50** | Quote part-grid data (price, lead time, part status) | Can auto-generate/assign an internal Lyn-Tron part number for parts in "Quote" status (a real Plex write) | — | Flags rows with unit price outside a configured min/max, and rows with zero lead time; shows results in an on-page report (exportable to CSV) |

No script reads, displays, or transmits anything outside the normal scope of the quote or scheduling record the user already has open and is authorized to view in Plex.

---

## 6. Plex APIs, data sources, API keys, credentials, or service accounts used

- **Two separate accounts per user — the privileged one is never stored.** Each user has two distinct Plex accounts: their normal **interactive/UX account** for signing into the Plex browser UI, and a separate **Data Source (DS) API account** used only for datasource calls. The scripts never read, handle, or store the interactive account's credentials — those stay entirely within Plex's own sign-in. Only the DS account credential is stored, and that account's access is **severely limited** to the specific datasources the scripts need.
- **Plex DataSource (DS) API** — all data lookups/writes go through Plex's own `/api/datasources/{id}/execute` REST endpoint, same-origin to the Plex site. These calls authenticate with the separate DS account credential described above, not with the user's browser session. DS numbers used: **319, 22696, 172, 3156, 4809, 11713, 13509**, plus one native Plex form endpoint (`POST /SalesAndCRM/QuotePart/DeleteQuotePrice`).
- **No shared or service accounts.** Every user has their own separate, dedicated DS API credential. Access is provisioned per user through Plex's own **Web Service Access by User Account** admin page, and is scoped to only the specific datasources each user's scripts actually need — not a broad or standing grant. Provisioning and access can be reviewed/audited at any time by anyone holding the Plex **Security Auditor** role, so there is an existing, native Plex control and audit trail governing what each credential can reach.
- **Basic authentication is mandated by Plex, not chosen by us.** Plex's Data Source API documentation (*Integration Technologies / Data Source API / Creating an API request*) specifies `Authorization: Basic {encodedCredentials}` as **required**, encoded as `base64(utf8(username:password))`. Plex offers no API-key, bearer-token, OAuth, or session-cookie alternative for this API. Because Basic auth is reversible by design and the header must be rebuilt on every call, the credential has to be recoverable in plaintext at request time. This rules out encryption at rest (the decryption key would have to sit beside the ciphertext in the same browser profile — obfuscation, not protection), hashing (the plaintext is what goes on the wire), and short-lived tokens (Plex provides no token exchange here). **The only controls that genuinely exist are where the credential is stored and how long it persists — and both are now applied.**
- **Credential handling**: A shared helper (`lt-plex-auth`) prompts the user once to enter their DS account credentials via a Tampermonkey settings menu. The credential is stored **only in Tampermonkey's own extension-isolated storage** — it is never written to the page's `localStorage` or any other page-readable location. Because each of the 6 scripts runs in its own Tampermonkey storage sandbox, the helper instances discover each other on the page and provision each other's storage directly, preserving one-time entry without a shared page-readable copy. Stored credentials **expire after 90 days**, after which the user is re-prompted. There is no hardcoded API key, password, or service-account credential anywhere in the script source — everything is supplied by the end user at runtime and scoped to that user's own least-privilege DS access.
- **Residual consideration — transient, not persistent**: the cross-script handshake passes the credential through the page's JavaScript context at the moment of sharing, so it is not literally invisible to a script already running in the Plex page. This is a meaningful reduction rather than an elimination: previously a persistent copy sat in `localStorage`, readable at any time by anything in the page with no timing requirement; now any observer must already be present and actively listening during that moment. The design is strictly harder to exploit and never easier. The remaining exposure is also bounded by the account model above — the worst case is disclosure of a narrowly-scoped, individually-issued, independently-revocable DS credential, **not** account takeover, since the interactive account is never involved.

---

## 7. Where scripts are hosted and how updates are managed

- **Current hosting**: Scripts are built and published from the `plex-tampermonkey-scripts` GitHub repository and served to installed browsers via the **jsDelivr CDN**, which mirrors the GitHub repo's `wwwroot/` build output.
- **Update mechanism**: Each installed script's Tampermonkey `@updateURL` points at the CDN URL for the `master` branch, so it always resolves to whatever is currently released. Tampermonkey checks for updates automatically (roughly every ~6 hours) and applies them without requiring the end user to take any action.
- **Release process**: A single internal developer builds and versions scripts (CalVer `YYYY.MM.DD.N`) using feature/hotfix branches off `develop`; once `develop` has been tested, it's merged to `master`, tagged on GitHub, and the jsDelivr cache is purged so the update takes effect promptly. There is no external vendor or third party involved in hosting or code changes — the code, build pipeline, and release process are entirely internal. Pinning installed clients to a specific tagged version instead of `master`-latest was evaluated but found impractical for auto-update at the user level (it would require manually re-pinning every client on each release), so the "always resolves to latest" model is used deliberately.
- **Proposed change — internal hosting**: we are open to moving script delivery off the public jsDelivr CDN to an internally hosted location, removing the dependency on a public third-party CDN for code delivery. One option raised is the company's common OneDrive, which all users already have mapped. This needs a technical feasibility check before being finalized: Tampermonkey's `@require`/`@updateURL` need a stable URL that serves the raw JS file directly (correct content-type, no login redirect or viewer-page wrapper), and OneDrive share links can behave inconsistently for this use case, and a file's underlying link can change on replace rather than in-place edit. An internal web-servable location (e.g., an IIS/SharePoint document library configured for anonymous-internal direct download, or a small internal static file host similar to the existing local dev server) may be a more reliable fit; final choice pending confirmation with IT on what's supported.
- Local development uses a throwaway `localhost:5000` static file server for testing before release; this is never used by end users, only by the developer.

---

## 8. Whether any data is sent outside of Plex

**No.** A full review of all script source code found no network calls to any non-Plex destination. All data lookups/writes go to the company's own Plex instance (`lyntron.on.plex.com` / `lyntron.test.on.plex.com`), using the signed-in user's own session/credential. The only thing that leaves the Plex domain is the script **code** itself being downloaded from the jsDelivr CDN when Tampermonkey checks for updates (code delivery, not quote/customer data) — and that dependency is expected to move to internal hosting (see Section 7).

No customer, pricing, part, or quote data is transmitted to any third-party server, analytics service, or AI/API provider.

---

## 9. Process if Tampermonkey were unavailable

Every script is a convenience/automation layer on top of steps that already exist natively in Plex. If Tampermonkey were disabled, users would fall back to the manual Plex workflow:

| Script | Manual fallback |
|---|---|
| QT05 | Navigate manually to Communication → Contact → Add Contact and enter the customer number by hand. |
| QT10 | Look up the customer's assigned catalog manually and select it in the Quote Catalog dropdown. |
| QT20 | Check stock levels in the standard Plex inventory/part screen and manually note it on the quote if needed. |
| QT30 | Manually apply customer/catalog pricing to each quote line and manually remove zero-quantity price rows. |
| QT35 | Manually open the Attachments panel on the quote to see what's attached. |
| QT50 | Manually review quote lines for pricing/lead-time issues before finalizing; manually assign internal part numbers for "Quote" status parts. |

None of the scripts perform an action that isn't otherwise possible directly in Plex — they only remove manual steps, reduce data-entry errors, and add an extra guardrail (QT50's validation) that doesn't exist out-of-the-box in Plex.

---

## 10. Known risks, limitations, and dependencies

- **Credential storage (addressed)**: Each user's individually issued, least-privilege DS credential is stored **only** in Tampermonkey's extension-isolated storage, with a 90-day expiry after which the user must re-enter it. The former plain-`localStorage` mirror has been removed, and any existing copy is deleted automatically the first time a user loads the updated scripts — no user action required. Because Plex mandates reversible Basic authentication (Section 6), the stored value is effectively plaintext and cannot be encrypted or hashed in any way that would survive scrutiny; what bounds the impact is the account separation and least-privilege datasource scoping enforced natively in Plex, not the storage format. The residual exposure is the brief in-page moment when the 6 scripts share the credential with each other — transient and requiring an attacker already active in the page, versus the previous always-readable persistent copy.
- **Interactive account never exposed**: The credential stored in the browser belongs to a DS-API-only account with severely limited datasource access. The user's interactive Plex sign-in credentials are never read or stored by any script, so a browser-side compromise cannot escalate to the user's normal Plex access.
- **Solo-developer / no independent review**: One developer builds, tests, and releases all scripts, using feature/hotfix branches off `develop` merged to `master` once tested. This is a reasonable workflow for the team size, but it means there is currently no second reviewer/approver before code that runs inside a live Plex session is released and auto-deployed to all users. Worth deciding explicitly whether that's an acceptable risk as-is, or whether a lightweight peer/IT review step should be added before merges to `master`.
- **Auto-update / change control**: Scripts auto-update from `master` on a ~6-hour cycle with no per-user approval step before a new version takes effect. Pinning specific versions per client was considered and rejected as impractical to maintain at the user level, so "latest from `master`" is used deliberately — this means a bad release reaches all users within hours, with no staged rollout, so release testing on `develop` before merge is the primary safeguard.
- **Third-party CDN dependency (current state)**: Script code is currently delivered via the public jsDelivr CDN. If jsDelivr is unreachable, blocked, or compromised, script loading/updates would fail or be at risk until resolved. This is expected to be addressed by moving to internal hosting (Section 7), pending confirmation of a technically workable internal delivery location.
- **Dependency on Plex UI stability**: All scripts read/write Plex's Knockout view-models and DOM structure directly. A Plex UI/version update could silently break a script (wrong field found, wrong button matched) until the script is updated to match.
- **No sandboxing beyond Tampermonkey's own**: Scripts run with the full page/DOM access Tampermonkey grants, scoped only by the `@match` URL patterns listed in Section 4 — they cannot run on non-Plex sites, but on a matched Plex page they have the same DOM access as the page itself.
- **No hardcoded secrets found**: A full source review found no embedded API keys, passwords, or service-account credentials in any script — every credential is individually issued to the end user through Plex's own access controls, at runtime.

---

*This document was generated from a direct review of the script source code, build configuration, and release process in the repository as of 2026-08-04. Sections 3 (named users/roles) and any organizational sign-off fields should be completed by the requestor before submission.*
