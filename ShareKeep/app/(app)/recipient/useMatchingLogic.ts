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
  type ExcludedAgent,
} from '../../../features/recommend';

export type MatchingMode = 'loading' | 'select' | 'error';

export type MatchingLogic = {
  mode: MatchingMode;
  // mode==='error' のときに表示する失敗理由メッセージ。
  errorMessage: string | null;
  retry: () => void;
  candidates: RecommendedAgent[];
  // ハードフィルタで除外された候補（「除外された候補」セクションで理由を開示）。
  excluded: ExcludedAgent[];
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RecommendedAgent[]>([]);
  const [excluded, setExcluded] = useState<ExcludedAgent[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // 再試行トリガ。インクリメントすると候補取得 effect が再実行される。
  const [attempt, setAttempt] = useState(0);
  const cancelledRef = useRef(false);

  const retry = useCallback(() => {
    setMode('loading');
    setErrorMessage(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    if (!parcelId) return;
    let cancelled = false;
    setMode('loading');
    setErrorMessage(null);

    // 失敗時の共通ハンドラ: error モードへ遷移しメッセージを表示する（loading のまま固まらせない）。
    const fail = (message: string) => {
      if (cancelled) return;
      setErrorMessage(message);
      setMode('error');
    };

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
          if (cancelled) return;
          if (status !== 'granted') {
            fail('近くの代理人を探すには位置情報の利用許可が必要です。設定から許可してください。');
            return;
          }
          const position = await Location.getCurrentPositionAsync({});
          if (cancelled) return;
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        } catch {
          fail('現在地の取得に失敗しました。位置情報を有効にしてからお試しください。');
          return;
        }
      }

      // ML推薦サービスが有効なら候補をスコア順で取得。無効・失敗時はフォールバック。
      let agents: RecommendedAgent[] = [];
      let excludedAgents: ExcludedAgent[] = [];

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
          // 個人NG/満枠/審査外などで除外された候補（理由付き）。UIで開示する。
          excludedAgents = result.excluded;
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
          fail('代理人の取得に失敗しました。しばらくしてからお試しください。');
          return;
        }
      }

      if (cancelled) return;
      setCandidates(agents);
      setExcluded(excludedAgents);
      // 先頭候補を初期選択
      if (agents.length > 0) setSelectedIds([agents[0].agent_id]);
      setMode('select');
    };

    void start();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, [parcelId, attempt]);

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
    Alert.alert('登録しました', '代理人候補を保存しました。配達員が割り当てると請負が開始します。');
    router.back();
  }, [parcelId, selectedIds, saving]);

  return { mode, errorMessage, retry, candidates, excluded, selectedIds, saving, toggleAgent, moveUp, moveDown, confirmWhitelist };
}
