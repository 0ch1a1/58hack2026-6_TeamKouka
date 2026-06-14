import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../../lib/supabase';
import { isStoredAtAgent } from '../../../lib/status';
import { SEARCH_RADIUS_M } from '../../../lib/constants';
import {
  matchNearbyAgent,
  assignAgentToParcel,
  subscribeParcel,
  fetchParcel,
  fetchRecipientCoordinates,
} from '../../../features/parcels';
import {
  recommendAgents,
  markRecommendationChosen,
  isRecommendationEnabled,
  type RecommendedAgent,
  type ExcludedAgent,
} from '../../../features/recommend';

export type MatchingMode = 'loading' | 'select' | 'waiting';

export type MatchingLogic = {
  mode: MatchingMode;
  candidates: RecommendedAgent[];
  // フィルタで除外された候補（「除外された候補」セクションで開示）。
  excluded: ExcludedAgent[];
  selectedId: string | null;
  assigning: boolean;
  selectAgent: (agentId: string) => void;
  confirmSelection: () => Promise<void>;
};

// matching 画面の状態管理＋非同期フロー（位置情報→推薦→自動マッチ／割り当て→待機）を集約するフック。
// UI は受け取った状態を描画するだけにし、features/* の関数はここで consume する（純粋リファクタリング）。
export function useMatchingLogic(parcelId: string | undefined): MatchingLogic {
  const [mode, setMode] = useState<MatchingMode>('loading');
  const [candidates, setCandidates] = useState<RecommendedAgent[]>([]);
  const [excluded, setExcluded] = useState<ExcludedAgent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  // 購読解除関数。select→waiting で後から張るため ref で保持し、unmount 時に確実に解除する。
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);

  // 代理人が保管状態（delivered_to_agent）になったら pickup-ready へ遷移
  const checkAndNavigate = useCallback(async () => {
    if (!parcelId) return;
    try {
      const parcel = await fetchParcel(parcelId);
      if (!cancelledRef.current && parcel && isStoredAtAgent(parcel.status)) {
        router.replace({ pathname: '/(app)/recipient/pickup-ready', params: { parcelId } });
      }
    } catch {
      // 状態取得に失敗しても待機画面は維持する（次の更新で再試行）
    }
  }, [parcelId]);

  // 保管状態への遷移を購読し、待機モードへ。割り当て確定後・自動マッチ後の共通処理。
  const beginWaiting = useCallback(() => {
    if (cancelledRef.current || !parcelId) return;
    setMode('waiting');
    unsubscribeRef.current = subscribeParcel(parcelId, () => {
      void checkAndNavigate();
    });
    // 既に保管状態の可能性に備えて初回チェック
    void checkAndNavigate();
  }, [parcelId, checkAndNavigate]);

  // 推薦が使えない／失敗した場合の従来どおりの自動マッチ。
  const fallbackAutoMatch = useCallback(
    async (latitude: number, longitude: number) => {
      try {
        await matchNearbyAgent({ parcelId: parcelId!, latitude, longitude, radiusMeters: SEARCH_RADIUS_M });
      } catch {
        Alert.alert('エラー', '代理人の手配に失敗しました。しばらくしてからもう一度お試しください。');
        return;
      }
      beginWaiting();
    },
    [parcelId, beginWaiting],
  );

  useEffect(() => {
    cancelledRef.current = false;

    if (!parcelId) {
      return;
    }

    // この effect 世代の中断フラグ。parcelId 変更で旧世代が走り続けても
    // stale な結果で setState しないよう、共有 ref とは別にローカルで持つ。
    let cancelled = false;

    const start = async () => {
      // 0. 受取人=ログイン中ユーザ。recommendation_logs.recipient_id を埋めるため送る
      //    （送らないと RLS の「本人のみ参照」経路が成立しない）。
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      const recipientId = user?.id;

      // 1. 距離の起点を決める。登録済みの自宅座標を優先し（0タップ・現在地に依存しない）、
      //    未登録のときだけ端末GPSの現在地にフォールバックする。
      let latitude: number;
      let longitude: number;

      let home: { latitude: number; longitude: number } | null = null;
      if (recipientId) {
        try {
          home = await fetchRecipientCoordinates(recipientId);
        } catch {
          home = null; // 取得失敗時はGPSにフォールバック
        }
      }
      if (cancelled) return;

      if (home) {
        latitude = home.latitude;
        longitude = home.longitude;
      } else {
        // 現在地を取得（権限拒否時は待機画面のまま・クラッシュさせない）
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('位置情報の許可が必要です', '近くの代理人を探すために位置情報の利用を許可してください。');
            return;
          }
          const position = await Location.getCurrentPositionAsync({});
          if (cancelled) return;
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        } catch {
          Alert.alert('エラー', '現在地の取得に失敗しました。位置情報を有効にしてからお試しください。');
          return;
        }
      }

      // 2. 推薦サービスが使えるなら候補をスコア順で取得 → 選択 UI。
      //    未設定・失敗・候補ゼロ時は従来の自動マッチへフォールバック。
      if (!isRecommendationEnabled()) {
        await fallbackAutoMatch(latitude, longitude);
        return;
      }

      try {
        const { agents, excluded: excludedAgents } = await recommendAgents({
          parcelId,
          recipientId,
          latitude,
          longitude,
          radiusMeters: SEARCH_RADIUS_M,
          topK: 8,
        });
        if (cancelled) return;
        if (agents.length === 0) {
          // 圏内に候補なし → 自動マッチも空振りする可能性が高いが、従来挙動に委ねる
          await fallbackAutoMatch(latitude, longitude);
          return;
        }
        setCandidates(agents);
        setExcluded(excludedAgents);
        setSelectedId(agents[0]?.agent_id ?? null);
        setMode('select');
      } catch {
        // サービス障害時はデモを止めないため自動マッチへ。
        // 画面離脱後に reject した場合は割り当てを走らせない。
        if (cancelled) return;
        await fallbackAutoMatch(latitude, longitude);
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelId]);

  const selectAgent = useCallback((agentId: string) => {
    setSelectedId(agentId);
  }, []);

  const confirmSelection = useCallback(async () => {
    if (!parcelId || !selectedId || assigning) return;
    const chosen = candidates.find((c) => c.agent_id === selectedId);
    if (!chosen) return;

    setAssigning(true);
    try {
      await assignAgentToParcel({
        parcelId,
        agentId: chosen.agent_id,
        distanceMeters: chosen.distance_meters,
      });
    } catch {
      if (cancelledRef.current) return;
      setAssigning(false);
      Alert.alert('エラー', '代理人の確定に失敗しました。もう一度お試しください。');
      return;
    }

    // 選択ラベルの記録は再学習用の付帯処理。失敗しても確定フローは止めない。
    try {
      await markRecommendationChosen(parcelId, chosen.agent_id);
    } catch {
      // ログ更新失敗は無視（推薦ログが無い／RLS 等。割り当て自体は成功済み）
    }

    // 確定中に画面を離れた場合は state 更新・購読開始しない（beginWaiting も内部で弾く）
    if (cancelledRef.current) return;
    setAssigning(false);
    beginWaiting();
  }, [parcelId, selectedId, assigning, candidates, beginWaiting]);

  return { mode, candidates, excluded, selectedId, assigning, selectAgent, confirmSelection };
}
