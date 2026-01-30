# Google Business Profile Reviews with Permanent Caching

This application displays Google Business Profile reviews with a **permanent caching mechanism** that ensures reviews are never lost, even if Google removes or reinstates them.

## 🔄 How the Caching System Works

### Automatic Review Persistence
- Every time the `/reviews` endpoint is called, the app fetches fresh reviews from Google
- All reviews (both new and existing) are stored in a local `reviews-cache.json` file
- Reviews are merged using their unique `reviewId` to prevent duplicates
- If a review is removed from Google but exists in the cache, it remains visible
- If Google reinstates a removed review, it's automatically updated in the cache

### Key Features
1. **Permanent Storage**: Once a review is seen, it's stored forever in `reviews-cache.json`
2. **Automatic Merging**: New reviews are intelligently merged with cached reviews
3. **No Duplicates**: Reviews are identified by their unique `reviewId`
4. **Sorted by Date**: All reviews are sorted newest-first
5. **Fallback on Errors**: If Google API fails, the app serves cached reviews
6. **Update Detection**: Edited reviews are automatically updated

### Cache File Location
- **Local/Vercel**: `reviews-cache.json` in the project root
- The cache file is automatically created on first run
- Add to `.gitignore` to keep it out of version control (already configured)

## 📊 API Response Enhancement

The `/reviews` endpoint now returns additional cache information:

```json
{
  "reviews": [...],
  "averageRating": 4.8,
  "totalReviewCount": 25,
  "name": "Glasgow Drum School",
  "placeId": "ChIJ...",
  "cached": false,
  "cacheInfo": {
    "totalCached": 25,
    "newFromGoogle": 3,
    "lastUpdated": "2026-01-30T10:30:00.000Z"
  }
}
```

### Response Fields
- `cached`: `true` if serving from cache due to API error, `false` if Google API succeeded
- `cacheInfo.totalCached`: Total number of reviews in cache
- `cacheInfo.newFromGoogle`: Number of reviews fetched from Google in this request
- `cacheInfo.lastUpdated`: Timestamp of last successful cache update

## 🚀 Deployment

### Vercel Deployment
The cache file (`reviews-cache.json`) will persist in Vercel's filesystem during the function's execution. However, note:
- Vercel serverless functions are stateless
- For permanent storage across deployments, consider using:
  - Vercel KV (Redis)
  - External database (MongoDB, PostgreSQL)
  - Cloud storage (AWS S3, Google Cloud Storage)

### Local Development
```bash
npm install
npm start
```

The cache file will be created automatically in your project directory.

## 📝 How Reviews are Protected

### Scenario 1: Google Removes a Review
1. Review exists in cache with `reviewId: "abc123"`
2. Google removes it from their API
3. Next fetch returns reviews WITHOUT "abc123"
4. Cache still contains "abc123"
5. Merged result includes "abc123" ✅
6. **Result**: Review remains visible to your visitors

### Scenario 2: Google Reinstates a Review
1. Review "abc123" exists in cache
2. Google reinstates it (possibly with edits)
3. Next fetch includes "abc123" with updated data
4. Cache merges and updates "abc123"
5. **Result**: Updated review appears to visitors

### Scenario 3: New Review Arrives
1. Google shows new review "def456"
2. Cache doesn't have "def456"
3. Merge adds "def456" to cache
4. **Result**: New review appears and is permanently stored

## 🔧 Technical Details

### Review Identification
Reviews are uniquely identified by their `reviewId` field from Google's API. This ensures:
- No duplicates in the cache
- Proper updates when reviews are edited
- Reliable tracking of removed/reinstated reviews

### Merge Algorithm
```javascript
1. Create a Map from cached reviews (keyed by reviewId)
2. Add/update with new reviews from Google
3. Convert back to array
4. Sort by createTime (newest first)
5. Save to cache file
```

### Error Handling
- If Google API fails, the app serves cached reviews
- The `cached` flag in the response indicates cache-only mode
- Cache timestamps help track freshness

## 📦 Files

- `index.js` - Main server with caching logic
- `index.html` - Frontend display
- `reviews-cache.json` - Automatic cache file (created on first run)
- `package.json` - Dependencies
- `vercel.json` - Vercel configuration
- `.gitignore` - Excludes cache file from git

## ⚠️ Important Notes

1. **Cache File Management**: The cache file grows over time. Monitor its size.
2. **Vercel Limitations**: Serverless functions are stateless. Consider external storage for production.
3. **No Manual Deletion**: Reviews are never automatically deleted from the cache.
4. **Review Edits**: If a reviewer edits their review, the cache updates with the new content.

## 🎯 Benefits

✅ **Never lose reviews** - Even if Google removes them  
✅ **Automatic updates** - New reviews are added seamlessly  
✅ **Zero configuration** - Cache works automatically  
✅ **Error resilience** - Serves cached reviews if Google API fails  
✅ **Historical record** - Complete history of all reviews ever received  

---

Your reviews are now permanently protected! 🎉
