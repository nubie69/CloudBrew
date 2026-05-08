# Cloud Brew - Barista Analytics & Real-Time Queue API Implementation

## ✅ What's Been Implemented

### 1. **Backend Analytics Endpoint**
   - **Endpoint**: `GET /api/analytics/barista-dashboard`
   - **Location**: [server/index.js](server/index.js#L2393)
   - Returns personal stats (completed orders, prep times) and queue health metrics
   - Role-restricted: barista/admin only

### 2. **Real-Time Queue System (Socket.io)**
   - **Backend**: Socket.io server listening on port 4000
   - **Events Broadcast**:
     - `queue.order.created`: New order notifications
     - `queue.order.updated`: Status change notifications
   - Auto-reconnect with exponential backoff
   - WebSocket + HTTP polling fallback

### 3. **Frontend Services**

   **Barista Analytics Service** ([src/services/baristaAnalytics.js](src/services/baristaAnalytics.js))
   ```javascript
   fetchBaristaAnalytics(options)    // Fetch analytics with date range
   formatPrepTime(minutes)           // Format time display (e.g., "3 min", "1h 45m")
   getPerformanceTier(avgMinutes)    // Get performance badge
   calculateMetricChanges(...)       // Compare metrics between periods
   ```

   **Queue Socket Service** ([src/services/queueSocket.js](src/services/queueSocket.js))
   ```javascript
   connectQueueSocket(apiUrl, token)         // Connect to real-time server
   disconnectQueueSocket()                   // Clean disconnect
   subscribeToQueueEvents(callback)          // Subscribe to real-time events
   isQueueConnected()                        // Get connection status
   ```

### 4. **Enhanced Barista Screen**
   - **New "Analytics" Tab**: View personal performance and queue health
   - **Real-Time Connection**: Shows "🔴 Socket Live" when connected
   - **Analytics Dashboard Includes**:
     - Personal session stats (completed orders, drinks, avg prep time)
     - Performance tier badge (Elite/Excellent/Good/Needs Improvement)
     - Prep time range (fastest/slowest)
     - Queue health metrics (pending/in-progress)
     - Wait time statistics
   - Refresh button for manual data reload

## 🚀 How to Use

### For Barista Users:
1. Login as Barista
2. Barista screen shows real-time queue automatically (no refresh needed)
3. Click "Analytics" tab to view:
   - Your completed orders this session
   - Average prep time with performance tier
   - Current queue health
   - Wait times for pending/in-progress orders
4. Click "Refresh" to reload latest analytics

### For Developers:

**Check Integration**
```bash
node tests/barista-features.test.js    # Runs 10 validation tests
```

**Start Backend**
```bash
npm run server    # Starts on http://localhost:4000
```

**Start Expo App**
```bash
npm start         # Metro on port 8081
```

## 📊 API Response Examples

### Barista Analytics Endpoint
```bash
GET /api/analytics/barista-dashboard?from=2025-01-01&to=2025-01-31
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "generatedAt": "2025-01-15T10:30:00Z",
  "range": {
    "from": "2025-01-01T00:00:00Z",
    "to": "2025-01-31T23:59:59Z"
  },
  "myStats": {
    "completedOrders": 42,
    "totalDrinks": 53,
    "avgPrepMinutes": 4.2,
    "minPrepMinutes": 1.5,
    "maxPrepMinutes": 8.3
  },
  "queueHealth": {
    "asOf": "2025-01-15T10:30:00Z",
    "queue": {
      "pending": 3,
      "inProgress": 2,
      "totalActive": 5
    },
    "waitTimes": {
      "pendingAvgMinutes": 2.1,
      "pendingMaxMinutes": 4.5,
      "inProgressAvgMinutes": 3.2,
      "inProgressMaxMinutes": 6.8
    }
  }
}
```

## 🔌 Socket.io Events

**Connection Lifecycle:**
```javascript
// Client connects
socket.on('queue.ready', (payload) => {
  // Connection established
  // payload: { ok: true, connectedAt: "2025-01-15T10:30:00Z" }
})

// Receive order events
socket.on('queue.event', (payload) => {
  // New order or status update
  // payload: { 
  //   id: 'ORD-...', 
  //   eventType: 'queue.order.created' | 'queue.order.updated',
  //   actor: 'barista-name',
  //   order: { id, item, status, ... }
  // }
})

// Connection state changes
socket.on('connect', () => { /* connected */ })
socket.on('disconnect', () => { /* disconnected */ })
socket.on('connect_error', (error) => { /* error */ })
```

## 📁 Files Modified/Created

**Backend:**
- `server/index.js` - Added `/api/analytics/barista-dashboard` endpoint (line 2393)

**Frontend Services:**
- `src/services/baristaAnalytics.js` - ✨ **NEW** - Analytics helpers
- `src/services/queueSocket.js` - ✨ **NEW** - Socket.io client
- `src/services/http.js` - Added `getApiUrl()` export

**Frontend UI:**
- `src/screens/BaristaScreen.js` - Added Analytics view, socket integration

**Testing:**
- `tests/barista-features.test.js` - ✨ **NEW** - Feature validation suite

## 🧪 Testing Checklist

- [x] Backend endpoint registered and role-guarded
- [x] Socket.io server configured
- [x] Order events broadcast to socket
- [x] Frontend services export required functions
- [x] BaristaScreen imports new services
- [x] Analytics tab renders
- [x] Socket connection initializes
- [x] Performance metrics formatted correctly
- [x] All styles defined
- [x] 10/10 validation tests pass

## ⚡ Performance Notes

- **Analytics**: Fetched only when Analytics tab is selected (lazy loading)
- **Socket Connection**: Persists across navigation, not recreated on re-renders
- **Reconnection**: Auto-retry with 1-5s exponential backoff
- **Aggregation**: MongoDB aggregation pipeline for efficient queries
- **Fallback**: HTTP polling available if WebSocket unavailable

## 🔐 Security

- JWT authentication required for socket connection
- Analytics endpoint role-restricted to barista/admin
- All socket events validated on backend
- Auth token passed in socket handshake

## 📝 Next Steps (Optional)

1. **Historical Analytics**: Store snapshots for trend analysis
2. **Leaderboards**: Compare performance with other baristas
3. **Alerts**: Notify when wait times exceed threshold
4. **Custom Ranges**: Allow date range selection in UI
5. **Export**: Download analytics as CSV/PDF
6. **Real-Time Updates**: Refresh analytics every 30s while tab is active

## 🆘 Troubleshooting

**Socket shows "Realtime offline":**
- Check backend is running on correct port
- Verify EXPO_PUBLIC_API_URL is correct
- Check WebSocket not blocked by firewall

**Analytics shows empty:**
- Verify user has completed orders in date range
- Check MongoDB connection on backend
- Try clicking Refresh button

**Performance tier always "Needs Improvement":**
- This is normal for first session - need more data
- Tier updates as more orders complete
