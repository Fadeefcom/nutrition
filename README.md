# Fitness Diary

Full-stack MVP fitness diary built with React, TypeScript, Vite, Tailwind CSS, Framer Motion, Recharts, Azure Functions C# isolated worker, and Azure Blob Storage JSON files.

## Project Structure

```text
backend/    Azure Functions API and Blob JSON repository
frontend/   React + Vite mobile-first web app
seed/       Starter JSON data matching the blob layout
```

## Local Prerequisites

- Node.js 20+
- .NET SDK 8+
- Azure Functions Core Tools v4
- Azurite or a real Azure Storage account

## Backend Setup

```powershell
cd backend/src
copy local.settings.json.example local.settings.json
func start
```

Development uses `StorageProvider=LocalFile` and writes JSON to `backend/src/.local-data/fitness-diary`, so the API can run without Azure Blob Storage while you build locally.

Production uses `StorageProvider=BlobStorage`. In Azure, set `AzureWebJobsStorage` or `BlobStorageConnectionString` to a real storage connection string. The app stores JSON in one container named `fitness-diary`.

Set `DiaryPassword` in `local.settings.json` to enable MVP password protection. Leave it blank for open local development.

Config files:

- `backend/src/appsettings.Development.json` - local JSON file storage
- `backend/src/appsettings.Production.json` - Azure Blob Storage
- `backend/src/local.settings.Development.json.example` - local Functions settings
- `backend/src/local.settings.Production.json.example` - production Functions settings template

## Frontend Setup

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:7071` by default. If your backend is elsewhere, set `VITE_API_BASE_URL`.

## Blob Layout

```text
fitness-diary/
  profile.json
  settings.json
  products.json
  nutrition/YYYY-MM-DD.json
  workouts/YYYY-MM-DD.json
  body-metrics/YYYY-MM-DD.json
```

Exercise targets live inside `settings.json` so the requested storage layout stays compact while the API still exposes `/api/exercise-targets`.

## API Highlights

- Profile/settings CRUD
- Product CRUD, local search, barcode lookup, Open Food Facts import
- Daily nutrition, workouts, body metrics
- Exercise targets
- Daily completion status and range heatmap data
- Progress summaries and exercise history

## Deployment Notes

1. Create an Azure Storage account and Blob container access through the Functions app setting `AzureWebJobsStorage`.
2. Deploy `backend` as an Azure Functions C# isolated worker app.
3. Deploy `frontend/dist` to Azure Static Web Apps, Azure Storage static website hosting, or any static host.
4. Set `VITE_API_BASE_URL` during frontend build to the deployed Functions `/api` base URL.
5. Use `DiaryPassword` for MVP protection. The API is organized behind a single auth middleware so it can be replaced with Azure Entra ID later.
