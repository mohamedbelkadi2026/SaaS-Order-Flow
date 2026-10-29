# TajerGrow — official WhatsApp pilot and customer onboarding

## Current implementation and rollout boundary

The Meta transport and owner connection panel are implemented independently of
Green API. No merchant is switched automatically. A Meta connection selects the
Meta channel for that store; disconnecting it fails closed and does not silently
send through Green. The owner can explicitly choose Green again.

A real Meta app, approved assets, credentials, business verification and App Review
cannot be produced by application code. This repository does not assert that Meta
has approved TajerGrow, that a number is registered, or that a real test was delivered.
The public Embedded Signup button remains disabled until its server flag and
configuration are deliberately enabled after review.

## Meta app and pilot

1. In Meta for Developers, create/select the **TajerGrow** business app under the
   correct business portfolio. Enable WhatsApp Cloud API. Keep it in development
   mode for the initial authorized test recipients.
2. In WhatsApp API setup obtain the WABA ID, Phone Number ID and a test access
   token issued to this application. Add the owner's test recipient in Meta.
   Temporary test tokens expire; production needs the appropriate business token.
3. Configure these **server-only** Railway variables:

   | Variable | Purpose |
   | --- | --- |
   | `META_APP_ID` | TajerGrow application ID |
   | `META_APP_SECRET` | Application secret, used to verify every webhook signature |
   | `META_WEBHOOK_VERIFY_TOKEN` | A random secret used for the webhook subscription challenge |
   | `META_GRAPH_API_VERSION` | Supported pinned Graph API version; default `v24.0` |
   | `META_WHATSAPP_PILOT_STORE_IDS` | Comma separated TajerGrow store IDs allowed to save pilot credentials |
   | `ENCRYPTION_KEY` | Stable secret for token encryption (existing `SESSION_SECRET` supported) |
   | `PUBLIC_APP_URL` | Canonical HTTPS application origin, e.g. `https://www.tajergrow.com` |
   | `META_EMBEDDED_SIGNUP_ENABLED` | Keep `false` until public onboarding is reviewed and ready |
   | `META_EMBEDDED_SIGNUP_CONFIG_ID` | Meta Facebook Login for Business configuration ID for Embedded Signup v4 |

   Never put the app secret or access tokens in `VITE_` variables, source files,
   browser console, screenshots or chat. Configure secrets directly in Railway;
   enter the merchant test token in the password field of TajerGrow's owner panel.
   Preserve the encryption key across deployments.
4. Set the app's WhatsApp webhook callback to
   `https://www.tajergrow.com/api/meta/whatsapp/webhook` (use the actual canonical
   origin). Supply the verify token above. Subscribe the `messages` webhook field.
   Connecting a WABA also subscribes the app via its `subscribed_apps` endpoint.
5. In **Automation & AI → Connexion WhatsApp → Connexion pilote**, enter the WABA,
   Phone Number ID and token. Save. The server validates app ownership, WABA phone
   membership and exclusive TajerGrow tenant binding; it encrypts the saved token.
6. Click **Préparer / vérifier le modèle**. The submitted Arabic utility template
   is `tajergrow_order_confirmation`, language `ar`, with eight body parameters
   (store, customer, phone, city, address, product, quantity, total) and three quick
   replies: confirm, edit and cancel. Wait for actual `APPROVED` status. Meta
   decides approval and category. An unapproved template never falls back to an
   unrestricted first message.
7. Tick the explicit recipient consent in the test panel and send an authorized
   test. This stores the pilot recipient's permission for utility confirmation.
   Test a website order with that same phone and the owner's existing AI scope /
   product settings. For real customer rollout, capture and record explicit
   WhatsApp consent from checkout before first outreach. No consent is inferred
   solely from possession of a phone number.

## Pilot acceptance sequence

- Approved template reaches the allowed test recipient with all order fields.
- Reply with confirmation: original order becomes confirmed and uses the existing
  exact friendly confirmation text; test edit and cancel on separate orders.
- Start a conversation from the test phone, then test plain text and the three
  interactive buttons inside the 24-hour service window.
- Use real uploaded JPG/PNG, MP3/AAC/M4A/OGG Opus/AMR and MP4 product files. Uploads
  are sent directly to Meta; another store's private WhatsApp uploads are rejected.
  Image maximum 5 MB, audio/video 16 MB. A URL must match its selected test type.
- A first template outside the service window queues product text and all media.
  They are sent after the customer replies and the service window is open. A
  cancellation button cancels pending content. Product queues are deduplicated.
- Observe `accepted` → `sent` → `delivered` → `read` in the owner delivery journal.
  `accepted` is not proof of delivery. Failures show Meta's numeric error code.
  Read events depend on the recipient's settings and Meta emitting them.
- Repeat a signed webhook: the inbound message ID is stored once. A forged
  signature, wrong WABA/phone pair, another store's assets or a mismatched nonce
  must not mutate that account. A late `sent` event cannot downgrade `read`.

## Embedded Signup v4 and App Review

Create a Facebook Login for Business configuration using the current WhatsApp
Embedded Signup flow (v4). Configure the canonical app domain, SDK allowed domains
and exact HTTPS redirect settings in Meta. Request the permissions needed by the
reviewed flow, notably `whatsapp_business_management` and
`whatsapp_business_messaging`, and any additional Meta-required business permission.
Complete business verification, privacy policy/data deletion configuration and
App Review with a recording of actual onboarding and message handling. Do not
claim approval from setting an environment variable.

The UI waits for Meta's trusted-origin completion event and its authorization
code. The backend consumes a single-use ten-minute nonce bound to the logged-in
owner and store, exchanges the code server-side, validates that the token belongs
to the TajerGrow app and grants both WhatsApp scopes for the chosen WABA, verifies
phone membership, registers the number using the owner's six-digit PIN, subscribes
the app, then persists the encrypted merchant token. The owner must keep their PIN.
Public onboarding is enabled only after this exact flow has been verified against
Meta's real configuration and approved permissions.

Existing WhatsApp Business app numbers / coexistence and migration need the
corresponding Meta-approved onboarding configuration; they are not silently
migrated by this implementation. Pilot on Meta's test number first.

## Operational behavior

Every send records a tenant-local outgoing attempt before calling Meta. A timeout
or ambiguous response is marked `uncertain` and is not automatically retried.
Webhook status events are stored durably, including events arriving before the
HTTP acknowledgement is saved. A bounded worker reconciles monotonic statuses,
consumes deduplicated incoming text/buttons and flushes deferred product content.
Stale inbound processing leases become `uncertain` for manual diagnosis instead
of blindly replaying a potentially sent reply. No global merchant token fallback
exists. The worker stays idle until Meta server configuration is present.

Automated tests mock Meta transport and verify real database queries using PGlite;
these do not establish that a live phone received a message. Complete the pilot
acceptance sequence and record actual status events before enabling other stores.
