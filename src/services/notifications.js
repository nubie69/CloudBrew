const subscribers = new Set();

export function subscribeToOrders(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function notifyNewOrder(order) {
  subscribers.forEach((callback) => callback(order));
}
