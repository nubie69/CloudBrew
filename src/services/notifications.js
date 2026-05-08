const createdSubscribers = new Set();
const updatedSubscribers = new Set();
const statusSubscribers = new Set();
let currentRealtimeStatus = {
  state: 'disconnected',
  message: 'Realtime offline',
  updatedAt: new Date().toISOString(),
};
const PUSHER_CHANNEL = 'cloudbrew-queue';
const PUSHER_KEY = String(process.env.EXPO_PUBLIC_PUSHER_KEY || '').trim();
const PUSHER_CLUSTER = String(process.env.EXPO_PUBLIC_PUSHER_CLUSTER || '').trim();

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

let pusherClient = null;
let queueChannel = null;

function loadPusherClient() {
  try {
    // Lazy-load to avoid crashing app startup if native/runtime support is missing.
    const moduleRef = require('pusher-js/react-native');
    return moduleRef?.default || moduleRef;
  } catch (_error) {
    return null;
  }
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

  if (!PUSHER_KEY || !PUSHER_CLUSTER) {
    publishRealtimeStatus('disconnected', 'Pusher not configured');
    return () => {};
  }

  try {
    if (pusherClient) {
      pusherClient.disconnect();
      pusherClient = null;
    }
    queueChannel = null;

    const PusherClient = loadPusherClient();
    if (!PusherClient) {
      publishRealtimeStatus('disconnected', 'Pusher runtime unavailable');
      return () => {};
    }

    pusherClient = new PusherClient(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
    });

    const connection = pusherClient?.connection;
    if (connection?.bind) {
      connection.bind('connected', () => publishRealtimeStatus('connected', 'Realtime queue live'));
      connection.bind('connecting', () => publishRealtimeStatus('reconnecting', 'Connecting to live queue...'));
      connection.bind('unavailable', () => publishRealtimeStatus('disconnected', 'Realtime unavailable'));
      connection.bind('disconnected', () => publishRealtimeStatus('disconnected', 'Realtime disconnected'));
    }

    queueChannel = pusherClient.subscribe(PUSHER_CHANNEL);
    queueChannel.bind('queue.order.created', (payload) => handleQueueEvent(payload));
    queueChannel.bind('queue.order.updated', (payload) => handleQueueEvent(payload));

    publishRealtimeStatus('reconnecting', 'Connecting to live queue...');

    return () => {
      if (!pusherClient) {
        return;
      }

      if (queueChannel) {
        queueChannel.unbind('queue.order.created');
        queueChannel.unbind('queue.order.updated');
        pusherClient.unsubscribe(PUSHER_CHANNEL);
        queueChannel = null;
      }

      if (connection?.unbind) {
        connection.unbind('connected');
        connection.unbind('connecting');
        connection.unbind('unavailable');
        connection.unbind('disconnected');
      }

      pusherClient.disconnect();
      pusherClient = null;
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
