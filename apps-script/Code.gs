const TIER_SCALE = [
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

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Unrelatability Rater')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function rateAndSubmit(payload) {
  const email = String(payload.email || '').trim();
  const experience = String(payload.experience || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  if (experience.length < 8) {
    throw new Error('Tell us a little more before we judge it.');
  }

  const rating = rateExperience_(experience);
  appendSubmission_(email, experience, rating);
  return rating;
}

function rateExperience_(experience) {
  const apiKey = getRequiredProperty_('OPENAI_API_KEY');
  const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    muteHttpExceptions: true,
    payload: JSON.stringify({
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

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`OpenAI API error ${status}: ${body}`);
  }

  const data = JSON.parse(body);
  const content = data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  if (!content) {
    throw new Error('OpenAI response did not include a rating payload.');
  }

  return normalizeRating_(JSON.parse(content));
}

function appendSubmission_(email, experience, rating) {
  const sheetId = getRequiredProperty_('GOOGLE_SHEET_ID');
  const sheetName = PropertiesService.getScriptProperties().getProperty('GOOGLE_SHEET_NAME') || 'Sheet1';
  const spreadsheet = SpreadsheetApp.openById(sheetId);
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  const header = ['Timestamp', 'Email', 'Experience', 'Score', 'Tier', 'Tier Label', 'Roast'];

  const firstRow = sheet.getRange(1, 1, 1, header.length).getValues()[0];
  const hasHeader = header.every((label, index) => firstRow[index] === label);
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }

  sheet.appendRow([
    new Date(),
    email,
    experience,
    rating.score,
    rating.tier,
    rating.tierLabel,
    rating.roast
  ]);
}

function normalizeRating_(raw) {
  const score = Math.min(100, Math.max(1, parseInt(raw.score, 10) || 1));
  const tier = Math.min(10, Math.max(1, parseInt(raw.tier, 10) || Math.ceil(score / 10)));
  return {
    score,
    tier,
    tierLabel: String(raw.tierLabel || TIER_SCALE[tier - 1]),
    roast: String(raw.roast || 'Somehow, this is both specific and suspicious.')
  };
}

function getRequiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) {
    throw new Error(`${name} is not configured in Apps Script project settings.`);
  }
  return value;
}
