import 'express-session'

declare module 'express-session' {
  interface SessionData {
    isAdmin?: boolean;
    userId?: string;
    userEmail?: string;
    userRole?: string;
    userAreaName?: string | null;
  }
}
