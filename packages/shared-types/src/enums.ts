export enum QuizStatus {
  DRAFT = 'draft',
  READY = 'ready',
  COMPLETED = 'completed',
  ACTIVE = 'active',
}

export enum GameMode {
  BLITZ = 'blitz',
  TILE_BLITZ = 'tile_blitz',
  ULTIMATE_CHALLENGE = 'ultimate_challenge',
  STEAL = 'steal',
  HOT_SEAT = 'hot_seat',
  CLUE_REVEAL = 'clue_reveal',
  LIGHTNING = 'lightning',
  TRUE_FALSE_BLITZ = 'true_false_blitz',
  WAGER = 'wager',
  DUEL = 'duel',
  ELIMINATION = 'elimination',
  PICTURE = 'picture',
}

export enum QuestionType {
  MCQ = 'mcq',
  OPEN = 'open',
  TRUEFALSE = 'truefalse',
  FILLINBLANK = 'fillinblank',
  IMAGE = 'image',
}

export enum QuestionDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export enum SessionStatus {
  LOBBY = 'lobby',
  AUDIENCE_VOTE = 'audience_vote',
  ROUND_INTRO = 'round_intro',
  QUESTION_OPEN = 'question_open',
  QUESTION_LOCKED = 'question_locked',
  ANSWER_REVEAL = 'answer_reveal',
  QUESTION_SUMMARY = 'question_summary',
  ROUND_SUMMARY = 'round_summary',
  SESSION_END = 'session_end',
  // Tile Blitz specific states
  TILE_SELECT = 'tile_select',
  BONUS_OPEN = 'bonus_open',
  BONUS_ANSWERING = 'bonus_answering',
  BONUS_REVEAL = 'bonus_reveal',
  CUMULATIVE_REVEAL = 'cumulative_reveal',
  // Ultimate Challenge specific states
  UC_TEAM_SELECT = 'uc_team_select',
  UC_ACTIVE = 'uc_active',
  // Clue Reveal specific states
  CLUE_OPEN = 'clue_open',
  CLUE_ANSWERING = 'clue_answering',
  // Sudden Victory tiebreaker
  SUDDEN_VICTORY_INTRO = 'sudden_victory_intro',
}

export enum UserRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  TEAM = 'team',
  AUDIENCE = 'audience',
  SCREEN = 'screen',
}

export enum ScoringStrategy {
  TIME_DECAY = 'time_decay',
  FIXED = 'fixed',
  WAGER = 'wager',
  POSITION = 'position',
}

export enum AnswerBehavior {
  SIMULTANEOUS = 'simultaneous',
  BUZZER = 'buzzer',
  TURN_BASED = 'turn_based',
}

export enum AudienceActivity {
  ROUND_RANKING = 'round_ranking',
  QUESTION_PREDICTION = 'question_prediction',
  EMOJI_REACT = 'emoji_react',
  TRUE_FALSE = 'true_false',
  STEAL_PREDICTION = 'steal_prediction',
  DUEL_PREDICTION = 'duel_prediction',
  GHOST_ANSWER = 'ghost_answer',
  CLUE_DEPTH_PREDICTION = 'clue_depth_prediction',
}

export enum GameState {
  LOBBY = 'lobby',
  AUDIENCE_VOTE = 'audience_vote',
  ROUND_INTRO = 'round_intro',
  QUESTION_OPEN = 'question_open',
  QUESTION_LOCKED = 'question_locked',
  STEAL_WINDOW = 'steal_window',
  STEAL_ATTEMPT = 'steal_attempt',
  ANSWER_REVEAL = 'answer_reveal',
  QUESTION_SUMMARY = 'question_summary',
  ROUND_SUMMARY = 'round_summary',
  SESSION_END = 'session_end',
  TILE_SELECT = 'tile_select',
  BONUS_OPEN = 'bonus_open',
  BONUS_ANSWERING = 'bonus_answering',
  BONUS_REVEAL = 'bonus_reveal',
  CUMULATIVE_REVEAL = 'cumulative_reveal',
  // Ultimate Challenge specific states
  UC_TEAM_SELECT = 'uc_team_select',
  UC_ACTIVE = 'uc_active',
  // Clue Reveal specific states
  CLUE_OPEN = 'clue_open',
  CLUE_ANSWERING = 'clue_answering',
}

export enum AnswerValidationTier {
  EXACT = 'exact',
  NORMALIZED = 'normalized',
  ALIAS = 'alias',
  FUZZY = 'fuzzy',
}

export enum AudienceEngagementLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum AudienceInteractionType {
  PREDICTION = 'prediction',
  BET = 'bet',
  GHOST_ANSWER = 'ghost_answer',
}
