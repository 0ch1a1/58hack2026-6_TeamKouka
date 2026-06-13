import { render, act, waitFor } from '@testing-library/react-native';

// expo-router をモック。useFocusEffect は「マウント時に1回 cb を呼ぶ（初回 focus 相当）」+
// 登録中の cb を global に退避し、テストから再 focus を手動発火できるようにする。
// 画面内に複数の useFocusEffect 利用者（DriverHomeScreen と NotificationBell）が居るため、
// 単一変数では後勝ちで上書きされる。配列で全 cb を保持し、テストは全件発火する
// （fetchDriverParcels に効くのは DriverHomeScreen の cb だけなので検証意図は保たれる）。
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        const arr = ((global as any).__focusCbs ||= []);
        arr.push(cb);
        cb(); // 初回 focus 相当
        return () => {
          const i = arr.indexOf(cb);
          if (i >= 0) arr.splice(i, 1);
        };
      }, [cb]);
    },
  };
});

// 現在登録中の全 focus cb を発火する（画面復帰の模擬）。
function fireFocus() {
  for (const cb of ((global as any).__focusCbs ?? []).slice()) cb();
}

// 画面が依存する features をモック（factory 内で jest.fn を生成し、後で import して参照）。
jest.mock('../../../../features/parcels', () => ({
  fetchDriverParcels: jest.fn().mockResolvedValue([]),
  startDelivery: jest.fn().mockResolvedValue(undefined),
  reportDeliveryFailed: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../features/auth', () => ({
  signOut: jest.fn().mockResolvedValue(undefined),
}));
// 通知（ベル）系。マウント effect で subscribeNotifications / 未読件数取得を呼ぶため最小モック。
jest.mock('../../../../features/notifications', () => ({
  getUnreadNotificationCount: jest.fn().mockResolvedValue(0),
  subscribeNotifications: jest.fn(() => () => {}),
}));
// lib/supabase は import 時に createClient(env) を実行するため、UI 単体テストでは丸ごとモックする。
// マウント effect の supabase.auth.getUser() がダミー user を返すと refresh() が走る（=初期ロード1回）。
jest.mock('../../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'driver-test-1' } } }),
    },
  },
}));

import { fetchDriverParcels } from '../../../../features/parcels';
import DriverHomeScreen from '../index';

const mockFetch = fetchDriverParcels as jest.Mock;

describe('DriverHomeScreen focus 再取得', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    (global as any).__focusCbs = [];
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
      fireFocus();
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});
