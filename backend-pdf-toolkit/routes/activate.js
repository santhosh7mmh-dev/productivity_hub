const express = require("express");
const { google } = require("googleapis");

const router = express.Router();

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

router.post("/", async (req, res) => {

    try {

        const { key, hwid } = req.body;

        if (!key) {

            return res.json({
                valid: false,
                message: "License key required"
            });

        }

        const response = await sheets.spreadsheets.values.get({

            spreadsheetId,

            range: "Keys!A:D"

        });

        const rows = response.data.values;

        for (let i = 1; i < rows.length; i++) {

            const row = rows[i];

            const license = row[0];

            const status = row[1] || "UNUSED";
            const storedHWID = row[2] || "";
            const expiry = row[7] || "";

            if (license !== key)
                continue;
            if (status === "BLOCKED") {

                return res.json({

                    valid: false,

                    message: "This license has been blocked."

                });

            }

            if (status === "EXPIRED") {

                if (expiry) {

                    const expiryDate = new Date(expiry);

                    if (new Date() > expiryDate) {

                        await sheets.spreadsheets.values.update({

                        spreadsheetId,

                        range: `B${i + 1}`,

                        valueInputOption: "RAW",

                        requestBody: {

                            values: [["EXPIRED"]]

                         }

                     });

        return res.json({

            valid: false,

            message: "License expired."

        });

    }

}

                return res.json({

                    valid: false,

                    message: "This license has expired."

                });

            }

            if (status === "UNUSED") {

                await sheets.spreadsheets.values.update({

                    spreadsheetId,

                    range: `Keys!A${i+1}:D${i+1}`,

                    valueInputOption: "RAW",

                    requestBody: {

                        values: [[

                            key,

                            "ACTIVE",

                            hwid,

                            new Date().toISOString()

                        ]]

                    }

                });

                return res.json({

                    valid: true,

                    firstActivation: true

                });

            }

            if (storedHWID === hwid) {

                return res.json({

                    valid: true,

                    existingDevice: true

                });

            }

            return res.json({

                valid: false,

                message: "Already activated on another device."

            });

        }

        res.json({

            valid: false,

            message: "Invalid activation key."

        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({

            valid: false,

            message: err.message

        });

    }

});

router.post("/verify", async (req, res) => {

    try {

        const { key, hwid } = req.body;

        const response = await sheets.spreadsheets.values.get({

            spreadsheetId,

            range: "Keys!A:J"

        });

        const rows = response.data.values || [];

        for (let i = 1; i < rows.length; i++) {

            const row = rows[i];

            const license = row[0];
            const status = row[1] || "UNUSED";
            const storedHWID = row[2] || "";
            const expiry = row[7] || "";

            if (license !== key)
                continue;

            if (status === "BLOCKED") {

                return res.json({
                    valid: false,
                    message: "License blocked."
                });

            }

            if (status === "EXPIRED") {

                return res.json({
                    valid: false,
                    message: "License expired."
                });

            }

            if (expiry) {

                const expiryDate = new Date(expiry);

                if (new Date() > expiryDate) {

                    return res.json({
                        valid: false,
                        message: "License expired."
                    });

                }

            }

            if (storedHWID !== hwid) {

                return res.json({
                    valid: false,
                    message: "Device mismatch."
                });

            }

            return res.json({
                valid: true
            });

        }

        return res.json({
            valid: false,
            message: "License not found."
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({

            valid: false,

            message: err.message

        });

    }

});

module.exports = router;