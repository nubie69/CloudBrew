export const ORDER_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
};

export const DRINK_OPTIONS = ['Espresso', 'Americano', 'Cappuccino', 'Latte', 'Mocha'];

export const SIZE_OPTIONS = ['Small', 'Medium', 'Large'];

export const ADD_ON_OPTIONS = ['Extra Shot', 'Soy Milk', 'Oat Milk', 'Caramel', 'Whipped Cream'];

export function generateOrderId(prefix = 'ORD') {
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${Date.now()}-${random}`;
}

export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

export function toListFromMultiline(text) {
  return text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toMultilineText(items = []) {
  return items.join('\n');
}

export function summarizeOrders(orders = []) {
  return orders.reduce(
    (summary, order) => {
      summary.total += 1;
      summary[order.status] = (summary[order.status] || 0) + 1;
      return summary;
    },
    { total: 0, [ORDER_STATUS.PENDING]: 0, [ORDER_STATUS.IN_PROGRESS]: 0, [ORDER_STATUS.COMPLETED]: 0 }
  );
}
