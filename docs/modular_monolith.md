# ALiS Modular Monolith Direction

ALiS remains one Django backend deployment and one React frontend deployment. The goal is to make the backend modular before considering microservices.

## Current Shape

- `accounts`: users, authentication, managed accounts, login sessions.
- `applications`: application records, workflow endpoints, supporting documents.
- `notifications`: web/email/WhatsApp notifications and license renewal reminders.

These Django apps are modules inside the same backend process. They should communicate through explicit service functions instead of spreading domain logic across views.

## Module Boundaries

### Accounts
- Owns user profile and authentication logic.
- Exposes account payload and identity helpers through service functions.
- Should not directly know application workflow rules.

### Applications
- Owns application records, workflow state, activity log, and supporting documents.
- Exposes document operations through `applications.services.documents`.
- Should call notification services through explicit functions only.

### Notifications
- Owns notification delivery records and outbound channels.
- May read application data to compose messages, but workflow mutations should stay in `applications`.
- Exposes reusable formatting/recipient helpers from `notifications.formatting`.
- Exposes outbound delivery channel helpers from `notifications.channels`.

## Extracted Boundaries

`applications.services.documents` is the first service boundary. It owns:

- document upload/delete permission checks
- supporting document creation and lookup
- site image document selection
- file response construction
- physical file deletion

The existing API endpoints stay in `ApplicationViewSet`; views now delegate document-specific work to the service layer.

`applications.services.activity` owns:

- activity log creation
- activity actor naming
- workflow department detection for activity records
- activity visibility/scoping by user role
- rejection remark enrichment for activity output

Views and serializers now delegate activity-specific work to this service layer.

`applications.services.workflow` owns:

- applicant update permission checks
- staff workflow transition permission checks
- management support memo draft-save detection

`ApplicationViewSet` still orchestrates the HTTP update flow, but the workflow authorization rules now live in the application domain service layer.

`applications.services.summary` owns:

- applicant display-name and registered-name derivation
- applicant profile payload construction for application responses
- project location summary derivation
- latest display remark selection by workflow status
- application summary field synchronization from form data

Serializers still shape API responses, but application summary and profile derivation now live in the application domain service layer.

`accounts.services.identity` owns:

- MyKad/date-of-birth/gender inference
- user profile payload construction
- auth response payload construction
- name, MyKad, mobile, and address normalization helpers
- login session payload/duration helpers

Accounts views still orchestrate HTTP registration/login/profile flows, but identity formatting and payload construction now live in the account domain service layer.

`accounts.services.lookup` owns:

- email and phone identifier normalization
- MyKad/user lookup by normalized identifiers
- mobile-number variant matching
- login identifier lookup
- WhatsApp recipient formatting for account flows

`accounts.services.password_reset` owns:

- password reset OTP generation
- reset cache-key and channel normalization
- password reset user lookup by channel
- password reset message construction
- OTP delivery through notification services

Accounts views still orchestrate HTTP request/response and cache/token validation, but account lookup and OTP delivery helpers now live in account service modules.

`accounts.services.sessions` owns:

- login session timeout calculation
- login session expiry and close-time calculation
- closing open sessions on login/logout
- closing stale open sessions for account management views

Login/logout views still create the HTTP response and session records, but session lifecycle rules now live in the account service layer.

`accounts.services.management` owns:

- managed-account role normalization
- managed-account validation for required fields, email, password, and duplicates
- managed-account profile field mutation
- role-to-staff/superuser flag handling
- managed-account password updates

SuperAdmin views still orchestrate list/create/update/delete HTTP behavior, but account mutation rules now live in the account service layer.

`notifications.formatting` owns:

- email and phone normalization helpers
- WhatsApp phone joining
- HTML escaping for message bodies
- recipient/value deduplication
- nested form-data lookup and notification datetime formatting helpers
- license reminder date parsing and calendar-month arithmetic

Notification services still orchestrate event routing and delivery creation, but shared formatting helpers now live outside the large notification service file.

`notifications.channels` owns:

- email sender provider selection
- SMTP and Brevo email payload delivery
- WhatsApp provider selection
- webhook, Evolution API, and Meta WhatsApp payload delivery
- notification channel configuration checks and skip reasons
- test email redirection handling

`notifications.services` still exposes the same channel function names for compatibility, but the outbound delivery implementation now lives in the notification channel module.

## Next Safe Steps

1. Split notification event routing/message builders by application event group.
2. Split application list/query filtering into a dedicated query module if it keeps growing.
3. Extract reCAPTCHA verification into an account security service.

Avoid changing database ownership, URL paths, or deployment shape until the module boundaries are stable.
