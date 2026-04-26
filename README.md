# Unrelatability Rater

A single-page vanilla HTML/CSS/JS app with a minimal Express backend for OpenAI scoring and Google Sheets logging.

## Setup

1. Create a Google Cloud service account with access to Google Sheets API.
2. Create or choose a spreadsheet and share it with the service account `client_email`.
3. Copy `.env.example` to `.env` and fill in:
   - `OPENAI_API_KEY`
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_SHEET_NAME` if the tab is not named `Sheet1`
   - `GOOGLE_SERVICE_ACCOUNT` as the stringified service account JSON
4. Install dependencies:

```bash
npm install
```

5. Start the app:

```bash
npm start
```

Open `http://localhost:3000`.

## API

- `POST /api/rate` sends the experience to OpenAI and returns `{ score, tier, tierLabel, roast }`.
- `POST /api/submit` appends the completed rating to `Sheet1` with the header row:

```text
Timestamp | Email | Experience | Score | Tier | Tier Label | Roast
```

API keys and service account credentials are only read by `server.js` and are never exposed to browser code.
