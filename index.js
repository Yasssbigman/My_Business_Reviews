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

// Cache file path
const CACHE_FILE = path.join(__dirname, "reviews-cache.json");

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
 * Load cached reviews from file
 */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading cache:", err.message);
  }
  return { reviews: [], lastUpdated: null };
}

/**
 * Save reviews to cache file
 */
function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    console.log(`✅ Cache saved: ${cache.reviews.length} reviews`);
  } catch (err) {
    console.error("Error saving cache:", err.message);
  }
}

/**
 * Merge new reviews with cached reviews
 * Reviews are identified by reviewId (unique identifier from Google)
 */
function mergeReviews(cachedReviews, newReviews) {
  const reviewMap = new Map();
  
  // Add all cached reviews to map
  cachedReviews.forEach(review => {
    if (review.reviewId) {
      reviewMap.set(review.reviewId, review);
    }
  });
  
  // Add or update with new reviews
  newReviews.forEach(review => {
    if (review.reviewId) {
      // If review exists, update it (in case of edits)
      // If it's new, add it
      reviewMap.set(review.reviewId, review);
    }
  });
  
  // Convert back to array and sort by date (newest first)
  const merged = Array.from(reviewMap.values());
  merged.sort((a, b) => {
    const dateA = new Date(a.createTime);
    const dateB = new Date(b.createTime);
    return dateB - dateA;
  });
  
  return merged;
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
 * List Reviews (PUBLIC) - Enhanced with caching mechanism
 */
app.get("/reviews", async (req, res) => {
  try {
    const LOCATION_NAME = process.env.LOCATION_NAME;
    const PLACE_ID = process.env.PLACE_ID;

    if (!LOCATION_NAME) {
      return res.status(400).json({ error: "LOCATION_NAME not configured" });
    }

    // Load cached reviews
    const cache = loadCache();
    let newReviews = [];
    let fetchError = null;

    // Try to fetch fresh reviews from Google
    try {
      const accessToken = await getAccessToken();

      const reviewsResponse = await axios.get(
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

      newReviews = reviewsResponse.data.reviews || [];
      console.log(`✅ Fetched ${newReviews.length} reviews from Google`);
    } catch (err) {
      console.error("Error fetching reviews from Google:", err.message);
      fetchError = err;
      // Continue with cached reviews if fetch fails
    }

    // Merge new reviews with cached reviews
    const allReviews = mergeReviews(cache.reviews, newReviews);
    
    // Save updated cache
    saveCache({
      reviews: allReviews,
      lastUpdated: new Date().toISOString()
    });

    // Fetch location info for business name and metadata
    let locationInfo = {};
    try {
      const locationResponse = await businessInfoClient.locations.get({
        name: LOCATION_NAME,
        readMask: "name,title,metadata"
      });
      locationInfo = locationResponse.data;
    } catch (err) {
      console.error("Could not fetch location info:", err.message);
    }

    // Calculate average rating and total count
    let totalReviewCount = allReviews.length;
    let averageRating = 0;
    
    if (allReviews.length > 0) {
      const starValues = {
        'FIVE': 5,
        'FOUR': 4,
        'THREE': 3,
        'TWO': 2,
        'ONE': 1
      };
      
      const sum = allReviews.reduce((acc, review) => {
        return acc + (starValues[review.starRating] || 0);
      }, 0);
      
      averageRating = sum / allReviews.length;
    }

    // Use PLACE_ID from env, fallback to location metadata
    const placeId = PLACE_ID || locationInfo.metadata?.placeId || null;
    const businessName = locationInfo.title || "Our Business";

    // Return enhanced response
    res.json({
      reviews: allReviews,
      averageRating: averageRating,
      totalReviewCount: totalReviewCount,
      name: businessName,
      placeId: placeId,
      cached: fetchError ? true : false, // Indicate if serving from cache due to error
      cacheInfo: {
        totalCached: allReviews.length,
        newFromGoogle: newReviews.length,
        lastUpdated: cache.lastUpdated
      }
    });

  } catch (err) {
    console.error("Reviews Error:", err.response?.data || err.message);
    
    // Even on complete failure, try to serve cached reviews
    const cache = loadCache();
    
    res.status(500).json({ 
      error: err.response?.data || err.message,
      reviews: cache.reviews || [],
      averageRating: 0,
      totalReviewCount: cache.reviews?.length || 0,
      cached: true,
      cacheInfo: {
        totalCached: cache.reviews?.length || 0,
        newFromGoogle: 0,
        lastUpdated: cache.lastUpdated
      }
    });
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
