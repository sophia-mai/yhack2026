# Prophis

Prophis is a patient-context intelligence tool for public health analysis. It turns fragmented patient history into a readable timeline, connects that case to county-level health patterns, and highlights where earlier preventive action or follow-up could have changed the trajectory.

The current app combines:

- an individual patient timeline
- county-level context from County Health Rankings data
- cohort/context signals such as diabetes similarity and health equity context
- a retrospective prevention review that calls out missed opportunities for earlier action

## Run locally

### 1. Install dependencies

From the repository root:

```bash
npm run install:all
```

### 2. Configure backend environment

Create a local backend env file from the template:

```bash
cp backend/.env.example backend/.env
```

On Windows PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
```

Then edit `backend/.env` and set at least one Lava auth token:

```env
LAVA_SECRET_KEY=your_real_lava_secret_key
```

Or:

```env
LAVA_FORWARD_TOKEN=your_real_lava_forward_token
```

Optional model overrides:

```env
LAVA_MODEL=openai/gpt-4o-mini
LAVA_MODEL_FAST=openai/gpt-4o-mini
LAVA_MODEL_SUMMARY=openai/gpt-4o-mini
LAVA_MODEL_DEEP=openai/gpt-4o-mini
```

### 3. Start frontend + backend

From the repository root:

```bash
npm run dev
```

Frontend: `http://localhost:5173`

Backend health check: `http://localhost:3001/api/health`

## Notes

- Use `npm` for this repository.
- The frontend is a Vite React app in `frontend/`.
- The backend is an Express API in `backend/`.
- County health data and intervention definitions are stored locally under `frontend/public/data/`.
- AI routes require either `LAVA_SECRET_KEY` or `LAVA_FORWARD_TOKEN` in `backend/.env`.
