-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Quiz" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "date" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "defaultAudienceLevel" TEXT NOT NULL DEFAULT 'medium',
    "areaName" TEXT,
    "moderatorPin" TEXT NOT NULL DEFAULT '1234',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_Quiz" ("areaName", "createdAt", "date", "defaultAudienceLevel", "deletedAt", "description", "id", "name", "status", "updatedAt") SELECT "areaName", "createdAt", "date", "defaultAudienceLevel", "deletedAt", "description", "id", "name", "status", "updatedAt" FROM "Quiz";
DROP TABLE "Quiz";
ALTER TABLE "new_Quiz" RENAME TO "Quiz";
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
    "isQualifier" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "audienceLevel" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "Round_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Round" ("audienceLevel", "bonusPointsPerQuestion", "createdAt", "deletedAt", "gameMode", "id", "name", "order", "pointsPerQuestion", "questionCount", "quizId", "status", "timerSeconds") SELECT "audienceLevel", "bonusPointsPerQuestion", "createdAt", "deletedAt", "gameMode", "id", "name", "order", "pointsPerQuestion", "questionCount", "quizId", "status", "timerSeconds" FROM "Round";
DROP TABLE "Round";
ALTER TABLE "new_Round" RENAME TO "Round";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
