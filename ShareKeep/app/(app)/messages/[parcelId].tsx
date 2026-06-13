import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';
import { ScreenHeader, EmptyState } from '../../../components/ui';
import {
  fetchMessages,
  sendMessage,
  subscribeMessages,
  type HandoverMessage,
} from '../../../features/messages';

export default function MessagesScreen() {
  const params = useLocalSearchParams<{ parcelId?: string }>();
  // useLocalSearchParams は string | string[] を返しうるため string に正規化
  const parcelId = Array.isArray(params.parcelId) ? params.parcelId[0] : params.parcelId;

  const [messages, setMessages] = useState<HandoverMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<HandoverMessage>>(null);
  // 取得の世代番号。別 parcel へ遷移した直後に古い fetch が解決して別チャットを
  // 上書きするのを防ぐ。
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!parcelId) return;
    const seq = ++loadSeqRef.current;
    try {
      const data = await fetchMessages(parcelId);
      if (seq !== loadSeqRef.current) return; // 古い結果は捨てる
      setMessages(data);
      setError(null);
    } catch {
      if (seq !== loadSeqRef.current) return;
      setError('メッセージの取得に失敗しました。');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [parcelId]);

  useEffect(() => {
    if (!parcelId) {
      setLoading(false);
      setError('荷物が指定されていません。');
      return;
    }
    // deeplink 等で不正値が来ると Realtime filter / クエリが壊れるため UUID を検証。
    if (!isValidUuid(parcelId)) {
      setLoading(false);
      setError('荷物IDが不正です。');
      return;
    }

    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active) setMyUserId(user?.id ?? null);
    });

    load();

    // Realtime: 新着・変更があれば再取得
    const unsubscribe = subscribeMessages(parcelId, () => {
      load();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [parcelId, load]);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || !parcelId || sending) return;
    setSending(true);
    try {
      await sendMessage(parcelId, body);
      setInput('');
      await load();
    } catch {
      setError('メッセージの送信に失敗しました。');
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: HandoverMessage }) => {
    const isMine = !!myUserId && item.sender_id === myUserId;
    return (
      <View style={[styles.bubbleRow, isMine ? styles.rowMine : styles.rowOther]}>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isMine ? styles.textMine : styles.textOther]}>
            {item.body}
          </Text>
          <Text style={[styles.time, isMine ? styles.timeMine : styles.timeOther]}>
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="メッセージ" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.green} />
          </View>
        ) : error && messages.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.grayLight} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <EmptyState
                icon="chatbubbles-outline"
                message="まだメッセージはありません"
                style={styles.empty}
              />
            }
          />
        )}

        {/* 会話がある状態での送信/取得エラーは中央表示に出ないため、入力欄上にバナー表示 */}
        {error && messages.length > 0 ? (
          <Text style={styles.inlineError}>{error}</Text>
        ) : null}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="メッセージを入力"
            placeholderTextColor={colors.grayLight}
            multiline
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="send" size={18} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  empty: { paddingTop: 80 },
  errorText: { fontSize: 15, color: colors.gray },
  inlineError: { fontSize: 12, color: '#DC2626', textAlign: 'center', paddingVertical: 4, paddingHorizontal: 16 },
  listContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  bubbleMine: { backgroundColor: colors.green, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.white, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  textMine: { color: colors.white },
  textOther: { color: colors.ink },
  time: { fontSize: 11, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(255,255,255,0.7)' },
  timeOther: { color: colors.grayLight },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    backgroundColor: colors.fieldBg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: colors.grayLight },
});
