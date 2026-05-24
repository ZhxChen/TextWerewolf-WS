export const ROOM_STATUS = {
  READY: 0,
  GOING: 1,
  INVALID: 2
}

export const GAME_STATUS = {
  GOING: 1,
  FINISHED: 2,
  EXCEPTION: 3
}

export const GAME_DAY_ORDER = {
  FIRST_DAY: 1,
  SECOND_DAY: 2
}

export const GAME_DAY_NIGHT = {
  IS_NIGHT: 1,
  IS_DAY: 2
}

export const GAME_TICKET_FLAT = {
  NO_PK: 1,
  NEED_PK: 2
}

export const GAME_WIN_CONDITION = {
  KILL_HALF_ROLE: 1,
  KILL_ALL: 2
}

export const GAME_WITCH_SAVE_SELF = {
  SAVE_ALL_STAGE: 1,
  SAVE_ONLY_FIRST_NIGHT: 2,
  NO_SAVE_SELF: 3
}

export const GAME_CAMP = {
  WOLF: 0,
  CLERIC_AND_VILLAGER: 1,
  THIRD_CAMP: 2
}

export const GAME_STAGE = {
  READY: 0,
  PREDICTOR_STAGE: 1,
  WOLF_STAGE: 2,
  WITCH_STAGE: 3,
  AFTER_NIGHT: 4,
  SPEAK_STAGE: 5,
  VOTE_STAGE: 6,
  VOTE_PK_STAGE: 6.5,
  EXILE_FINISH_STAGE: 7
}

export const VISION_STATUS = {
  UNKNOWN: 0,
  KNOWN_CAMP: 1,
  KNOWN_ROLE: 2
}

export const GAME_ROLE = {
  WOLF: 'wolf',
  PREDICTOR: 'predictor',
  WITCH: 'witch',
  HUNTER: 'hunter',
  VILLAGER: 'villager'
}

export const GAME_MODE = {
  STANDARD_9: 'standard_9',
  STANDARD_6: 'standard_6'
}

export const ACTIVE_GAME_MODE = GAME_MODE.STANDARD_9
export const ALLOWED_GAME_MODES = [GAME_MODE.STANDARD_9, GAME_MODE.STANDARD_6]

export const GAME_OUT_REASON = {
  SHOOT: 'shoot',
  EXILE: 'exile',
  POISON: 'poison',
  ASSAULT: 'assault'
}

export const SKILL_ACTION_KEY = {
  KILL: 'kill',
  ASSAULT: 'assault',
  CHECK: 'check',
  ANTIDOTE: 'antidote',
  POISON: 'poison',
  SHOOT: 'shoot',
  VOTE: 'vote',
  JUMP: 'jump',
  DIE: 'die'
}

export const SKILL_STATUS = {
  UNAVAILABLE: 0,
  AVAILABLE: 1
}

export const PLAYER_STATUS = {
  ALIVE: 1,
  DEAD: 0
}

export const GAME_TAG_MODE = {
  DIE: 1,
  SPEAK_ORDER: 2,
  VOTE_PK: 3
}

export const TEXT_COLOR = {
  BLACK: 1,
  RED: 2,
  GREEN: 3,
  BLUE: 4,
  PINK: 5,
  ORANGE: 6
}

export const MODE = {
  standard_9: {
    name: '标准9人局',
    key: 'standard_9',
    count: 9,
    ROLE_MAP: [
      GAME_ROLE.WOLF,
      GAME_ROLE.WOLF,
      GAME_ROLE.WOLF,
      GAME_ROLE.PREDICTOR,
      GAME_ROLE.WITCH,
      GAME_ROLE.HUNTER,
      GAME_ROLE.VILLAGER,
      GAME_ROLE.VILLAGER,
      GAME_ROLE.VILLAGER
    ],
    STAGE: [
      GAME_STAGE.READY,
      GAME_STAGE.PREDICTOR_STAGE,
      GAME_STAGE.WOLF_STAGE,
      GAME_STAGE.WITCH_STAGE,
      GAME_STAGE.AFTER_NIGHT,
      GAME_STAGE.SPEAK_STAGE,
      GAME_STAGE.VOTE_STAGE,
      GAME_STAGE.EXILE_FINISH_STAGE
    ],
    CONFIG_SETTINGS: [
      { title: '预言家行动时间（秒）：', type: 'counter', key: 'predictorActionTime' },
      { title: '狼人行动时间（秒）：', type: 'counter', key: 'wolfActionTime' },
      { title: '女巫行动时间（秒）：', type: 'counter', key: 'witchActionTime' },
      { title: '玩家发言时间（秒）：', type: 'counter', key: 'speakActionTime' },
      { title: '投票阶段时间（秒）：', type: 'counter', key: 'voteActionTime' },
      { title: '女巫解药限制：', type: 'radio', key: 'witchSaveSelf' },
      { title: '游戏胜利条件：', type: 'radio', key: 'winCondition' },
      { title: '平票处理：', type: 'radio', key: 'flatTicket' }
    ],
    CONFIG_OPTIONS: {
      witchSaveSelf: [
        { name: '均能自救', value: GAME_WITCH_SAVE_SELF.SAVE_ALL_STAGE },
        { name: '首页自救', value: GAME_WITCH_SAVE_SELF.SAVE_ONLY_FIRST_NIGHT },
        { name: '不能自救', value: GAME_WITCH_SAVE_SELF.NO_SAVE_SELF }
      ],
      winCondition: [
        { name: '屠边', value: GAME_WIN_CONDITION.KILL_HALF_ROLE },
        { name: '屠城', value: GAME_WIN_CONDITION.KILL_ALL }
      ],
      flatTicket: [
        { name: '直接进入夜晚', value: GAME_TICKET_FLAT.NO_PK },
        { name: '加赛pk一轮', value: GAME_TICKET_FLAT.NEED_PK }
      ]
    },
    CONFIG_DEFAULT: {
      predictorActionTime: 15,
      wolfActionTime: 15,
      witchActionTime: 15,
      speakActionTime: 60,
      voteActionTime: 30,
      witchSaveSelf: GAME_WITCH_SAVE_SELF.SAVE_ONLY_FIRST_NIGHT,
      winCondition: GAME_WIN_CONDITION.KILL_HALF_ROLE,
      flatTicket: GAME_TICKET_FLAT.NO_PK
    },
  },
  standard_6: {
    name: '标准6人局',
    key: 'standard_6',
    count: 6,
    ROLE_MAP: [
      GAME_ROLE.WOLF,
      GAME_ROLE.WOLF,
      GAME_ROLE.PREDICTOR,
      GAME_ROLE.WITCH,
      GAME_ROLE.VILLAGER,
      GAME_ROLE.VILLAGER
    ],
    STAGE: [
      GAME_STAGE.READY,
      GAME_STAGE.PREDICTOR_STAGE,
      GAME_STAGE.WOLF_STAGE,
      GAME_STAGE.WITCH_STAGE,
      GAME_STAGE.AFTER_NIGHT,
      GAME_STAGE.SPEAK_STAGE,
      GAME_STAGE.VOTE_STAGE,
      GAME_STAGE.EXILE_FINISH_STAGE
    ],
    CONFIG_SETTINGS: [
      { title: '预言家行动时间（秒）：', type: 'counter', key: 'predictorActionTime' },
      { title: '狼人行动时间（秒）：', type: 'counter', key: 'wolfActionTime' },
      { title: '女巫行动时间（秒）：', type: 'counter', key: 'witchActionTime' },
      { title: '玩家发言时间（秒）：', type: 'counter', key: 'speakActionTime' },
      { title: '投票阶段时间（秒）：', type: 'counter', key: 'voteActionTime' },
      { title: '女巫解药限制：', type: 'radio', key: 'witchSaveSelf' },
      { title: '游戏胜利条件：', type: 'radio', key: 'winCondition' },
      { title: '平票处理：', type: 'radio', key: 'flatTicket' }
    ],
    CONFIG_OPTIONS: {
      witchSaveSelf: [
        { name: '均能自救', value: GAME_WITCH_SAVE_SELF.SAVE_ALL_STAGE },
        { name: '首页自救', value: GAME_WITCH_SAVE_SELF.SAVE_ONLY_FIRST_NIGHT },
        { name: '不能自救', value: GAME_WITCH_SAVE_SELF.NO_SAVE_SELF }
      ],
      winCondition: [
        { name: '屠边', value: GAME_WIN_CONDITION.KILL_HALF_ROLE },
        { name: '屠城', value: GAME_WIN_CONDITION.KILL_ALL }
      ],
      flatTicket: [
        { name: '直接进入夜晚', value: GAME_TICKET_FLAT.NO_PK },
        { name: '加赛pk一轮', value: GAME_TICKET_FLAT.NEED_PK }
      ]
    },
    CONFIG_DEFAULT: {
      predictorActionTime: 15,
      wolfActionTime: 15,
      witchActionTime: 15,
      speakActionTime: 60,
      voteActionTime: 30,
      witchSaveSelf: GAME_WITCH_SAVE_SELF.SAVE_ONLY_FIRST_NIGHT,
      winCondition: GAME_WIN_CONDITION.KILL_HALF_ROLE,
      flatTicket: GAME_TICKET_FLAT.NO_PK
    }
  }
}

export const SKILL_MAP = {
  wolf: [
    { name: '袭击', key: SKILL_ACTION_KEY.ASSAULT, status: SKILL_STATUS.AVAILABLE }
  ],
  predictor: [
    { name: '查验', key: SKILL_ACTION_KEY.CHECK, status: SKILL_STATUS.AVAILABLE }
  ],
  witch: [
    { name: '解药', key: SKILL_ACTION_KEY.ANTIDOTE, status: SKILL_STATUS.AVAILABLE },
    { name: '毒药', key: SKILL_ACTION_KEY.POISON, status: SKILL_STATUS.AVAILABLE }
  ],
  hunter: [
    { name: '开枪', key: SKILL_ACTION_KEY.SHOOT, status: SKILL_STATUS.UNAVAILABLE }
  ],
  villager: []
}

export const PLAYER_ROLE_MAP = {
  wolf: { camp: GAME_CAMP.WOLF, campName: '狼人阵营', name: '狼人', key: GAME_ROLE.WOLF },
  villager: { camp: GAME_CAMP.CLERIC_AND_VILLAGER, campName: '好人阵营', name: '平民', key: GAME_ROLE.VILLAGER },
  predictor: { camp: GAME_CAMP.CLERIC_AND_VILLAGER, campName: '好人阵营', name: '预言家', key: GAME_ROLE.PREDICTOR },
  witch: { camp: GAME_CAMP.CLERIC_AND_VILLAGER, campName: '好人阵营', name: '女巫', key: GAME_ROLE.WITCH },
  hunter: { camp: GAME_CAMP.CLERIC_AND_VILLAGER, campName: '好人阵营', name: '猎人', key: GAME_ROLE.HUNTER }
}

export const STAGE_MAP = {
  0: { day: GAME_DAY_NIGHT.IS_NIGHT, name: '天黑请闭眼', key: 'ready' },
  1: { day: GAME_DAY_NIGHT.IS_NIGHT, name: '预言家请行动', key: 'predictor' },
  2: { day: GAME_DAY_NIGHT.IS_NIGHT, name: '狼人请行动', key: 'wolf' },
  3: { day: GAME_DAY_NIGHT.IS_NIGHT, name: '女巫请行动', key: 'witch' },
  4: { day: GAME_DAY_NIGHT.IS_DAY, name: '天亮了', key: 'actionFinish' },
  5: { day: GAME_DAY_NIGHT.IS_DAY, name: '发言环节', key: 'talk' },
  6: { day: GAME_DAY_NIGHT.IS_DAY, name: '投票环节', key: 'vote' },
  6.5: { day: GAME_DAY_NIGHT.IS_DAY, name: '加赛pk环节', key: 'vote-pk' },
  7: { day: GAME_DAY_NIGHT.IS_DAY, name: '遗言环节', key: 'lastWord' }
}

export const JUMP_MAP = {
  wolf: '空刀',
  predictor: '空验',
  witch: '空过'
}

export const CAMP_MAP = {
  wolf: { key: 'wolf', value: 0, name: '狼人阵营' },
  cleric_and_villager: { key: 'cleric_and_villager', value: 1, name: '好人阵营' },
  third: { key: 'third', value: 2, name: '第三方阵营' }
}

export const BROADCAST_MAP = {
  ready: [{ text: '请确认自己的身份，准备开始游戏，天黑请闭眼...', level: TEXT_COLOR.BLACK }],
  night_begin: [{ text: '天黑请闭眼...', level: TEXT_COLOR.BLACK }],
  predictor_action: [
    { text: '预言家', level: TEXT_COLOR.RED },
    { text: '请行动，选择你要查验的玩家。', level: TEXT_COLOR.BLACK }
  ],
  wolf_action: [
    { text: '狼人', level: TEXT_COLOR.RED },
    { text: '请行动，请选择袭击一位玩家。', level: TEXT_COLOR.BLACK }
  ],
  witch_action: [
    { text: '女巫', level: TEXT_COLOR.RED },
    { text: '请行动，你有一瓶解药和毒药，请选择使用一种。', level: TEXT_COLOR.BLACK }
  ],
  vote: [
    { text: '开始', level: TEXT_COLOR.BLACK },
    { text: '投票', level: TEXT_COLOR.RED },
    { text: '，请使用投票技能进行投票，如果要', level: TEXT_COLOR.BLACK },
    { text: '弃票', level: TEXT_COLOR.RED },
    { text: '，则不进行任何操作，等待主持人进入下一阶段', level: TEXT_COLOR.BLACK }
  ],
  vote_pk: [
    { text: '开始', level: TEXT_COLOR.BLACK },
    { text: '加赛投票', level: TEXT_COLOR.BLUE },
    { text: '，请使用投票技能进行投票，如果要', level: TEXT_COLOR.BLACK },
    { text: '弃票', level: TEXT_COLOR.RED },
    { text: '，则不进行任何操作，等待主持人进入下一阶段', level: TEXT_COLOR.BLACK }
  ]
}

export const DEFAULT_ERROR = {
  code: -1,
  feedback: '系统错误',
  description: '系统有误，请稍候再试'
}

export const SYSTEM_ERROR = {
  code: -1,
  feedback: '系统错误',
  description: '系统有误，请稍候再试'
}

export const NORMAL_ERROR = {
  code: -2,
  description: ''
}

export const NOT_LOGIN = {
  code: -3,
  feedback: '无权访问（用户未登录）！',
  description: '无权访问（用户未登录）！'
}

export const SERVICE_ERROR = {
  code: 7999,
  feedback: '服务异常',
  description: '数据库服务异常'
}

export const QUERY_DATA_ERROR = {
  code: 1002,
  feedback: '服务异常（查询失败）',
  description: '服务异常（查询失败）'
}

export const USER_NOT_EXIST_ERROR = {
  code: 4002,
  message: '用户不存在或者已被禁用',
  description: '用户不存在或者已被禁用，请联系管理员！'
}

export default {
  ROOM_STATUS,
  GAME_STATUS,
  GAME_DAY_ORDER,
  GAME_DAY_NIGHT,
  GAME_TICKET_FLAT,
  GAME_WIN_CONDITION,
  GAME_WITCH_SAVE_SELF,
  GAME_CAMP,
  GAME_STAGE,
  VISION_STATUS,
  GAME_ROLE,
  GAME_MODE,
  ACTIVE_GAME_MODE,
  ALLOWED_GAME_MODES,
  GAME_OUT_REASON,
  SKILL_ACTION_KEY,
  SKILL_STATUS,
  PLAYER_STATUS,
  GAME_TAG_MODE,
  TEXT_COLOR,
  MODE,
  SKILL_MAP,
  PLAYER_ROLE_MAP,
  STAGE_MAP,
  JUMP_MAP,
  CAMP_MAP,
  BROADCAST_MAP,
  DEFAULT_ERROR,
  SYSTEM_ERROR,
  NORMAL_ERROR,
  NOT_LOGIN,
  SERVICE_ERROR,
  QUERY_DATA_ERROR,
  USER_NOT_EXIST_ERROR
}
