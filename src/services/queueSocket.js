import { io } from 'socket.io-client';

let socket = null;
const subscribers = new Set();
let isConnected = false;

/**
 * Connect to real-time queue server
 * @param {string} apiBaseUrl - Base API URL (e.g., http://192.168.1.11:4000)
 * @param {string} token - JWT token for authentication
 * @returns {Promise<boolean>} True if connection successful
 */
export function connectQueueSocket(apiBaseUrl, token) {
  return new Promise((resolve) => {
    try {
      if (socket) {
        socket.disconnect();
      }

      const socketUrl = apiBaseUrl.replace(/\/api\/?$/, '');

      socket = io(socketUrl, {
        auth: {
          token,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
      });

      socket.on('connect', () => {
        isConnected = true;
        notifySubscribers({
          type: 'connection',
          state: 'connected',
          message: 'Queue connection established',
        });
        resolve(true);
      });

      socket.on('disconnect', () => {
        isConnected = false;
        notifySubscribers({
          type: 'connection',
          state: 'disconnected',
          message: 'Queue connection lost',
        });
      });

      socket.on('queue.event', (payload) => {
        notifySubscribers({
          type: 'queue-event',
          payload,
        });
      });

      socket.on('queue.ready', (readyPayload) => {
        console.log('[SOCKET] Queue ready:', readyPayload);
      });

      socket.on('connect_error', (error) => {
        console.error('[SOCKET] Connection error:', error);
        notifySubscribers({
          type: 'connection',
          state: 'error',
          message: `Connection failed: ${error?.message || 'Unknown error'}`,
        });
      });

      socket.on('error', (error) => {
        console.error('[SOCKET] Error:', error);
      });

      // Set a timeout to consider connection failed if not connected within 5s
      const timeout = setTimeout(() => {
        if (!isConnected) {
          resolve(false);
        }
      }, 5000);

      socket.on('connect', () => clearTimeout(timeout));
    } catch (error) {
      console.error('[SOCKET] Failed to initialize:', error);
      resolve(false);
    }
  });
}

/**
 * Disconnect from real-time queue server
 */
export function disconnectQueueSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnected = false;
  }
}

/**
 * Subscribe to queue real-time events
 * @param {Function} callback - Called with { type, state, message, payload }
 * @returns {Function} Unsubscribe function
 */
export function subscribeToQueueEvents(callback) {
  if (typeof callback !== 'function') {
    console.warn('[SOCKET] Invalid callback provided to subscribeToQueueEvents');
    return () => {};
  }

  subscribers.add(callback);

  // Send current connection state immediately
  callback({
    type: 'connection',
    state: isConnected ? 'connected' : 'disconnected',
    message: isConnected ? 'Queue connection established' : 'Queue connection offline',
  });

  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Notify all subscribers of an event
 * @private
 */
function notifySubscribers(event) {
  subscribers.forEach((callback) => {
    try {
      callback(event);
    } catch (error) {
      console.error('[SOCKET] Error in subscriber callback:', error);
    }
  });
}

/**
 * Get current connection state
 * @returns {boolean} True if connected
 */
export function isQueueConnected() {
  return isConnected;
}

/**
 * Emit a custom event to the server
 * @param {string} eventName - Event name
 * @param {*} data - Event data
 * @returns {Promise<void>}
 */
export function emitQueueEvent(eventName, data) {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('Socket not connected'));
      return;
    }

    try {
      socket.emit(eventName, data, (response) => {
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}
