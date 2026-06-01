// Server → Client events
export const SERVER_EVENTS = {
  SESSION_STATE: 'session:state',
  ROUND_RULES_SHOW: 'round:rules:show',
  ROUND_VOTE_OPEN: 'round:vote:open',
  ROUND_VOTE_UPDATE: 'round:vote:update',
  ROUND_VOTE_CLOSE: 'round:vote:close',
  ROUND_START: 'round:start',
  QUESTION_OPEN: 'question:open',
  QUESTION_PREDICTION_OPEN: 'question:prediction:open',
  QUESTION_PREDICTION_CLOSE: 'question:prediction:close',
  QUESTION_ALL_ANSWERED: 'question:all:answered',
  QUESTION_TIMER_ELAPSED: 'question:timer:elapsed',
  QUESTION_REVEAL: 'question:reveal',
  SCORES_UPDATE: 'scores:update',
  ROUND_SUMMARY: 'round:summary',
  SESSION_END: 'session:end',
  AUDIENCE_POINTS_UPDATE: 'audience:points:update',
  ERROR: 'error',
  // Tile Blitz specific
  TILEBLITZ_STATE: 'tileblitz:state',
  TILEBLITZ_BONUS_CLAIMED: 'tileblitz:bonus:claimed',
  TILEBLITZ_BONUS_RESULT: 'tileblitz:bonus:result',
  TILEBLITZ_BONUS_TIMER_ELAPSED: 'tileblitz:bonus:timer:elapsed',
  TILEBLITZ_PENDING_ANSWER: 'tileblitz:pending:answer',
  CUMULATIVE_SCORES: 'session:cumulative',
  // Ultimate Challenge specific
  UC_STATE: 'uc:state',
  UC_QUESTION_UPDATE: 'uc:question:update',
  UC_TEAM_DONE: 'uc:team:done',
  // Clue Reveal specific
  CLUE_STATE: 'clue:state',
  CLUE_NEXT: 'clue:next',
  CLUE_TIMER_ELAPSED: 'clue:timer:elapsed',
  CLUE_ANSWER_RESULT: 'clue:answer:result',
  // Audience Engagement
  AUDIENCE_INTERACTION_START: 'audience:interaction:start',
  AUDIENCE_INTERACTION_UPDATE: 'audience:interaction:update',
  AUDIENCE_INTERACTION_CLOSE: 'audience:interaction:close',
  CLOCK_SYNC: 'clock:sync',
  // Screen overlay
  SCREEN_QR_SHOW: 'screen:qr:show',
  SCREEN_QR_HIDE: 'screen:qr:hide',
  RULES_OVERLAY_SHOW: 'round:rules:overlay:show',
  RULES_OVERLAY_HIDE: 'round:rules:overlay:hide',
} as const

// Client → Server: moderator events
export const MODERATOR_EVENTS = {
  VOTE_OPEN: 'moderator:vote:open',
  VOTE_CLOSE: 'moderator:vote:close',
  ROUND_START: 'moderator:round:start',
  QUESTION_REVEAL: 'moderator:question:reveal',
  ANSWER_REVEAL: 'moderator:answer:reveal',
  ROUND_SUMMARY: 'moderator:round:summary',
  NEXT_ROUND: 'moderator:next:round',
  NEXT_QUESTION: 'moderator:next:question',
  SESSION_END: 'moderator:session:end',
  TIMER_PAUSE: 'moderator:timer:pause',
  SCORE_OVERRIDE: 'moderator:score:override',
  // Tile Blitz specific
  TILEBLITZ_SELECT_TILE: 'moderator:tileblitz:select:tile',
  TILEBLITZ_LOCK_QUESTION: 'moderator:tileblitz:lock:question',
  TILEBLITZ_BONUS_OPEN: 'moderator:tileblitz:bonus:open',
  TILEBLITZ_BONUS_GRANT: 'moderator:tileblitz:bonus:grant',
  TILEBLITZ_BONUS_REVEAL: 'moderator:tileblitz:bonus:reveal',
  TILEBLITZ_NEXT_TURN: 'moderator:tileblitz:next:turn',
  SHOW_CUMULATIVE: 'moderator:show:cumulative',
  // Ultimate Challenge specific
  UC_SELECT_TEAM: 'moderator:uc:select:team',
  UC_MARK_CORRECT: 'moderator:uc:mark:correct',
  UC_SKIP: 'moderator:uc:skip',
  UC_END_TURN: 'moderator:uc:end:turn',
  // Clue Reveal specific
  CLUE_REVEAL_NEXT: 'moderator:clue:reveal:next',
  CLUE_SKIP: 'moderator:clue:skip',
  // Audience Engagement
  SET_AUDIENCE_LEVEL: 'moderator:audience:set_level',
  TRIGGER_AUDIENCE_ACTIVITY: 'moderator:audience:trigger_activity',
  // Screen overlay controls
  SCREEN_QR: 'moderator:screen:qr',
  RULES_TOGGLE: 'moderator:rules:toggle',
} as const

// Client → Server: team events
export const TEAM_EVENTS = {
  ANSWER_SUBMIT: 'team:answer:submit',
  TILEBLITZ_BONUS_BUZZ: 'team:tileblitz:bonus:buzz',
  CLUE_BUZZ: 'team:clue:buzz',
} as const

// Client → Server: audience events
export const AUDIENCE_EVENTS = {
  VOTE_SUBMIT: 'audience:vote:submit',
  PREDICT_SUBMIT: 'audience:predict:submit',
  REACT: 'audience:react',
  TRUE_FALSE_SUBMIT: 'audience:true_false:submit',
  GHOST_ANSWER_SUBMIT: 'audience:ghost_answer:submit',
} as const

// Bidirectional connection events
export const CONNECTION_EVENTS = {
  REJOIN: 'session:rejoin',
  LEAVE: 'session:leave',
  DISCONNECT: 'disconnect',
  CONNECT: 'connect',
  CONNECT_ERROR: 'connect_error',
} as const

// Server → Client: join confirmation events
export const JOIN_EVENTS = {
  TEAM_JOINED:      'team:joined',
  AUDIENCE_JOINED:  'audience:joined',
  MODERATOR_JOINED: 'moderator:joined',
  SCREEN_JOINED:    'screen:joined',
} as const

export type ServerEvent = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS]
export type ModeratorEvent = (typeof MODERATOR_EVENTS)[keyof typeof MODERATOR_EVENTS]
export type TeamEvent = (typeof TEAM_EVENTS)[keyof typeof TEAM_EVENTS]
export type AudienceEvent = (typeof AUDIENCE_EVENTS)[keyof typeof AUDIENCE_EVENTS]
