/**
 * 工单实时轮询 composable
 * 统一 admin/TicketDetail.vue 与 dashboard/TicketDetail.vue 的轮询逻辑，
 * 消除两端约 80 行重复代码。
 *
 * 使用方式：
 *   const polling = useTicketPolling({
 *     fetchDetail: async () => { ... return { messages, ticket } },
 *     onUpdate: (data) => { ... 更新本地 ticket / messages ... },
 *     scrollRef: chatListRef,
 *     isClosed: () => isClosed.value,
 *   });
 *   polling.startPolling();   // 在 onMounted 调用
 *   polling.stopPolling();    // 在 onBeforeUnmount 调用
 *   await polling.silentRefresh();  // 回复后立即刷新
 */
import { ref, nextTick, type Ref } from 'vue';

export interface PollingOptions<TData, TMessage extends { id?: number }> {
  /** 拉取最新详情的函数（返回包含 messages 的数据） */
  fetchDetail: () => Promise<TData>;
  /** 从返回数据中提取 messages 数组 */
  getMessages: (data: TData) => TMessage[];
  /** 数据更新回调（调用方在此更新本地响应式数据） */
  onUpdate: (data: TData, newMessages: TMessage[]) => void;
  /** 聊天列表 DOM 引用，用于自动滚动 */
  scrollRef: Ref<HTMLElement | null>;
  /** 判断工单是否已关闭（关闭后停止轮询） */
  isClosed: () => boolean;
  /** 轮询间隔，默认 8000ms */
  interval?: number;
}

export function useTicketPolling<TData, TMessage extends { id?: number }>(
  options: PollingOptions<TData, TMessage>,
) {
  const { fetchDetail, getMessages, onUpdate, scrollRef, isClosed, interval = 8000 } = options;

  // 新消息 id 集合（用于高亮标注）
  const newMessageIds = ref<Set<number>>(new Set());
  // 自动滚动开关
  const autoScroll = ref(true);
  // 轮询定时器
  let pollTimer: number | null = null;

  const POLL_INTERVAL = interval;

  function isPolling(): boolean {
    return pollTimer !== null;
  }

  function startPolling() {
    if (pollTimer !== null) return;
    pollTimer = window.setInterval(async () => {
      if (isClosed()) {
        stopPolling();
        return;
      }
      await silentRefresh();
    }, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // 上次已知的最大 message id（用于检测新消息）
  let lastKnownMaxId = 0;

  /** 静默刷新：不显示 loading，检测新消息并标注 */
  async function silentRefresh() {
    try {
      const data = await fetchDetail();
      const allMsgs = getMessages(data);
      // 新消息 = id 大于上次已知最大 id 的消息
      const newMsgs = allMsgs.filter((m) => m.id && m.id > lastKnownMaxId);
      // 更新已知最大 id
      if (allMsgs.length) {
        const maxId = Math.max(...allMsgs.map((m) => m.id || 0));
        lastKnownMaxId = Math.max(lastKnownMaxId, maxId);
      }
      // 通知调用方更新本地数据
      onUpdate(data, newMsgs);
      // 有新消息时标注 + 自动滚动
      if (newMsgs.length > 0) {
        for (const m of newMsgs) {
          if (m.id) newMessageIds.value.add(m.id);
        }
        if (autoScroll.value) {
          await nextTick();
          scrollToBottom();
        }
      }
    } catch {
      // 静默失败
    }
  }

  /** 初始化已知最大 id（首次加载时调用） */
  function initKnownMaxId(messages: TMessage[]) {
    lastKnownMaxId = messages.length ? Math.max(...messages.map((m) => m.id || 0)) : 0;
  }

  function scrollToBottom() {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
    }
  }

  function isNewMessage(msgId: number | undefined): boolean {
    return !!msgId && newMessageIds.value.has(msgId);
  }

  function handleChatScroll() {
    if (!scrollRef.value) return;
    const el = scrollRef.value;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    autoScroll.value = atBottom;
  }

  /** 标记某条消息为新消息（用于本地发送后立即标注） */
  function markAsNew(id: number) {
    if (id) {
      newMessageIds.value.add(id);
      lastKnownMaxId = Math.max(lastKnownMaxId, id);
    }
  }

  return {
    POLL_INTERVAL,
    newMessageIds,
    autoScroll,
    isPolling,
    startPolling,
    stopPolling,
    silentRefresh,
    scrollToBottom,
    isNewMessage,
    handleChatScroll,
    markAsNew,
    initKnownMaxId,
  };
}
