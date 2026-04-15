// ゲーム全体の定数設定
export const CONFIG = {
  DEBUG: false,                  // true でデバッグUI表示

  // --- 画面サイズ ---
  WIDTH: 390,
  HEIGHT: 844,

  // --- スクロール速度 ---
  SCROLL_SPEED_BASE: 38,       // 初期スクロール速度 (px/秒)
  SCROLL_SPEED_MAX: 140,       // 最大スクロール速度
  SCROLL_SPEED_PER_50: 4,      // 50段ごとに加速する量

  // --- 物理パラメーター ---
  GRAVITY: 1050,
  JUMP_VY: -720,               // ジャンプ時の縦速度
  PLAYER_SPEED: 170,           // プレイヤーの横自動移動速度
  MAX_FALL_SPEED: 900,

  // --- プレイヤー ---
  PLAYER_RADIUS: 80,           // 表示用半径
  PLAYER_HIT_W: 50,            // 物理ボックス幅
  PLAYER_HIT_H: 50,            // 物理ボックス高さ
  COYOTE_FRAMES: 8,            // コヨーテタイム (フレーム数)

  // --- 足場 ---
  PLATFORM_H: 26,              // 足場の高さ
  PLATFORM_MIN_GAP: 95,        // 最小Y間隔
  PLATFORM_MAX_GAP: 170,       // 最大Y間隔
  PLATFORM_AVG_GAP: 132,       // 平均Y間隔 (段数計算用)
  PLATFORM_MIN_W: 150,         // 最小幅 (単独時)
  PLATFORM_MAX_W: 170,         // 最大幅 (単独時)
  PLATFORM_MULTI_W: 70,        // 複数足場時の幅
  PLATFORM_MULTI_CHANCE: 0.4,  // 複数足場になる確率
  PLATFORM_MIN_X: 55,          // 最小X
  PLATFORM_MAX_X: 335,         // 最大X
  PLATFORM_BUFFER: 600,        // カメラ上部からの先行生成バッファ
  PLATFORM_CLEANUP: 300,       // カメラ下部からのクリーンアップ閾値

  // 最初の足場のY座標 (世界座標: Y増=下方向)
  FIRST_PLATFORM_Y: 620,

  // --- バナナ ---
  BANANA_CHANCE: 0.28,
  BANANA_TYPES: [1, 3, 5],

  // --- 敵 ---
  FRIEND_CHANCE: 0.03,           // フレンド(バナナ3倍)出現確率
  FRIEND2_CHANCE: 0.05,          // フレンド2(羽)出現確率
  FRIEND_SIZE: 50,               // フレンド表示サイズ
  ENEMY_SPAWN_INTERVAL: 60000,   // 出現間隔 (ms)
  ENEMY_SIZE: 60,                // 表示サイズ
  ENEMY_DURATION: 6000,          // 画面内を飛び回る時間 (ms)

  // --- ボス ---
  BOSS_EVERY: 100,             // 何段ごとにボス戦
  BOSS_TIME_BASE: 60,          // 基本制限時間 (秒)
  BOSS_TIME_MIN: 30,           // 最小制限時間
  BOSS_TIME_PER_BOSS: -5,      // ボスごとに減少する秒数
  BOSS_TIME_BONUS: 10,         // 正解時ボーナス
  BOSS_TIME_PENALTY: 5,        // 不正解時ペナルティ
  BOSS_TARGET_BASE: 3,         // 目標ポイント基準値
  BOSS_PANEL_COUNT: 32,        // 表示パネル数 (4×8)

  // ボス開幕ワード (れで始まる必要文字)
  BOSS_OPENINGS: [
    { word: 'しりとり', required: 'り' },
    { word: 'さとうきび', required: 'び' },
    { word: 'てんき', required: 'き' },
    { word: 'たまご', required: 'ご' },
    { word: 'かに', required: 'に' },
    { word: 'いわし', required: 'し' },
    { word: 'くだもの', required: 'の' },
    { word: 'こいのぼり', required: 'り' },
  ],

  // --- GAS スコア ---
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxmRDvBBA_g11NQy4ZwP85h_v84Gs9sxsz5UTKgYskvOSTOQinwrhNaEUzxR-q-O6-H/exec',
  GAME_ID: 'sexyjump',

  // --- カラーパレット ---
  COLOR: {
    SKY_TOP: 0x0a1628,
    SKY_MID: 0x0d2d5a,
    SKY_BOT: 0x1a4a2e,
    PLATFORM: 0x4CAF50,
    PLATFORM_DIRT: 0x795548,
    PLAYER: 0xe53935,
    BANANA: 0xFFD700,
    UI_BG: 0x000000,
    UI_TEXT: 0xffffff,
    BOSS_BG: 0x1a0a3a,
    PANEL_SELECTED: 0xFFEB3B,
    PANEL_WRONG: 0xf44336,
    PANEL_CORRECT: 0x4CAF50,
    PANEL_TIMER_BAR: 0x00BCD4,
  }
};
