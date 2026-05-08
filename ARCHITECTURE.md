# Integration Points & Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUD BREW ARCHITECTURE                      │
└─────────────────────────────────────────────────────────────────┘

CLIENT SIDE (Expo React Native)
├── BaristaScreen Component
│   ├── useEffect: Initialize Socket.io connection
│   ├── useEffect: Load analytics when Analytics tab selected
│   ├── useEffect: Subscribe to socket events
│   │
│   ├── Service: queueSocket.js
│   │   ├── connectQueueSocket(apiUrl, token)
│   │   ├── subscribeToQueueEvents(callback)
│   │   └── disconnectQueueSocket()
│   │
│   └── Service: baristaAnalytics.js
│       ├── fetchBaristaAnalytics(options)
│       ├── formatPrepTime(minutes)
│       └── getPerformanceTier(avgMinutes)
│
└── Service: http.js
    └── getApiUrl() → returns resolved API base URL

SERVER SIDE (Node.js/Express)
├── Socket.io Server (port 4000)
│   ├── Auth middleware: JWT validation
│   ├── Room: role:barista (for baristas)
│   ├── Room: role:cashier (for cashiers)
│   └── Room: role:admin (for admins)
│
├── REST API Endpoints
│   ├── POST /api/orders
│   │   └── broadcastQueueEvent('queue.order.created')
│   │
│   ├── PATCH /api/orders/:orderId/status
│   │   └── broadcastQueueEvent('queue.order.updated')
│   │
│   └── GET /api/analytics/barista-dashboard ✨ NEW
│       ├── Query: myStats (personal prep times)
│       ├── Query: queueHealth (pending/inProgress)
│       └── Aggregation: wait times
│
└── MongoDB
    ├── Order collection
    │   ├── createdAt, updatedAt (for analytics)
    │   ├── handledBy (barista name)
    │   ├── completedAt (for prep time calc)
    │   └── status (pending/in-progress/completed)
    │
    └── Staff collection (for auth)
```

## Data Flow Diagrams

### Real-Time Order Flow
```
1. Cashier Creates Order
   │
   └─→ POST /api/orders
       │
       └─→ Order saved to MongoDB
           │
           ├─→ emit('queue.order.created') ─┐
           │   (to all connected clients)     │
           │                                   │
           └─→ res.json(order) ────────────┐  │
                                            │  │
                                            │  │
2. Barista's Socket Client                 │  │
   │                                        │  │
   ├─→ receives: queue.event ◄─────────────┤  │
   │   payload: { eventType, order }       │  │
   │                                        │  │
   └─→ logs: '[BARISTA] Queue event...'    │  │
       (UserContext handles data update)    │  │
                                            │  │
3. BaristaScreen Re-renders ◄──────────────┘  │
   │                                           │
   └─→ Shows new order in Active Queue        │
       No page refresh needed! ✨             │
```

### Analytics Load Flow
```
1. Barista clicks "Analytics" tab in BaristaScreen
   │
   └─→ activeView state = 'analytics'
       │
       └─→ useEffect triggers
           │
           └─→ setAnalyticsLoading(true)
               │
               └─→ fetchBaristaAnalytics()
                   │
                   └─→ GET /api/analytics/barista-dashboard
                       │
                       ├─→ Backend queries completed orders for this barista
                       │   aggregation: avg/min/max prep times
                       │
                       └─→ Backend queries queue health
                           aggregation: pending/inProgress/waitTimes
                               │
                               └─→ res.json({ myStats, queueHealth })
                                   │
                                   └─→ Frontend receives data
                                       │
                                       └─→ setAnalytics(data)
                                           │
                                           └─→ Render with
                                               - Performance tier badge
                                               - Formatted prep times
                                               - Queue metrics
```

## Socket.io Connection Lifecycle

```
BaristaScreen Mounts
│
├─→ useEffect runs
│   └─→ connectQueueSocket(apiUrl, token)
│       │
│       ├─→ new io(socketUrl, { auth: { token }, ... })
│       │
│       ├─→ socket.on('connect')
│       │   └─→ setSocketConnected(true)
│       │
│       ├─→ socket.on('queue.ready')
│       │   └─→ console.log('[SOCKET] Queue ready')
│       │
│       ├─→ socket.on('queue.event', (payload) => {
│       │       notifySubscribers({ type: 'queue-event', payload })
│       │   })
│       │
│       └─→ socket.on('disconnect')
│           └─→ setSocketConnected(false)
│               notifySubscribers({ type: 'connection', state: 'disconnected' })
│
├─→ subscribeToQueueEvents(callback)
│   └─→ Each callback added to subscribers Set
│
├─→ On connection loss
│   └─→ socket auto-reconnects (exponential backoff: 1s → 5s)
│
└─→ BaristaScreen unmounts
    └─→ disconnectQueueSocket()
        └─→ socket.disconnect()
            subscribers.clear()
```

## Database Aggregation Pipeline (Analytics)

### Personal Stats Query
```javascript
Order.aggregate([
  {
    $match: {
      status: 'completed',
      handledBy: currentBarista,
      createdAt: { $gte: fromDate, $lte: toDate }
    }
  },
  {
    $addFields: {
      prepMinutes: {
        $divide: [
          { $subtract: [completedAt, createdAt] },
          60000  // ms to minutes
        ]
      }
    }
  },
  {
    $group: {
      _id: null,
      completedOrders: { $sum: 1 },
      totalDrinks: { $sum: '$quantity' },
      avgPrepMinutes: { $avg: '$prepMinutes' },
      minPrepMinutes: { $min: '$prepMinutes' },
      maxPrepMinutes: { $max: '$prepMinutes' }
    }
  }
])
```

### Queue Health Query
```javascript
Promise.all([
  Order.countDocuments({ status: 'pending' }),
  Order.countDocuments({ status: 'in-progress' }),
  Order.aggregate([
    {
      $match: {
        status: { $in: ['pending', 'in-progress'] }
      }
    },
    {
      $addFields: {
        waitMinutes: {
          $divide: [
            { $subtract: [Date.now(), createdAt] },
            60000
          ]
        }
      }
    },
    {
      $group: {
        _id: '$status',
        avgWaitMinutes: { $avg: '$waitMinutes' },
        maxWaitMinutes: { $max: '$waitMinutes' }
      }
    }
  ])
])
```

## Component State Management

### BaristaScreen State
```javascript
const [activeView, setActiveView] = useState('all')                    // Current tab
const [analytics, setAnalytics] = useState(null)                       // Cached analytics data
const [analyticsLoading, setAnalyticsLoading] = useState(false)       // Loading state
const [socketConnected, setSocketConnected] = useState(false)         // Socket connection status
const [selectedOrder, setSelectedOrder] = useState(null)              // Selected order for recipe guide
const [activeFilter, setActiveFilter] = useState('all')               // Queue filter (all/pending/in-progress)
const [showAllCompleted, setShowAllCompleted] = useState(false)       // Show all completed orders
```

### State Flow
```
Socket connects
  ├─→ setSocketConnected(true)
  └─→ Badge: "🔴 Socket Live"

User clicks Analytics tab
  ├─→ setActiveView('analytics')
  ├─→ setAnalyticsLoading(true)
  ├─→ fetchBaristaAnalytics()
  ├─→ setAnalytics(data)
  └─→ setAnalyticsLoading(false)

User clicks Refresh
  ├─→ setAnalyticsLoading(true)
  ├─→ fetchBaristaAnalytics()
  └─→ setAnalytics(newData) + setAnalyticsLoading(false)
```

## Error Handling Strategy

```
Socket Connection Error
├─→ Socket emits 'connect_error'
├─→ subscribeToQueueEvents receives:
│   { type: 'connection', state: 'error', message: '...' }
├─→ Badge shows: "Realtime offline"
└─→ Auto-reconnect triggered (1s delay, exponential backoff)

Analytics Load Error
├─→ fetchBaristaAnalytics() throws
├─→ catch block: setAnalyticsLoading(false)
├─→ Analytics view shows: "Unable to load analytics. Try again later."
└─→ User can click Refresh to retry

Network Timeout
├─→ fetch() AbortController timeout (2.5s per URL)
├─→ Tries next API URL candidate
├─→ Falls back through: primary → localhost → 127.0.0.1
└─→ If all fail: "Cannot reach API server"
```

## Integration Checklist

- [x] Backend endpoint created with proper role guards
- [x] Socket.io server initialized on HTTP server
- [x] Order creation broadcasts to socket
- [x] Order status updates broadcast to socket
- [x] Frontend socket service handles connection lifecycle
- [x] Frontend analytics service fetches data
- [x] BaristaScreen initializes socket on mount
- [x] BaristaScreen unmounts socket on unmount
- [x] Analytics tab loads and displays data
- [x] Performance tier calculated from prep times
- [x] Prep times formatted for display
- [x] Queue health metrics displayed
- [x] Real-time badge shows connection status
- [x] Refresh button reloads analytics
- [x] All styles defined and applied
- [x] 10/10 validation tests pass
