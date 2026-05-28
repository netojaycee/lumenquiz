-- Add defaultAudienceLevel to Quiz
ALTER TABLE "Quiz" ADD COLUMN "defaultAudienceLevel" TEXT NOT NULL DEFAULT 'medium';

-- Add joinCode to Team
ALTER TABLE "Team" ADD COLUMN "joinCode" TEXT;
CREATE UNIQUE INDEX "Team_joinCode_key" ON "Team"("joinCode");

-- Add audienceLevel to Round
ALTER TABLE "Round" ADD COLUMN "audienceLevel" TEXT NOT NULL DEFAULT 'medium';

-- Add clues to Question
ALTER TABLE "Question" ADD COLUMN "clues" TEXT NOT NULL DEFAULT '[]';

-- Create AudienceInteraction table
CREATE TABLE "AudienceInteraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT,
    "type" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AudienceInteraction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "AudienceMember" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Redefine Session to remove the audienceCode column (no longer in schema)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quizId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentRoundId" TEXT,
    "currentQuestionId" TEXT,
    "sessionCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "Session_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("createdAt", "currentQuestionId", "currentRoundId", "endedAt", "id", "quizId", "sessionCode", "status")
    SELECT "createdAt", "currentQuestionId", "currentRoundId", "endedAt", "id", "quizId", "sessionCode", "status" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_sessionCode_key" ON "Session"("sessionCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
