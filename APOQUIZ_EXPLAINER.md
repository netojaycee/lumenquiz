# ApoQuiz — Platform Explainer & User Guide

> Use this document to produce slides, a video script, or printed support material.
> It covers every role and every step from first login to a completed quiz session.

---

## Table of Contents

1. [What Is ApoQuiz?](#1-what-is-apoquiz)
2. [Roles at a Glance](#2-roles-at-a-glance)
3. [Logging In](#3-logging-in)
4. [User Management](#4-user-management)
   - 4.1 [Admin — Inviting Area Owners](#41-admin--inviting-area-owners)
   - 4.2 [Area Owner — Inviting Members](#42-area-owner--inviting-members)
   - 4.3 [Accepting an Invitation](#43-accepting-an-invitation)
   - 4.4 [Forgot Password](#44-forgot-password)
5. [Creating a Quiz](#5-creating-a-quiz)
6. [Adding Teams](#6-adding-teams)
7. [Adding Rounds](#7-adding-rounds)
8. [Adding Questions](#8-adding-questions)
   - 8.1 [Adding Questions One by One](#81-adding-questions-one-by-one)
   - 8.2 [Bulk Upload via CSV or Excel](#82-bulk-upload-via-csv-or-excel)
9. [Launching a Quiz](#9-launching-a-quiz)
10. [Connecting All Devices](#10-connecting-all-devices)
    - 10.1 [Team Devices](#101-team-devices)
    - 10.2 [Moderator Tablet / Laptop](#102-moderator-tablet--laptop)
    - 10.3 [Projector / Screen Display](#103-projector--screen-display)
    - 10.4 [Audience Members](#104-audience-members)
11. [Running the Quiz Live](#11-running-the-quiz-live)
12. [Viewing Results](#12-viewing-results)
13. [Admin: Filtering Quizzes by Area](#13-admin-filtering-quizzes-by-area)
14. [Quick Reference — URLs & Codes](#14-quick-reference--urls--codes)

---

## 1. What Is ApoQuiz?

ApoQuiz is a live, multi-team Bible quiz platform built for AFM WECA.  
It supports multiple Areas (local branches), each managed by an Owner and their Members.  
The Super Admin manages national quizzes and oversees all areas.

A full quiz session involves:
- A **host dashboard** (web app, typically on a laptop)
- **Team tablets/phones** that receive and answer questions
- A **moderator tablet** to control question flow and scoring
- A **projector screen** showing the live scoreboard and questions
- An **audience** that follows along and participates via their phones

---

## 2. Roles at a Glance

| Role | What they can do |
|------|-----------------|
| **Admin** | Create and manage national quizzes; invite Area Owners; see all areas |
| **Owner** | Create and manage quizzes for their area; invite Members for their area |
| **Member** | Create quizzes, add content, and host sessions for their area |
| **Moderator** | Control the live quiz flow (start rounds, confirm answers, override scores) |
| **Team** | Join a session and answer questions live |
| **Audience** | Follow the quiz on their phone and participate in audience questions |
| **Projector** | Display-only screen showing scores and questions for the room |

---

## 3. Logging In

1. Navigate to the host portal: **`quiz.afmweca.org/host`**
2. Enter your **email address** and **password**.
3. Click **Sign In**.

> First-time users do not set their own password here — they receive an invitation email with a setup link (see Section 4.3).

---

## 4. User Management

### 4.1 Admin — Inviting Area Owners

The Super Admin sets up each Area by inviting its Owner.

1. Log in as **Admin**.
2. Click **Users** in the left sidebar.
3. Fill in the invite form:
   - **Name** and **Email** of the person being invited
   - **Role**: select `OWNER`
   - **Area**: pick the correct area from the dropdown
4. Click **Send Invitation**.

The person receives an email with a **Set Up Password** link valid for 24 hours.

---

### 4.2 Area Owner — Inviting Members

An Owner can invite Members who will help manage and host quizzes for their area.

1. Log in as **Owner**.
2. Click **Users** in the left sidebar.
3. Fill in the invite form:
   - **Name** and **Email**
   - **Role**: select `MEMBER`
   - *(Area is automatically set to your own area — no selection needed)*
4. Click **Send Invitation**.

---

### 4.3 Accepting an Invitation

1. Open the invitation email and click **Set Up Password**.
2. Enter a new password (minimum 6 characters) and confirm it.
3. Click **Activate Account** — you are logged in automatically.

> The link expires after **24 hours**. If it has expired, ask the Admin or Owner to resend the invitation.

---

### 4.4 Forgot Password

1. On the login page, click **Forgot?**
2. Enter your registered email address and click **Send Reset Link**.
3. Open the email and click **Reset Password**.
4. Enter and confirm your new password.
5. You are redirected to the dashboard automatically.

---

## 5. Creating a Quiz

1. Log in to the host portal.
2. Click **New Quiz** (top-right of the Quizzes page).
3. Fill in:
   - **Quiz Name** *(required)*
   - **Date** *(optional — the event date)*
   - **Description** *(optional)*
   - **Quiz Type** *(Admin only)*:
     - **National** — a national-level quiz (no area assigned)
     - **Area** — select a specific area from the dropdown
4. Click **Create Quiz**.

You are taken directly to the quiz workspace to continue setting it up.

> **Owners and Members** do not see the Quiz Type selector — their quizzes are automatically scoped to their area.

---

## 6. Adding Teams

Teams are the competing groups in the quiz.

1. Inside your quiz, click the **Teams** tab.
2. Click **Add Team**.
3. Enter a **Team Name** and choose a **Colour**.
4. Optionally add **member names** to the team.
5. Click **Save**.

Repeat for each competing team.

Each team receives:
- A unique **8-character Join Code** (shown in the Teams tab) — used by their device to join the session
- A **4-digit PIN** — used for identification on older flows

> You can regenerate a Join Code at any time if a team's device needs to reconnect.

---

## 7. Adding Rounds

A quiz is made up of one or more rounds. Each round has its own game mode and timer.

1. Click the **Rounds** tab.
2. Click **Add Round**.
3. Configure the round:
   - **Name** *(e.g. "Round 1 — General Knowledge")*
   - **Game Mode** — see below
   - **Number of Questions**
   - **Timer per Question** (seconds)
   - **Points per Question**
4. Click **Save**.

### Game Modes

| Mode | How it works |
|------|-------------|
| **Blitz** | All teams see the same question simultaneously and race to answer first. Requires **questionCount + 3 extra questions** as reserve for a Sudden Victory tiebreaker. |
| **Clue Reveal** | A single answer is revealed clue-by-clue. Teams buzz in when they know it — earlier answers earn more points. |
| **Tile Blitz** | Each team gets their own private set of questions. Teams answer independently at their own pace. Requires **questionCount × number of teams** total questions. |
| **Ultimate Challenge** | Each team faces a unique elimination-style challenge. Requires **questionCount × number of teams** total questions. |

---

## 8. Adding Questions

### 8.1 Adding Questions One by One

1. Click the **Questions** tab.
2. Select the round you want to add questions to.
3. Click **Add Question**.
4. Fill in the question text, correct answer, type (open answer or multiple choice), and point value.
5. Click **Save**.

---

### 8.2 Bulk Upload via CSV or Excel

For large question sets, upload an entire round's questions at once.

**Step 1 — Download the template**

1. Go to the **Questions** tab and select a round.
2. Click the **Import** button (or the upload area).
3. Click **Download CSV template (opens in Excel)**.

This downloads `apoquiz-questions-template.csv` — open it in Excel or Google Sheets.

**Step 2 — Fill in the template**

The template columns are:

| Column | Description |
|--------|-------------|
| `type` | `open`, `mcq`, `truefalse`, or `fillinblank` |
| `text` | The question text |
| `correctAnswer` | The exact correct answer. For `mcq`, put the letter (`A`, `B`, `C`, or `D`) |
| `clues` | **Clue Reveal only.** Pipe-separated clues revealed one at a time, e.g. `City of David\|Born here: Jesus\|Micah 5:2`. Leave blank for all other modes. |
| `optionA` – `optionD` | The four answer options (only for `mcq` type) |
| `aliases` | Comma-separated alternative accepted spellings, e.g. `Jn,Gospel of John` |
| `difficulty` | `easy`, `medium`, or `hard` (defaults to `medium` if blank) |
| `points` | Point value (leave blank to use the round default) |

> **Tip:** Save as `.csv` or `.xlsx` — both formats are accepted.

**Step 3 — Upload**

1. Click the upload area (or drag and drop your file).
2. A **preview table** appears showing all parsed rows and any errors.
3. Review the preview — fix any highlighted errors in your spreadsheet and re-upload if needed.
4. Click **Import Questions** to save all valid rows.

The system reports how many questions were **saved** and how many were **skipped** (due to errors).

---

## 9. Launching a Quiz

Before launching, the **Overview** tab shows a readiness checklist. All items must be green:

- ✅ At least one team added
- ✅ At least one round added
- ✅ Each round has enough questions (see game mode requirements in Section 7)

When everything is ready:

1. Click **Launch Quiz** (top-right of the quiz workspace).
2. The session moves to **Lobby** — teams can now join.
3. You are taken to the **Live Quiz** screen.

---

## 10. Connecting All Devices

All participants join through the **public URL**: **`quiz.afmweca.org`**

From the homepage, they select their role and enter the required codes.

---

### 10.1 Team Devices

Each team needs one device (tablet or phone).

1. Open **`quiz.afmweca.org`** on the team's device.
2. Tap **Team**.
3. Enter the **8-character Team Join Code** shown on the Teams tab of the quiz dashboard.
4. The device connects and waits in the lobby for the quiz to begin.

> The join code is unique per team — make sure each team uses their own code.
> If a device disconnects, it can rejoin using the same code.

---

### 10.2 Moderator Tablet / Laptop

The moderator controls the quiz flow — advancing questions, confirming open answers, and overriding scores.

1. Open **`quiz.afmweca.org`** on the moderator's device.
2. Tap **Moderator**.
3. Enter:
   - **Session Code** — the 6-character code shown on the quiz Overview tab
   - **Moderator PIN** — default is `1234` (set by your Admin in system settings)
4. The moderator control panel opens.

> Keep the moderator device charged and awake — the screen lock is automatically prevented during a live session.

---

### 10.3 Projector / Screen Display

The projector shows the live scoreboard, questions, and results to the room.

1. Connect a laptop to the projector.
2. Open **`quiz.afmweca.org`** in the browser.
3. Tap **Screen** (Projector Display).
4. Enter the **Session Code**.
5. The projector screen launches in full-screen display mode.

> Use the browser's full-screen mode (F11) for the cleanest display.

---

### 10.4 Audience Members

Audience members follow along, vote on questions, and appear on the leaderboard.

1. Each audience member opens **`quiz.afmweca.org`** on their phone.
2. Tap **Audience**.
3. Enter:
   - **Session Code** — the 6-character code from the quiz Overview tab
   - **Your Name**
4. Tap **Join**.

They now follow the quiz live and can participate in audience-participation questions.

> The session code is the same for everyone — teams, moderator, screen, and audience all use it.
> It never changes for a given quiz and can be shared on a slide or printed on a card.

---

## 11. Running the Quiz Live

Once all devices are connected, the **moderator** controls the flow:

1. **Start Round** — tap to begin the first round. Teams see the first question on their screens.
2. **Reveal / Advance** — for Blitz and Clue Reveal, the moderator taps to reveal clues or advance to the next question.
3. **Confirm Answers** — for open-answer rounds, the moderator reviews each team's submitted answer and marks it correct or incorrect.
4. **Score Override** — if needed, the moderator can manually adjust a team's score with a reason.
5. **Next Question / Next Round** — advance through all questions and rounds.
6. **End Quiz** — after the final round, the moderator ends the session. Results are saved automatically.

The **projector screen** updates in real time throughout — showing the current question, timer, and scoreboard.

---

## 12. Viewing Results

After a quiz ends:

1. In the host dashboard, open the completed quiz.
2. Click **View Results** (or go to the Overview tab and click **View Results**).
3. The results page shows:
   - Final standings with scores and ranks
   - Per-round breakdown
   - Accuracy stats per team
   - Audience leaderboard

To download a full results report:
- Click **Export CSV** on the results page — opens in Excel.

---

## 13. Admin: Filtering Quizzes by Area

By default, the Admin dashboard shows **National Quizzes** (quizzes with no area assigned).

To view an area's quizzes:

1. Log in as **Admin**.
2. On the Quizzes page, locate the **area filter dropdown** (top-right, next to New Quiz).
3. Select an area name from the list.
4. The list updates to show only that area's quizzes.
5. To return to national quizzes, select **National Quizzes** from the dropdown.

> Admins can create quizzes for any area by selecting **Area** in the Quiz Type field when creating a new quiz.

---

## 14. Quick Reference — URLs & Codes

| What | Where |
|------|-------|
| Host / Admin portal | `quiz.afmweca.org/host` |
| Participant join page | `quiz.afmweca.org` |
| Team join code | Teams tab → per team (8 characters) |
| Session code | Quiz Overview tab (6 characters, permanent) |
| Moderator PIN | Default: `1234` — set by Admin in system settings |
| Password reset | Login page → Forgot? |
| Invitation link | Received by email, valid 24 hours |

---

*ApoQuiz — AFM WECA Live Bible Quiz Platform · 2026*
