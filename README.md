# yhack2026 project?

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

On Windows PowerShell, you can use:

```powershell
Copy-Item backend/.env.example backend/.env
```

Then edit `backend/.env` and set:

```env
OPENAI_API_KEY=your_real_openai_api_key
```

`OPENAI_MODEL` is optional and defaults to `gpt-4.5-preview`.

### 3. Start frontend + backend

From the repository root:

```bash
npm run dev
```

Frontend: `http://localhost:5173`

Backend health check: `http://localhost:3001/api/health`

## Notes

- Use `npm` for this repository (it includes `package-lock.json`).
- AI routes require `OPENAI_API_KEY` in `backend/.env`.
