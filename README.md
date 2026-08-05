# ALiS - Advertisement License Application

ALiS is a web application for managing advertisement license applications, reviews, approvals, payments, and license issuance.

## Project Structure

- `backend/` - Django REST API
- `frontend/` - React/Vite frontend
- `docs/` - Supporting project documentation

## Local Development (Windows and Linux)

Prerequisites: Python 3.13 and Node.js 22.

### Backend

Run the backend from the `backend/` directory. The default local configuration uses
SQLite; configure PostgreSQL environment variables when required.

Windows PowerShell:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
.\scripts\start.ps1
```

Linux:

```sh
python3.13 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate --noinput
python manage.py runserver 0.0.0.0:8000
```

`backend/scripts/start.sh` is the Linux production entry point (Gunicorn). The
PowerShell script is intended for local Windows development and runs Django's
development server.

### Frontend

Run the following from the `frontend/` directory on either Windows or Linux:

```sh
npm install
npm run dev
```

The frontend is served at `http://localhost:5173` by default.

## Line Endings

The repository uses `.gitattributes` to keep shell and deployment files in LF
format, which prevents Linux startup errors after the repository is checked out
on Windows.

## Backend Fresh Reset

For a clean testing database reset, see:

```txt
fresh reset alis.txt
```

Use the reset steps only in a testing or staging environment. Do not run them on production data.

## Notes

- Do not commit real passwords, API keys, database URLs, or environment files.
- Create the first `superadmin` account from the backend terminal after deployment.
