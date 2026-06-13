import { render, act, waitFor } from '@testing-library/react-native';

// expo-router をモック。useFocusEffect は「マウント時に1回 cb を呼ぶ（初回 focus 相当）」+
// 最新 cb を global に退避し、テストから再 focus を手動発火できるようにする。
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
    useFocusEffect: (cb: () => void) => {
      (global as any).__focusCb = cb;
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

// 画面が依存する features をモック（factory 内で jest.fn を生成し、後で import して参照）。
jest.mock('../../../../features/parcels', () => ({
  fetchDriverParcels: jest.fn().mockResolvedValue([]),
  startDelivery: jest.fn().mockResolvedValue(undefined),
  reportDeliveryFailed: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../features/auth', () => ({
  signOut: jest.fn().mockResolvedValue(undefined),
}));

import { fetchDriverParcels } from '../../../../features/parcels';
import DriverHomeScreen from '../index';

const mockFetch = fetchDriverParcels as jest.Mock;

describe('DriverHomeScreen focus 再取得', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    (global as any).__focusCb = undefined;
  });

  it('マウント時は初期ロードのみ（初回 focus はスキップして二重取得しない）', async () => {
    render(<DriverHomeScreen />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });

  it('2回目以降の focus（画面復帰）で再取得する', async () => {
    render(<DriverHomeScreen />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // agents/scan から戻った時を模して focus コールバックを再発火。
    await act(async () => {
      (global as any).__focusCb();
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});
