# TajerGrow — production onboarding review pack

Prepared 2026-11-05. This file is a review draft, not proof of Meta approval.
No live Meta app dashboard was available during preparation. The legal entity,
app ID, Business Verification, Access Verification, permissions, config ID,
billing, app mode and real-number delivery remain **unverified**.

## Launch gates and owner evidence

| Gate | Evidence required before enabling public signup |
| --- | --- |
| Business portfolio | Owner confirms legal entity, domain and portfolio; Meta shows verification result |
| App Review | Meta grants the permissions required by the configured flow, including WhatsApp management and messaging; a template APPROVED result is separate |
| Tech Provider / Access Verification | Complete the steps actually requested by this app dashboard; record result |
| Facebook Login for Business | Current Embedded Signup configuration, actual app ID/config ID and allowed production domains; confirm supported token lifetime |
| Webhooks | Valid callback challenge, subscribed messages field and WABA subscription; real inbound response processed |
| Production credentials | Replace owner temporary token with an appropriate production credential; check actual expiry; do not promise a token can never be revoked |
| Customer billing | Merchant adds their Meta payment method where required; do not imply TajerGrow has a Meta credit line |
| Per-merchant activation | Register supported number flow, subscribe WABA, prepare template and wait for approval; record consent before first outreach |
| AI setup | Merchant currently needs their own configured AI provider key; no prepaid AI credit wallet is implemented |
| Existing Business app numbers | Coexistence/migration is not production-validated; do not ask merchants to delete their app/account or claim simultaneous app/API support |
| Pilot | Two or three authorized merchants, real-number scenarios below, tenant isolation and recoverability checked |

Keep `META_EMBEDDED_SIGNUP_ENABLED=false` until these gates are verified.
Enabling this flag is an operator decision; the code does not detect App Review.
Existing onboarding also accepts a Business App completion event but always
registers the number. That path needs a documented coexistence implementation
and separate real test before it is advertised or enabled for such numbers.

## Public URLs to review in the Meta dashboard

Use the real canonical origin consistently (check www versus apex in production):

- Privacy policy: https://www.tajergrow.com/privacy
- Terms: https://www.tajergrow.com/terms
- Data deletion instructions: https://www.tajergrow.com/data-deletion
- Webhook: https://www.tajergrow.com/api/meta/whatsapp/webhook

The deletion page provides instructions, **not an automatic Meta deletion
callback**. If the dashboard requires a callback rather than instructions,
implement and validate the signed request and confirmation-status flow first.
The support process must actually handle requests; no automatic erasure of
orders/conversations or backup retention policy is claimed by this change.
Review legal identity, retention and provider disclosures with the owner before
submitting the app. No legal registration or compliance certification is inferred.

## App Review description draft

TajerGrow is an order management service for merchants. An authenticated store
owner connects their own WhatsApp Business Account through Meta's Embedded Signup.
The application checks that the authorized WABA contains the selected phone and
binds that phone exclusively to the owner's store. Tokens are exchanged on the
server and stored encrypted. The browser receives no saved access token.

WhatsApp business management access is used to verify the selected account/phone,
subscribe the account to the application's webhooks, and create or inspect the
merchant's order confirmation template. WhatsApp business messaging access is
used to send consented order confirmations, receive customer replies through
signed webhooks, and respond with order/product information and media during
an open customer service window. The owner can disconnect the integration.

Use this text only for behavior demonstrated in the recording. Include any
additional permission solely when required by the actual configured flow and
explain its concrete use; do not request unrelated permissions.

## Recording / reviewer walkthrough

1. Use a dedicated authorized test store without unrelated customer records.
   Show login and the official WhatsApp connection entry point.
2. Open Meta onboarding from a user click. Show account/number selection and the
   permissions screen; keep credentials, PINs and tokens out of the recording.
3. Complete the flow. Show the connected merchant number and connection check.
4. Prepare the confirmation template and show its actual approval result.
5. Create a consented test order and show the eight correct order parameters and
   confirm/edit/cancel buttons arriving on the authorized test phone.
6. Reply, show the signed inbound webhook reflected in the conversation, product
   media for the correct product, and an explicit confirmed city/quantity edit.
7. Show separate cancel and confirmation cases. No invented price, delivery date
   or offer; no stock deducted merely because the AI confirms an order.
8. Show disconnect, stopped sends and the data deletion instructions page.
9. Supply reviewer test access through Meta's protected submission interface;
   never commit passwords, tokens, PINs or an app secret to this repository.

## Acceptance record (fill with real observations)

| Scenario | Expected | Result |
| --- | --- | --- |
| Website order outside service window | Approved template only; product media queued until reply | Not run live |
| Customer reply | Opens that phone/store window; correct product content sent once | Not run live |
| Agadir → Taroudant | Ask confirmation, persist only after agreement | Not run live |
| Quantity 2/3 and explicit offer | Confirm correct quantity/total; stock checked; exact offer only | Not run live |
| Cancellation | No pending automatic product content sent | Not run live |
| Duplicate webhook | No duplicate business mutation/send | Not run live |
| Different store | Cannot use another store's phone, media or conversation | Not run live |
| Expired/revoked credential | Connection diagnostic requests reconnection; no Green fallback | Not run live |
| Meta unavailable | Diagnostic retry message; no token replacement demanded | Not run live |
| Closed 24h service window | Explain messaging restriction, do not call it a disconnected account | Not run live |
| Disconnect | Credential cleared and official sends disabled | Not run live |

## Costs / rollout decision

Recommended initial scope: merchants pay Meta on their own accounts; current AI
keys remain merchant-managed; TajerGrow hosting remains the platform owner's
cost. Exact Meta message charges depend on destination/category and the current
rate card. No new fee, subscription tier or paid AI wallet is activated here.
Pilot first, then enable public signup only after the above evidence is recorded.

References to verify when configuring the actual app:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation
- https://www.postman.com/meta/whatsapp-business-platform/request/i1mz7w8/debug-token
- https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- https://whatsappbusiness.com/products/platform-pricing/
