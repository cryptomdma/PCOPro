# UI Sitemap (Mobile + Desktop)

## Mobile (phone/tablet)
- **/login** → minimal login.
- **/inventory** → card list with search, filters (category, reorder flag), scan shortcut.
- **/inventory/:id** → product detail (on-hand, units, QR scan to add), reorder flag, quick issue/request button.
- **/incoming** → receipts list; FAB to create draft.
  - `/incoming/:id` → staged receipt lines (scan/search, backorder capture), post button.
- **/checkout** → tabs: Requests, My Ready, My History.
  - `/checkout/request/new` → quick add lines by scan/voice/manual; sticky date.
  - `/checkout/:id` → status + lines; finalize if allowed.
- **/count** → cycle count quick mode (scan-first), reason code picker.
- **/notifications** → inbox, mark read.
- **/offline-queue** → pending actions list with retry/clear.

## Desktop
- **/dashboard** → KPIs, days of supply, recent deviations.
- **/inventory** → table with column chooser, export CSV, print QR labels (bulk).
  - `/inventory/:id` → detail with QR preview/download, pack sizes, reorder policy, transactions feed, print label.
- **/receiving** → manage receipts, edit, post.
- **/checkout/requests** → review/approve/ready/issue; batch finalize.
- **/counts** → cycle count and adjustments with filters.
- **/analytics** → pivot UI (UsageByMonth/Product), charts, CSV export, printable reports.
- **/reorder** → recommendations, email/webhook send, approvals history.
- **/settings** → users/roles, SMTP config, technician self-checkout toggle, QR prefix.
