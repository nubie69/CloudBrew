import { ORDER_STATUS, summarizeOrders, toListFromMultiline } from '../../src/utils/helpers';

describe('helpers', () => {
  it('summarizes orders by status', () => {
    const summary = summarizeOrders([
      { status: ORDER_STATUS.PENDING },
      { status: ORDER_STATUS.IN_PROGRESS },
      { status: ORDER_STATUS.COMPLETED },
      { status: ORDER_STATUS.COMPLETED },
    ]);

    expect(summary.total).toBe(4);
    expect(summary.pending).toBe(1);
    expect(summary['in-progress']).toBe(1);
    expect(summary.completed).toBe(2);
  });

  it('converts multiline text to clean array', () => {
    const output = toListFromMultiline('milk\n\n espresso \nfoam');
    expect(output).toEqual(['milk', 'espresso', 'foam']);
  });
});
