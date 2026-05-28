/*
  Warnings:

  - You are about to drop the column `nickname` on the `AudienceMember` table. All the data in the column will be lost.
  - Added the required column `fullName` to the `AudienceMember` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AudienceMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connected" BOOLEAN NOT NULL DEFAULT true,
    "socketId" TEXT,
    CONSTRAINT "AudienceMember_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AudienceMember" ("connected", "fingerprint", "id", "joinedAt", "sessionId", "socketId", "totalPoints") SELECT "connected", "fingerprint", "id", "joinedAt", "sessionId", "socketId", "totalPoints" FROM "AudienceMember";
DROP TABLE "AudienceMember";
ALTER TABLE "new_AudienceMember" RENAME TO "AudienceMember";
CREATE TABLE "new_Round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quizId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT,
    "gameMode" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "timerSeconds" INTEGER NOT NULL,
    "pointsPerQuestion" INTEGER NOT NULL,
    "bonusPointsPerQuestion" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "Round_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Round" ("createdAt", "deletedAt", "gameMode", "id", "name", "order", "pointsPerQuestion", "questionCount", "quizId", "status", "timerSeconds") SELECT "createdAt", "deletedAt", "gameMode", "id", "name", "order", "pointsPerQuestion", "questionCount", "quizId", "status", "timerSeconds" FROM "Round";
DROP TABLE "Round";
ALTER TABLE "new_Round" RENAME TO "Round";
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quizId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentRoundId" TEXT,
    "currentQuestionId" TEXT,
    "sessionCode" TEXT,
    "audienceCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "Session_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("audienceCode", "createdAt", "currentQuestionId", "currentRoundId", "endedAt", "id", "quizId", "status") SELECT "audienceCode", "createdAt", "currentQuestionId", "currentRoundId", "endedAt", "id", "quizId", "status" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_sessionCode_key" ON "Session"("sessionCode");
CREATE UNIQUE INDEX "Session_audienceCode_key" ON "Session"("audienceCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
