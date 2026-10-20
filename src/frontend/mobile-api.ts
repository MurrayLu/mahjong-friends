import { imageMessage } from "./image-processing";
const messages: Record<string, string> = {
  SiteAdminRequired:
    "無法確認網站管理員身分，存取已拒絕。請重新以指定 Google 帳號登入。",
  AdminReadOnly: "管理監看模式僅供唯讀查看。",
  GroupNotFound: "找不到這個麻吉局，可能已被刪除。",
  InvalidSort: "不支援此排序方式。",
  InvalidSearch: "搜尋文字過長。",
  InvalidHighlightReaction: "請選擇讚或倒讚。",
  InvalidHighlightComment: "留言請填寫 1～500 字。",
  HighlightCommentNotFound: "這則留言已不存在，請重新整理。",
  HighlightCommentWriteAccessRequired: "只有留言者或管理員可以刪除這則留言。",
  LastRoomAdminRequired: "請先任命另一位管理員，再進行此操作。",
  RoomAdminRequired: "只有麻吉局管理員可以進行此操作。",
  HighlightWriteAccessRequired:
    "只有精華發布者或麻吉局管理員可以編輯、刪除這則精華。",
  RoomDeletionNameMismatch: "麻吉局名稱不符，請輸入完整名稱。",
  RoomDeletionChanged: "麻吉局名稱或管理權限已變更，請重新開啟確認視窗。",
  PlayerWriteAccessRequired:
    "只有本人或管理員可以修改這位牌咖；未認領牌咖由管理員修改。",
  AdminRequiresActiveMember: "請先讓對方成為麻吉局牌咖，再任命管理員。",
  MemberNotFound: "這位牌咖已不在麻吉局，請重新整理。",
  GroupWriteAccessRequired: "目前是旁觀者，成為牌咖後才能修改紀錄。",
  PlayerClaimUnavailable: "這個角色已被認領，或你已有牌咖身份。請重新選擇。",
  Unauthorized: "此裝置身份已失效，請重新開一桌或加入麻吉局。",
  GroupMembershipRequired: "你還不是這個麻吉局的牌咖或旁觀者。",
  InviteNotFound: "找不到這個邀請，請向朋友取得新的連結。",
  InvalidDateRange: "開始日期不能晚於結束日期。",
  DateRangeOutsideAvailableBounds: "請選擇麻吉局有牌局資料的日期範圍。",
  InvalidPagination: "無法載入更多紀錄，請重新整理。",
  InvalidDisplayName: "請填寫有效的暱稱。",
  InvalidGroupName: "請填寫麻吉局名稱。",
  InvalidName: "請填寫場次名稱。",
  InvalidHandCount: "將數請填 1 以上的整數，或留白。",
  InvalidNetAmount: "輸贏請填寫整數。",
  InvalidAmount: "金額請填寫整數。",
  InvalidRateMajor: "底請填 0 以上的整數。",
  InvalidRateMinor: "台請填 0 以上的整數。",
  InvalidRecordDate: "請選擇有效日期。",
  AtLeastFourPlayersRequired: "至少選擇 4 位牌咖才能結算。",
  HighlightRequiresContent: "照片、名稱、備註或金額，至少填寫一項。",
  HighlightSessionMismatch: "請選擇精華當天的場次。",
  GoogleOAuthNotConfigured: "Google 帳號連結尚未開放。",
  GoogleAccountMergeRequired: "此 Google 已有其他紀錄，目前無法合併帳號。",
  AccountAlreadyLinked: "此身份已連結另一個 Google 帳號。",
  InvalidOrigin: "請從本站重新操作。",
  FREE_TIER_LIMIT_REACHED: "目前免費服務額度已達上限，請稍後再試。",
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method,
      headers:
        body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Error("連線中斷，請稍後再試。");
  }
  const data = (await response.json()) as {
    error?: string;
    CurrentTotal?: string;
  };
  if (!response.ok)
    throw Error(
      data.error === "SettlementNotBalanced"
        ? `還沒平帳，目前差 $${data.CurrentTotal}`
        : messages[data.error || ""] ||
            (data.error?.startsWith("IMAGE_")
              ? imageMessage(data.error)
              : "操作未完成，請稍後再試。"),
    );
  return data as T;
}
