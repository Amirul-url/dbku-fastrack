# ALiS - Advertisement License Application

ALiS is a web application for managing advertisement license applications, reviews, approvals, payments, and license issuance.

## Project Structure

- `backend/` - Django REST API
- `frontend/` - React/Vite frontend
- `docs/` - Supporting project documentation

## Backend Fresh Reset

For a clean testing database reset, see:

```txt
fresh reset alis.txt
```

Use the reset steps only in a testing or staging environment. Do not run them on production data.

## Notes

- Do not commit real passwords, API keys, database URLs, or environment files.
- Create the first `superadmin` account from the backend terminal after deployment.
