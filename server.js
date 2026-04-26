import 'dotenv/config';
import express from 'express';
import { GoogleAuth } from 'google-auth-library';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const tierScale = [
  'Completely ordinary',
  'Barely unusual',
  'Mildly unique',
  'Noticeably different',
  'Living differently',
  'Increasingly detached',
  'Quite out of touch',
  'Rarefied air',
  'Practically alien',
  'What planet are you from?'
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`Missing required env var: ${name}`);
    error.code = 'MISSING_ENV';
    error.envName = name;
    throw error;
  }
  return value;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseServiceAccount() {
  const raw = requiredEnv('GOOGLE_SERVICE_ACCOUNT');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT must be a stringified service account JSON object.');
  }
}

async function getSheetsAccessToken() {
  const auth = new GoogleAuth({
    credentials: parseServiceAccount(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error('Could not generate Google Sheets access token.');
  }
  return token.token;
}

async function sheetsRequest(path, options = {}) {
  const sheetId = requiredEnv('GOOGLE_SHEET_ID');
  const token = await getSheetsAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Google Sheets API error ${response.status}: ${message}`);
  }

  return response.json();
}

async function ensureSheetHeader() {
  const header = ['Timestamp', 'Email', 'Experience', 'Score', 'Tier', 'Tier Label', 'Roast'];
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
  const encodedRange = encodeURIComponent(`${sheetName}!A1:G1`);
  const existing = await sheetsRequest(`/values/${encodedRange}`);
  const firstRow = existing.values?.[0] || [];

  if (header.every((label, index) => firstRow[index] === label)) {
    return;
  }

  await sheetsRequest(`/values/${encodedRange}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [header] })
  });
}

function normalizeRating(raw) {
  const score = Math.min(100, Math.max(1, Number.parseInt(raw.score, 10) || 1));
  const tier = Math.min(10, Math.max(1, Number.parseInt(raw.tier, 10) || Math.ceil(score / 10)));
  return {
    score,
    tier,
    tierLabel: String(raw.tierLabel || tierScale[tier - 1]),
    roast: String(raw.roast || 'Somehow, this is both specific and suspicious.')
  };
}

app.post('/api/rate', async (req, res) => {
  try {
    const experience = String(req.body.experience || '').trim();
    if (experience.length < 8) {
      return res.status(400).json({ error: 'Tell us a little more before we judge it.' });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requiredEnv('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are an unrelatability rater. Return only valid JSON.'
          },
          {
            role: 'user',
            content: `Rate this experience for unrelatability: "${experience}"\n\nReturn JSON with:\n- score: integer 1-100\n- tier: integer 1-10\n- tierLabel: string\n- roast: one funny sentence\n\nTier scale (10-point increments):\n1=Completely ordinary (1-10)\n2=Barely unusual (11-20)\n3=Mildly unique (21-30)\n4=Noticeably different (31-40)\n5=Living differently (41-50)\n6=Increasingly detached (51-60)\n7=Quite out of touch (61-70)\n8=Rarefied air (71-80)\n9=Practically alien (81-90)\n10=What planet are you from? (91-100)`
          }
        ]
      })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${message}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI response did not include a rating payload.');
    }

    res.json(normalizeRating(JSON.parse(content)));
  } catch (error) {
    console.error(error);
    if (error.code === 'MISSING_ENV') {
      return res.status(500).json({ error: `${error.envName} is not configured. Add it to .env and restart the server.` });
    }
    res.status(500).json({ error: 'The rater lost the plot. Try again in a minute.' });
  }
});

app.post('/api/submit', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const experience = String(req.body.experience || '').trim();
    const rating = normalizeRating(req.body.rating || {});

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (experience.length < 8) {
      return res.status(400).json({ error: 'Experience is too short to save.' });
    }

    await ensureSheetHeader();

    const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
    const encodedRange = encodeURIComponent(`${sheetName}!A1:G1`);
    await sheetsRequest(`/values/${encodedRange}:append?valueInputOption=RAW`, {
      method: 'POST',
      body: JSON.stringify({
        values: [[
          new Date().toISOString(),
          email,
          experience,
          rating.score,
          rating.tier,
          rating.tierLabel,
          rating.roast
        ]]
      })
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    if (error.code === 'MISSING_ENV') {
      return res.status(500).json({ error: `${error.envName} is not configured. Add it to .env and restart the server.` });
    }
    res.status(500).json({ error: 'Rated, but the Google Sheet save failed.' });
  }
});

app.listen(port, () => {
  console.log(`Unrelatability Rater running at http://localhost:${port}`);
});
