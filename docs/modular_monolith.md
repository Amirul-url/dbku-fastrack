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

## Next Safe Steps

1. Extract application workflow permission checks to `applications.services.workflow`.
2. Extract account payload/auth helpers to `accounts.services.identity`.
3. Split the large notification service into smaller files by channel and event group.

Avoid changing database ownership, URL paths, or deployment shape until the module boundaries are stable.
