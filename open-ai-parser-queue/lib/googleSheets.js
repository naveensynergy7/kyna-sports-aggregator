const { google } = require("googleapis");

const SHEET_HEADERS = [
  "Created At",
  "Platform",
  "Status",
  "Confidence",
  "Entry",
  "Location",
  "Date",
  "Time",
  "Game Type",
  "Requirement",
  "Match Duration",
  "Match Pace",
  "Contact URL",
  "Other Details",
  "Original Message",
];

let sheetsClient;
let headersEnsured = false;

function isConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
      (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS)
  );
}

function getCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  return undefined;
}

function getSheetsClient() {
  if (!sheetsClient) {
    const auth = new google.auth.GoogleAuth({
      credentials: getCredentials(),
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheetsClient = google.sheets({ version: "v4", auth });
  }
  return sheetsClient;
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured");
  }
  return id;
}

function getSheetRange() {
  return process.env.GOOGLE_SHEETS_RANGE || "Sheet1";
}

async function ensureHeaders(logger) {
  if (headersEnsured) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const range = `${getSheetRange()}!A1:O1`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const firstRow = response.data.values?.[0];
  if (!firstRow || firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [SHEET_HEADERS] },
    });
    logger.info("Google Sheets header row created");
  }

  headersEnsured = true;
}

async function saveParsedMessageToSheet(data, logger) {
  if (!isConfigured()) {
    logger.info("Google Sheets not configured, skipping sheet save");
    return;
  }

  const { originalMessage, platform, contactUrl, extractedData } = data;

  if (extractedData.confidence <= 0.3) {
    logger.info(
      `⏭️ Confidence too low (${extractedData.confidence}), skipping Google Sheets save`
    );
    return;
  }

  const toCell = (value) =>
    value === undefined || value === null || value === "null" ? "" : value;

  const hasRequiredFields =
    extractedData.location &&
    extractedData.date &&
    extractedData.time &&
    extractedData.gameType;

  const status = hasRequiredFields ? "APPROVED" : "PENDING";
  const createdAt = new Date().toISOString();

  await ensureHeaders(logger);

  const row = [
    createdAt,
    platform,
    status,
    extractedData.confidence || 0,
    toCell(extractedData.entry),
    toCell(extractedData.location),
    toCell(extractedData.date),
    toCell(extractedData.time),
    toCell(extractedData.gameType),
    toCell(extractedData.requirement),
    toCell(extractedData.matchDuration),
    toCell(extractedData.matchPace),
    toCell(contactUrl || extractedData.contactUrl),
    toCell(extractedData.otherDetails),
    originalMessage,
  ];

  const sheets = getSheetsClient();
  const range = `${getSheetRange()}!A:O`;

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  logger.info(`📊 Successfully saved to Google Sheets`, {
    status,
    platform,
    confidence: extractedData.confidence,
  });
}

module.exports = { saveParsedMessageToSheet, isConfigured };
