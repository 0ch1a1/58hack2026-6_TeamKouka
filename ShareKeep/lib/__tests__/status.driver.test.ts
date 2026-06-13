import { DRIVER_STATUS_LABEL, driverActionsFor } from '../status';
import { PARCEL_STATUS } from '../status';
import type { ParcelStatus } from '../database.types';

describe('DRIVER_STATUS_LABEL', () => {
  it('全 ParcelStatus を網羅して日本語ラベルを持つ', () => {
    const statuses = Object.values(PARCEL_STATUS) as ParcelStatus[];
    for (const s of statuses) {
      expect(DRIVER_STATUS_LABEL[s]).toBeTruthy();
      expect(typeof DRIVER_STATUS_LABEL[s]).toBe('string');
    }
  });
});

describe('driverActionsFor', () => {
  it('created → 配達開始(start)', () => {
    expect(driverActionsFor('created')).toEqual(['start']);
  });

  it('out_for_delivery → 不在報告(fail)', () => {
    expect(driverActionsFor('out_for_delivery')).toEqual(['fail']);
  });

  it('delivery_failed → 代理人を探す(match)', () => {
    expect(driverActionsFor('delivery_failed')).toEqual(['match']);
  });

  it('agent_assigned → 代理人QRを読む(scan)', () => {
    expect(driverActionsFor('agent_assigned')).toEqual(['scan']);
  });

  it('配達員操作のない状態は空配列（none を返さない）', () => {
    expect(driverActionsFor('delivered_to_agent')).toEqual([]);
    expect(driverActionsFor('handed_to_recipient')).toEqual([]);
    expect(driverActionsFor('completed')).toEqual([]);
  });

  it('未知の値・null も空配列にフォールバック', () => {
    expect(driverActionsFor(null)).toEqual([]);
    expect(driverActionsFor('unknown_status')).toEqual([]);
  });
});
