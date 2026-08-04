const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: [
        "https://www.googleapis.com/auth/spreadsheets"
    ]
});

const sheets = google.sheets({
    version: "v4",
    auth
});

const spreadsheetId = process.env.GOOGLE_SHEET_ID;

async function getKeys() {

    const response = await sheets.spreadsheets.values.get({

        spreadsheetId,

        range: "Keys!A:D"

    });

    return response.data.values || [];

}

module.exports = {
    getKeys
};