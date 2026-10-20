export type MahjongType = "Traditional" | "American" | "Mixed";
export interface UserAccount {
  Id: string;
  GoogleSubjectId: string | null;
  Email: string | null;
  /** Display identity shared with the user's claimed active Players. */
  DisplayName: string;
  CreatedAt: string;
  UpdatedAt: string;
  /** Query projection of the current account avatar; image metadata is stored separately. */
  AvatarImageUrl?: string | null;
  MottoQuoteId?: string | null;
}
/** Public account projection. Google subject and authentication internals stay server-side. */
export interface AccountView {
  Id: string;
  DisplayName: string;
  Email: string | null;
  AccountState: "anonymous" | "google-linked";
  AvatarImageUrl?: string | null;
  MottoQuoteId?: string | null;
}
export function accountView(user: UserAccount): AccountView {
  return {
    Id: user.Id,
    DisplayName: user.DisplayName,
    Email: user.Email,
    AccountState: user.GoogleSubjectId === null ? "anonymous" : "google-linked",
    AvatarImageUrl: user.AvatarImageUrl ?? null,
    MottoQuoteId: user.MottoQuoteId ?? null,
  };
}
export interface Group {
  Id: string;
  Name: string;
  OwnerUserId: string;
  InviteCode: string;
  CreatedAt: string;
  UpdatedAt: string;
}
export interface GroupMember {
  AccessLevel: "Member" | "Viewer";
  GroupId: string;
  UserId: string;
  JoinedAt: string;
}
/** Membership-specific read projection; Viewer invite codes are never disclosed. */
export interface GroupView extends Omit<Group, "InviteCode"> {
  RatePresets?: import("./rate-presets").RatePreset[];
  InviteCode: string | null;
  AccessLevel: GroupMember["AccessLevel"];
  IsAdmin: number;
}
export interface Player {
  Id: string;
  GroupId: string;
  UserId: string | null;
  /** Display identity for results and aggregates; the owner can sync it with the account. */
  DisplayName: string;
  IsGuest: number;
  IsArchived: number;
  CreatedAt: string;
  UpdatedAt: string;
  AvatarImageUrl: string | null;
}
/** Query/output projection only. Email belongs to UserAccount, never Player storage. */
export interface PlayerView extends Player {
  Email: string | null;
}
export interface DayRecord {
  Id: string;
  GroupId: string;
  RecordDate: string;
  CreatedAt: string;
}
export interface Session {
  Id: string;
  DayRecordId: string;
  Name: string;
  MahjongType: MahjongType;
  RateMajor: number;
  RateMinor: number;
  HandCount: number | null;
  CreatedByUserId: string;
  CreatedAt: string;
  UpdatedByUserId: string;
  UpdatedAt: string;
}
export interface SessionResult {
  SessionId: string;
  PlayerId: string;
  NetAmount: number;
}
export interface Highlight {
  Id: string;
  DayRecordId: string;
  SessionId: string | null;
  PlayerId: string | null;
  Title: string | null;
  Note: string | null;
  ImageUrl: string | null;
  CreatedByUserId: string;
  CreatedAt: string;
  UpdatedAt: string;
  Amount: number | null;
}
export interface SessionInput {
  RecordDate: string;
  Name?: string;
  MahjongType?: MahjongType;
  RateMajor?: number;
  RateMinor?: number;
  HandCount?: number | null;
}
export type SessionUpdate = Partial<Omit<SessionInput, "RecordDate">>;
export interface ResultInput {
  PlayerId: string;
  NetAmount: number;
}
export interface HighlightInput {
  RecordDate: string;
  SessionId?: string | null;
  PlayerId?: string | null;
  Title?: string | null;
  Note?: string | null;
  ImageUrl?: string | null;
  Amount?: number | null;
}
export interface LeaderboardRow {
  PlayerId: string;
  DisplayName: string;
  AvatarImageUrl: string | null;
  NetAmount: number;
  SessionsPlayed: number;
  AveragePerSession: number;
}

export interface GroupAdmin {
  GroupId: string;
  UserId: string;
  CreatedAt: string;
  AppointedByUserId: string | null;
}
export interface RoomMemberView {
  UserId: string;
  DisplayName: string;
  Email: string | null;
  AccessLevel: GroupMember["AccessLevel"];
  IsAdmin: number;
  PlayerId: string | null;
  AvatarImageUrl: string | null;
}
