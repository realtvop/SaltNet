import type { Shop } from "./Shop";

// 用户信息的接口
interface User {
    _id: string;
    id: string;
    name: string;
    email: string;
    image: string;
    joinedAt: string;
    lastActiveAt: string;
    // userType 的值可能是固定的几种，可以考虑使用联合类型（Union Type）
    // 例如：userType: 'site_admin' | 'regular_user' | 'guest';
    userType: string;
    bio: string;
    displayName: string;
    updatedAt: string;
    frequentingArcades: Shop[];
    starredArcades: Shop[];
}

// 已登记的用户信息
interface RegisteredUser {
    userId: string;
    gameId: number;
    attendedAt: string;
    plannedLeaveAt: string;
    user: User;
}

// 上报的出勤信息
interface ReportedInfo {
    gameId: number;
    currentAttendances: number;
    reportedBy: string;
    reportedAt: string;
    reporter: User;
}

// 根对象的接口
export interface AttendanceApiResponse {
    success: boolean;
    total: number;
    registered: RegisteredUser[];
    reported: ReportedInfo[];
}