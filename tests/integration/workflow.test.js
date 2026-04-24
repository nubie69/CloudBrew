import { ORDER_STATUS, summarizeOrders } from '../../src/utils/helpers';

describe('cashier to barista workflow', () => {
  it('tracks pending to completed status transitions', () => {
    const orders = [
      { id: '1', status: ORDER_STATUS.PENDING },
      { id: '2', status: ORDER_STATUS.IN_PROGRESS },
      { id: '3', status: ORDER_STATUS.COMPLETED },
    ];

    const result = summarizeOrders(orders);

    expect(result.total).toBe(3);
    expect(result.pending).toBe(1);
    expect(result['in-progress']).toBe(1);
    expect(result.completed).toBe(1);
  });
});
