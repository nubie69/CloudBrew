import { io } from 'socket.io-client';
import { getApiUrl } from './http';

const createdSubscribers = new Set();
const updatedSubscribers = new Set();
const statusSubscribers = new Set();
let currentRealtimeStatus = {
  state: 'disconnected',
  message: 'Realtime offline',
  updatedAt: new Date().toISOString(),
};
let realtimeSocket = null;

function notify(subscribers, payload) {
  subscribers.forEach((callback) => callback(payload));
}

function publishRealtimeStatus(state, message) {
  currentRealtimeStatus = {
    state,
    message,
    updatedAt: new Date().toISOString(),
  };
  notify(statusSubscribers, currentRealtimeStatus);
}

function handleQueueEvent(eventPayload) {
  const eventType = String(eventPayload?.eventType || '');
  const order = eventPayload?.order;
  if (!order?.id) {
    return;
  }

  if (eventType === 'queue.order.created') {
    notify(createdSubscribers, order);
    return;
  }

  if (eventType === 'queue.order.updated') {
    notify(updatedSubscribers, order);
  }
}

export function connectQueueRealtime(token) {
  if (!token) {
    publishRealtimeStatus('disconnected', 'Realtime offline');
    return () => {};
  }

  try {
    if (realtimeSocket) {
      realtimeSocket.disconnect();
      realtimeSocket = null;
    }

    const socketUrl = getApiUrl().replace(/\/api\/?$/, '');
    realtimeSocket = io(socketUrl, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    realtimeSocket.on('connect', () => publishRealtimeStatus('connected', 'Realtime queue live'));
    realtimeSocket.on('queue.ready', () => publishRealtimeStatus('connected', 'Realtime queue live'));
    realtimeSocket.on('disconnect', () => publishRealtimeStatus('disconnected', 'Realtime disconnected'));
    realtimeSocket.on('connect_error', (error) => {
      publishRealtimeStatus('disconnected', `Realtime disabled: ${error?.message || 'connection error'}`);
      if (__DEV__) {
        console.warn('[REALTIME SOCKET ERROR]', error);
      }
    });
    realtimeSocket.on('queue.event', (payload) => handleQueueEvent(payload));

    publishRealtimeStatus('reconnecting', 'Connecting to live queue...');

    return () => {
      if (!realtimeSocket) {
        return;
      }

      realtimeSocket.removeAllListeners();
      realtimeSocket.disconnect();
      realtimeSocket = null;
      publishRealtimeStatus('disconnected', 'Realtime offline');
    };
  } catch (error) {
    publishRealtimeStatus('disconnected', `Realtime disabled: ${error?.message || 'runtime error'}`);
    if (__DEV__) {
      console.warn('[PUSHER INIT ERROR]', error);
    }
    return () => {};
  }
}

export function subscribeToOrders(callback) {
  createdSubscribers.add(callback);
  return () => createdSubscribers.delete(callback);
}

export function subscribeToOrderUpdates(callback) {
  updatedSubscribers.add(callback);
  return () => updatedSubscribers.delete(callback);
}

export function subscribeToRealtimeStatus(callback) {
  statusSubscribers.add(callback);
  callback(currentRealtimeStatus);
  return () => statusSubscribers.delete(callback);
}

export function notifyNewOrder(order) {
  notify(createdSubscribers, order);
}
