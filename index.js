require("dotenv").config();
const express = require("express");
const { google } = require("googleapis");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Simple API key check
const API_KEY = process.env.API_KEY || "change-me-in-vercel";

function requireApiKey(req, res, next) {
  const key = req.query.key;
  if (key !== API_KEY) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

/**
 * OAuth2 Client
 */
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "urn:ietf:wg:oauth:2.0:oob"
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

/**
 * Google Business Profile APIs (v1)
 */
const accountClient = google.mybusinessaccountmanagement({
  version: "v1",
  auth: oauth2Client,
});

const businessInfoClient = google.mybusinessbusinessinformation({
  version: "v1",
  auth: oauth2Client,
});

/**
 * Helper function to get access token
 */
async function getAccessToken() {
  const { token } = await oauth2Client.getAccessToken();
  return token;
}

/**
 * Home - Serve the HTML file (PUBLIC)
 */
app.get("/", (req, res) => {
  const htmlPath = path.join(__dirname, "index.html");
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.send(`<h2>Google Business Profile Reviews</h2>`);
  }
});

/**
 * List Accounts (PROTECTED - requires ?key=YOUR_API_KEY)
 */
app.get("/accounts", requireApiKey, async (req, res) => {
  try {
    const response = await accountClient.accounts.list();
    res.json(response.data);
  } catch (err) {
    console.error("Accounts Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

/**
 * List Locations (PROTECTED - requires ?key=YOUR_API_KEY)
 */
app.get("/locations", requireApiKey, async (req, res) => {
  try {
    const ACCOUNT_NAME = process.env.ACCOUNT_NAME;

    if (!ACCOUNT_NAME) {
      return res.status(400).json({ error: "ACCOUNT_NAME not configured" });
    }

    const response = await businessInfoClient.accounts.locations.list({
      parent: ACCOUNT_NAME,
      pageSize: 100,
      readMask: "name,title,storefrontAddress"
    });

    res.json(response.data);
  } catch (err) {
    console.error("Locations Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

/**
 * List Reviews (PUBLIC - this is fine to be public)
 */
app.get("/reviews", async (req, res) => {
  try {
    const LOCATION_NAME = process.env.LOCATION_NAME;

    if (!LOCATION_NAME) {
      return res.status(400).json({ error: "LOCATION_NAME not configured" });
    }

    const accessToken = await getAccessToken();

    const response = await axios.get(
      `https://mybusiness.googleapis.com/v4/${LOCATION_NAME}/reviews`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          pageSize: 50,
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error("Reviews Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Export for Vercel
module.exports = app;

// For local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
  });
}
