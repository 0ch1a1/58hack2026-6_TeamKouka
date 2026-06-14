import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../../lib/supabase';
import { SEARCH_RADIUS_M } from '../../../lib/constants';
import {
  setAgentWhitelist,
  fetchAgentCandidates,
  fetchRecipientCoordinates,
} from '../../../features/parcels';
import {
  recommendAgents,
  isRecommendationEnabled,
  type RecommendedAgent,
} from '../../../features/recommend';

export type MatchingMode = 'loading' | 'select';

export type MatchingLogic = {
  mode: MatchingMode;
  candidates: RecommendedAgent[];
  // 選択済み代理人ID一覧。順序 = 優先度（先頭が最優先）。
  selectedIds: string[];
  saving: boolean;
  toggleAgent: (agentId: string) => void;
  moveUp: (agentId: string) => void;
  moveDown: (agentId: string) => void;
  confirmWhitelist: () => Promise<void>;
};

export function useMatchingLogic(parcelId: string | undefined): MatchingLogic {
  const [mode, setMode] = useState<MatchingMode>('loading');
  const [candidates, setCandidates] = useState<RecommendedAgent[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!parcelId) return;
    let cancelled = false;

    const start = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      const recipientId = user?.id;

      // 位置情報: 登録済み自宅座標 → GPS の順でフォールバック
      let latitude: number;
      let longitude: number;

      let home: { latitude: number; longitude: number } | null = null;
      if (recipientId) {
        try { home = await fetchRecipientCoordinates(recipientId); } catch { home = null; }
      }
      if (cancelled) return;

      if (home) {
        latitude = home.latitude;
        longitude = home.longitude;
      } else {
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

      // ML推薦サービスが有効なら候補をスコア順で取得。無効・失敗時はフォールバック。
      let agents: RecommendedAgent[] = [];

      if (isRecommendationEnabled()) {
        try {
          const result = await recommendAgents({
            parcelId,
            recipientId,
            latitude,
            longitude,
            radiusMeters: SEARCH_RADIUS_M,
            topK: 8,
          });
          agents = result.agents;
        } catch {
          // fall through to fallback
        }
      }

      // フォールバック: get_recommendation_candidates で距離のみ絞り込み（曜日・時間帯フィルタなし）
      if (agents.length === 0) {
        try {
          const fallbackCandidates = await fetchAgentCandidates({ latitude, longitude, radiusMeters: SEARCH_RADIUS_M });
          if (cancelled) return;
          agents = fallbackCandidates.map((a, i) => ({
            agent_id: a.user_id,
            full_name: a.full_name,
            rank: i + 1,
            score: 0,
            distance_meters: a.distance_meters,
            breakdown: {},
            reasons: [],
          }));
        } catch {
          Alert.alert('エラー', '代理人の取得に失敗しました。しばらくしてからお試しください。');
          return;
        }
      }

      if (cancelled) return;
      setCandidates(agents);
      // 先頭候補を初期選択
      if (agents.length > 0) setSelectedIds([agents[0].agent_id]);
      setMode('select');
    };

    void start();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, [parcelId]);

  // チェックボックスのトグル。未選択→末尾に追加、選択済み→除去。
  const toggleAgent = useCallback((agentId: string) => {
    setSelectedIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    );
  }, []);

  // 優先度を1つ上げる（selectedIds 内で前の要素と入れ替え）。
  const moveUp = useCallback((agentId: string) => {
    setSelectedIds((prev) => {
      const idx = prev.indexOf(agentId);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  // 優先度を1つ下げる（selectedIds 内で次の要素と入れ替え）。
  const moveDown = useCallback((agentId: string) => {
    setSelectedIds((prev) => {
      const idx = prev.indexOf(agentId);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  // ホワイトリストをDBに保存して一覧画面へ戻る。
  const confirmWhitelist = useCallback(async () => {
    if (!parcelId || selectedIds.length === 0 || saving) return;
    setSaving(true);
    try {
      await setAgentWhitelist(parcelId, selectedIds);
    } catch {
      if (cancelledRef.current) return;
      setSaving(false);
      Alert.alert('エラー', 'ホワイトリストの設定に失敗しました。もう一度お試しください。');
      return;
    }
    if (cancelledRef.current) return;
    setSaving(false);
    router.back();
  }, [parcelId, selectedIds, saving]);

  return { mode, candidates, selectedIds, saving, toggleAgent, moveUp, moveDown, confirmWhitelist };
}
