# Cloud Brew - Barista Analytics & Real-Time Queue Implementation

## Overview
This document summarizes the implementation of barista-specific analytics dashboard and real-time queue updates using Socket.io.

## Features Implemented

### 1. **Backend Barista Analytics Endpoint**
- **Endpoint**: `GET /api/analytics/barista-dashboard`
- **Authentication**: JWT required, roles: barista/admin
- **Location**: [server/index.js](server/index.js) (lines 2396-2447)

**Response Includes:**
- **myStats**: Personal performance metrics
  - `completedOrders`: Total completed orders in period
  - `totalDrinks`: Sum of quantities across orders
  - `avgPrepMinutes`: Average preparation time
  - `minPrepMinutes`: Fastest prep time
  - `maxPrepMinutes`: Slowest prep time
- **queueHealth**: Aggregate queue status
  - `queue`: pending, inProgress, totalActive counts
  - `waitTimes`: Average and max wait times by status

### 2. **Real-Time Queue Socket.io Integration**
- **Backend**: Already configured with `socket.io` server on port 4000
- **Events**:
  - `queue.order.created`: New order broadcast
  - `queue.order.updated`: Order status changed
  - Broadcast to role-based rooms: `role:cashier`, `role:barista`, `role:admin`

### 3. **Frontend - Barista Analytics Service**
- **File**: [src/services/baristaAnalytics.js](src/services/baristaAnalytics.js)
- **Exports**:
  - `fetchBaristaAnalytics(options)`: Fetch analytics with date range
  - `formatPrepTime(minutes)`: Format prep time display
  - `getPerformanceTier(avgMinutes)`: Get performance badge (Elite/Excellent/Good/Needs Improvement)
  - `calculateMetricChanges(current, previous)`: Compare metrics between periods

### 4. **Frontend - Socket.io Client Service**
- **File**: [src/services/queueSocket.js](src/services/queueSocket.js)
- **Key Functions**:
  - `connectQueueSocket(apiUrl, token)`: Connect to real-time server
  - `disconnectQueueSocket()`: Clean disconnect
  - `subscribeToQueueEvents(callback)`: Subscribe to real-time events
  - `isQueueConnected()`: Get connection status
  - Auto-reconnect with exponential backoff

### 5. **Enhanced BaristaScreen Component**
- **File**: [src/screens/BaristaScreen.js](src/screens/BaristaScreen.js)
- **New Features**:
  - New "Analytics" view tab
  - Socket.io connection initialization and management
  - Real-time connection status badge (🔴 Socket Live)
  - Analytics dashboard with:
    - **Personal Stats Card**: Completed orders, total drinks, avg prep time
    - **Performance Tier Badge**: Elite/Excellent/Good/Needs Improvement rating
    - **Prep Time Range**: Fastest and slowest prep times
    - **Queue Health Card**: Active queue metrics
    - **Wait Times**: Pending and in-progress average/max wait times
  - Refresh button to reload analytics
  - Loading state with spinner

### 6. **HTTP Service Enhancement**
- **File**: [src/services/http.js](src/services/http.js)
- **New Export**: `getApiUrl()` to retrieve resolved API URL for socket connection

## Data Flow

### Real-Time Order Updates
1. Cashier creates order → POST /api/orders
2. Backend broadcasts via Socket.io: `queue.order.created`
3. Barista's socket client receives event
4. UserContext updates orders list (polling still works as fallback)
5. BaristaScreen re-renders with new order

### Analytics Dashboard Load
1. Barista clicks "Analytics" tab in BaristaScreen
2. Frontend calls `fetchBaristaAnalytics()`
3. Backend aggregates MongoDB queries:
   - Personal completed orders and prep times
   - Current queue health (pending/in-progress counts)
   - Wait time metrics
4. Response displayed with formatted times and performance tier

## Configuration

### Required Environment Variables
- `PORT`: Server port (default: 4000)
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: JWT signing key
- `EXPO_PUBLIC_API_URL`: Frontend API base URL (e.g., http://192.168.1.11:4000/api)

### Socket.io Configuration
- Runs on same HTTP server as Express API
- Supports both WebSocket and HTTP long-polling transports
- Role-based room subscriptions
- Auto-reconnection with 1-5s delays

## Testing Guide

### Manual Testing

1. **Start Backend**
   ```bash
   npm run server
   ```
   Verify: "Realtime Queue socket ready at ws://localhost:4000/socket.io"

2. **Start Expo App**
   ```bash
   npm start
   ```

3. **Login as Barista**
   - Select "Barista" role
   - Email: any cashier email, Password: any password (demo: barista@test.com / password)

4. **Test Real-Time Queue**
   - Open Barista screen
   - Verify 🔴 Socket Live badge appears in hero card
   - Create order from another device/tab (cashier screen)
   - Order should appear in "Active Queue" without page refresh

5. **Test Analytics Dashboard**
   - Click "Analytics" tab
   - Wait for data to load
   - Verify metrics display:
     - Session stats (completed orders, drinks, prep time)
     - Performance tier badge
     - Prep time range (fastest/slowest)
     - Queue health (pending/in-progress)
     - Wait times by status
   - Click "Refresh" button to reload data

### Automated Testing
See [tests/integration/workflow.test.js](tests/integration/workflow.test.js) for existing tests.

## Performance Considerations

- **Socket Connection**: Persists across navigation (not recreated on re-render)
- **Analytics Caching**: Only fetches when Analytics tab selected (lazy loading)
- **Aggregation**: MongoDB aggregation pipeline used for efficient queries
- **Reconnection**: Auto-retry with exponential backoff (max 5s delay)

## Browser/Platform Support

- **Supported**: iOS, Android, Web (via socket.io adapters)
- **Transports**: WebSocket (primary), HTTP long-polling (fallback)
- **Engines**: Node.js 14+, Expo 54+

## Error Handling

- Socket connection failures → Badge shows "Realtime offline"
- Analytics load failures → Empty state with error message
- Timeout on socket handshake (5s) → Falls back to polling
- Network errors → Auto-reconnect with backoff

## Future Enhancements

1. **Persistence**: Store analytics snapshots for historical trends
2. **Notifications**: Push notifications for long-wait-time alerts
3. **Leaderboards**: Compare barista performance metrics
4. **Custom Date Ranges**: Allow barista to select analytics time period
5. **Export**: Download analytics as CSV/PDF
6. **Real-Time Metrics**: Update prep time metrics in real-time as orders complete
