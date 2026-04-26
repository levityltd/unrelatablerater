# Unrelatability Rater

A single-page vanilla HTML/CSS/JS app for rating unrelatable moments with OpenAI and saving submissions to Google Sheets.

There are two deployment paths in this repo:

- `public/` + `server.js`: local Express version.
- `apps-script/`: free Google Apps Script web app version. This is the recommended no-cost hosted setup because the OpenAI key stays in Apps Script project properties and the sheet write runs inside Google.

## Free Google Apps Script Setup

1. Open [script.google.com](https://script.google.com/) and create a new project.
2. Add these files from `apps-script/` to the Apps Script project:
   - `Code.gs`
   - `Index.html`
   - `Styles.html`
   - `App.html`
3. In Apps Script, go to **Project Settings** and add script properties:
   - `OPENAI_API_KEY`: your OpenAI API key
   - `GOOGLE_SHEET_ID`: `1Cvkf9JfKAR-OnFlXYPC_ajOy_l-PDaYVw5IGYwvI1Vg`
   - `GOOGLE_SHEET_NAME`: `Sheet1`
4. Click **Deploy** -> **New deployment**.
5. Choose **Web app**.
6. Set:
   - **Execute as**: Me
   - **Who has access**: Anyone
7. Deploy, approve the requested permissions, and use the generated web app URL as the live app.

The Apps Script deployment does not need `GOOGLE_SERVICE_ACCOUNT`; it writes to the sheet as the Google account that owns/deploys the script.

## Local Express Setup

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
