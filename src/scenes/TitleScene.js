import Phaser from 'phaser';
import { CONFIG } from '../GameConfig.js';
import { fetchScores } from '../ScoreAPI.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
    this._debugTapCount = 0;
    this._debugTapTimer = null;
  }

  create() {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

    // --- 背景 ---
    const bg = this.add.image(W / 2, H / 2, 'back').setDisplaySize(W, H);

    // 雲パーティクル風の円
    for (let i = 0; i < 8; i++) {
      const cx = Phaser.Math.Between(30, W - 30);
      const cy = Phaser.Math.Between(80, H * 0.85);
      const cl = this.add.graphics();
      cl.fillStyle(0xffffff, 0.04 + Math.random() * 0.06);
      cl.fillEllipse(cx, cy, Phaser.Math.Between(60, 160), Phaser.Math.Between(30, 70));
    }

    // --- タイトルバナー ---
    this.add.image(W / 2, 140, 'banner')
      .setDisplaySize(W - 30, (W - 30) * 0.4)
      .setOrigin(0.5);

    // --- プレイヤーキャラ装飾 ---
    const playerImg = this.add.sprite(W / 2, 280, 'player').setDisplaySize(140, 140);
    playerImg.play('player_run');
    this.tweens.add({
      targets: playerImg,
      y: 300,
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    // --- 操作説明 (左) & ランキング (右) 横並び ---
    const panelY = 345;
    const panelH = 280;
    const halfW = (W - 50) / 2;

    // 左: 操作説明
    const instBg = this.add.graphics();
    instBg.fillStyle(0x000000, 0.4);
    instBg.fillRoundedRect(15, panelY, halfW, panelH, 12);

    const instX = 15 + halfW / 2;
    this.add.text(instX, panelY + 18, '◀ タップでジャンプ ▶', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '14px',
      color: '#FFD700', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);

    this.add.text(instX, panelY + 48, '🍌 バナナでスコアUP', {
      fontFamily: 'Arial', fontSize: '13px', color: '#ffffff',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);

    this.add.text(instX, panelY + 76, '100段ごとにボス戦！', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '13px',
      color: '#ff9800', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);

    this.add.text(instX, panelY + 106, '🪶 羽があれば空中で二段ジャンプ！', {
      fontFamily: 'Arial', fontSize: '12px', color: '#00E5FF',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);

    this.add.text(instX, panelY + 132, '得点 = 段数 + バナナ✕2', {
      fontFamily: 'Arial', fontSize: '11px', color: '#aaaaaa',
      stroke: '#000', strokeThickness: 1
    }).setOrigin(0.5);

    // 右: ランキング
    this._loadRanking(W, panelY, panelH, halfW);

    // --- デバッグUI (CONFIG.DEBUG=true のときのみ) ---
    if (CONFIG.DEBUG) {
      const inputLabel = this.add.text(W / 2 - 80, 680, 'スタート段数:', {
        fontFamily: 'Arial', fontSize: '13px', color: '#aaaaaa'
      });

      this._startStageInput = this.add.dom(W / 2 + 50, 688).createElement('input', {
        type: 'number',
        value: '0',
        min: '0',
        step: '50',
        style: 'width:70px; height:26px; font-size:14px; text-align:center; border:2px solid #FFD700; border-radius:8px; background:#1a1a2e; color:#FFD700; outline:none;'
      });

      const debugBtn = this.createButton(W / 2 - 85, 730, '🔧 しりとり', '#1a237e', '#bbdefb', () => {
        this.scene.start('BossScene', { debug: true, stageCount: 100, bananaScore: 0, scrollSpeed: CONFIG.SCROLL_SPEED_BASE });
      });
      debugBtn.setAlpha(0.55);

      const debugBtn2 = this.createButton(W / 2 + 85, 730, '🔧 神経衰弱', '#1a237e', '#bbdefb', () => {
        this.scene.start('MemoryBossScene', { debug: true, stageCount: 100, bananaScore: 50, scrollSpeed: CONFIG.SCROLL_SPEED_BASE });
      });
      debugBtn2.setAlpha(0.55);
    } else {
      // 通常時はスタート段数0固定
      this._startStageInput = { node: { value: '0' } };
    }

    // --- ヘルプボタン (右上) ---
    const helpBtn = this.add.text(W - 14, 14, '❓', {
      fontSize: '28px'
    }).setOrigin(1, 0).setInteractive();
    helpBtn.on('pointerdown', () => this._showHelp());

    // --- ゲームスタート & ボスラッシュ (横並び) ---
    const startBtn = this.createButton(W / 2 - 130, H - 55, ' ゲームスタート ', '#1B5E20', '#C8E6C9', () => {
      this.startGame();
    });

    this.createButton(W / 2 + 130, H - 55, ' ⚔️ ボスラッシュ ', '#4A148C', '#CE93D8', () => {
      this.cameras.main.fade(300, 0, 0, 0, false, (_cam, progress) => {
        if (progress === 1) {
          const scenes = ['BossScene', 'MemoryBossScene', 'JankenBossScene'];
          const scene = scenes[Math.floor(Math.random() * scenes.length)];
          this.scene.start(scene, {
            stageCount: 0, bananaScore: 0, wingCount: 0,
            scrollSpeed: CONFIG.SCROLL_SPEED_BASE, bossLevel: 1,
            bossRush: true
          });
        }
      });
    });

    this.tweens.add({
      targets: startBtn,
      scaleX: 1.04, scaleY: 1.04,
      duration: 700, ease: 'Sine.easeInOut',
      yoyo: true, repeat: -1
    });

    // バージョン
    this.add.text(W / 2, H - 16, 'V01.00.04', {
      fontSize: '15px', color: '#aaaaaa', fontFamily: 'Arial',
      stroke: '#000', strokeThickness: 1
    }).setOrigin(0.5);
  }

  async _loadRanking(W, panelY, panelH, halfW) {
    const rightX = W - 15 - halfW;
    const centerX = rightX + halfW / 2;

    const loadingText = this.add.text(centerX, panelY + panelH / 2, '読み込み中...', {
      fontFamily: 'Arial', fontSize: '12px', color: '#888888'
    }).setOrigin(0.5);

    const scores = await fetchScores(10);
    loadingText.destroy();

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.4);
    bg.fillRoundedRect(rightX, panelY, halfW, panelH, 12);

    this.add.text(centerX, panelY + 16, '🏆 ランキング', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '14px',
      color: '#FFD700', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);

    if (scores.length === 0) {
      this.add.text(centerX, panelY + 50, 'データなし', {
        fontFamily: 'Arial', fontSize: '12px', color: '#888888'
      }).setOrigin(0.5);
      return;
    }

    scores.forEach((entry, idx) => {
      const rank = idx + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
      const color = rank <= 3 ? '#FFD700' : '#ffffff';
      this.add.text(centerX, panelY + 38 + idx * 23, `${medal} ${entry.name}  ${entry.score}pt`, {
        fontFamily: 'Arial', fontSize: '13px',
        color, stroke: '#000', strokeThickness: 1
      }).setOrigin(0.5);
    });
  }

  /**
   * ボタンを生成する
   * @param {number} x
   * @param {number} y
   * @param {string} label
   * @param {string} bgColor  CSS color (hex string)
   * @param {string} fgColor  CSS color
   * @param {Function} onClick
   */
  createButton(x, y, label, bgColor, fgColor, onClick) {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    const textObj = this.add.text(0, 0, label, {
      fontFamily: '"M PLUS Rounded 1c", Arial Black, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: fgColor,
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    const pad = 18;
    const bw = textObj.width + pad * 2;
    const bh = 52;

    bg.fillStyle(parseInt(bgColor.replace('#', ''), 16), 1);
    bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 14);
    bg.lineStyle(3, 0xffffff, 0.3);
    bg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 14);

    container.add([bg, textObj]);
    container.setSize(bw, bh);
    container.setInteractive();

    container.on('pointerdown', () => {
      this.tweens.add({ targets: container, scaleX: 0.92, scaleY: 0.92, duration: 80, yoyo: true });
      onClick();
    });
    container.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(parseInt(bgColor.replace('#', ''), 16), 0.8);
      bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 14);
    });
    container.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(parseInt(bgColor.replace('#', ''), 16), 1);
      bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 14);
    });

    return container;
  }

  _showHelp() {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const helpContainer = this.add.container(0, 0).setDepth(500);

    // 背景オーバーレイ
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.85);
    overlay.fillRect(0, 0, W, H);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains);
    helpContainer.add(overlay);

    // スクロール用の内容配置
    const pages = [
      {
        title: '基本ルール',
        lines: [
          'タップでジャンプ！',
          '足場を登ってどこまでも上を目指そう',
          '',
          '🍌 バナナを集めてスコアUP',
          '最終スコア = 段数 + バナナ×2',
          '',
          '画面の左右はループしている',
          '端から出ると反対側に出現',
          '',
          '⚠️ 300段以降は足場が崩れる！',
          '乗った足場は4秒で消滅',
        ]
      },
      {
        title: 'アイテム＆エネミー',
        lines: [
          '🍌 バナナ',
          '  足場の上に出現、スコアに加算',
          '',
          '👼 ゴールドバナナ（味方）',
          '  触れるとバナナが3倍に！',
          '',
          '🦸 バナナヒーロー（味方）',
          '  触れると羽を獲得（最大2つ）',
          '  羽があると落下時に復活できる',
          '  敵の攻撃もガードできる',
          '  空中タップで二段ジャンプも可能！',
          '',
          '👿 エネミー',
          '  画面を飛び回りプレイヤーを狙う',
          '  触れるとバナナが半減！',
          '  （羽があればガード可能）',
          '',
          '💀 罠床（100段以降）',
          '  色が暗い足場は罠！',
          '  一度だけ乗れるが次はすり抜ける',
        ]
      },
      {
        title: 'ボス戦',
        lines: [
          '100段ごとにボス戦が発生！',
          '',
          '【しりとりバトル】',
          '  パネルの絵でしりとり対決',
          '  正解するとボスのライフが減る',
          '  ライフを0にすれば勝利！',
          '  勝利: 残り時間のバナナボーナス',
          '',
          '【神経衰弱バトル】',
          '  カードをめくってペアを探す',
          '  ボスより多く揃えれば勝利！',
          '  勝利: 獲得枚数×3のバナナ',
          '',
          '【じゃんけんバトル】',
          '  グー/チョキ/パー各3枚の手札で勝負',
          '  9回戦で勝ち越せば勝利！',
          '  勝利: 勝ち数×5のバナナ',
          '',
          '敗北: バナナ1/3に減少＆羽没収',
          '（1000段以降は敗北=即ゲームオーバー）',
        ]
      },
      {
        title: 'ボスラッシュ',
        lines: [
          'タイトル画面から挑戦できる特別モード',
          '',
          'しりとり・神経衰弱・じゃんけんの',
          'ボス戦が次々と出題される！',
          '',
          '勝利するたびに:',
          '  撃破ボーナス +50pt',
          '  各ボス戦の報酬バナナも獲得',
          '',
          '1回でも負けたら即ゲームオーバー！',
          'どこまで勝ち続けられるか挑戦しよう',
        ]
      }
    ];

    let currentPage = 0;

    // タイトル
    const titleText = this.add.text(W / 2, 40, '', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '24px',
      color: '#FFD700', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);
    helpContainer.add(titleText);

    // 内容テキスト
    const bodyText = this.add.text(W / 2, 80, '', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '14px',
      color: '#ffffff', stroke: '#000', strokeThickness: 2,
      lineSpacing: 6, align: 'left',
      wordWrap: { width: W - 60 }
    }).setOrigin(0.5, 0);
    helpContainer.add(bodyText);

    // ページ番号
    const pageText = this.add.text(W / 2, H - 100, '', {
      fontFamily: 'Arial', fontSize: '13px', color: '#888888'
    }).setOrigin(0.5);
    helpContainer.add(pageText);

    const renderPage = () => {
      const page = pages[currentPage];
      titleText.setText(page.title);
      bodyText.setText(page.lines.join('\n'));
      pageText.setText(`${currentPage + 1} / ${pages.length}`);
    };

    renderPage();

    // ナビボタン
    if (pages.length > 1) {
      const prevBtn = this.add.text(30, H - 100, '◀ 前', {
        fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '16px',
        color: '#00E5FF', stroke: '#000', strokeThickness: 2
      }).setInteractive();
      helpContainer.add(prevBtn);

      const nextBtn = this.add.text(W - 30, H - 100, '次 ▶', {
        fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '16px',
        color: '#00E5FF', stroke: '#000', strokeThickness: 2
      }).setOrigin(1, 0).setInteractive();
      helpContainer.add(nextBtn);

      prevBtn.on('pointerdown', () => {
        if (currentPage > 0) { currentPage--; renderPage(); }
      });
      nextBtn.on('pointerdown', () => {
        if (currentPage < pages.length - 1) { currentPage++; renderPage(); }
      });
    }

    // 閉じるボタン
    const closeBtn = this.add.text(W / 2, H - 50, '✕ とじる', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '20px',
      color: '#ffffff', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setInteractive();
    helpContainer.add(closeBtn);

    closeBtn.on('pointerdown', () => {
      helpContainer.destroy();
    });
  }

  startGame() {
    const startStage = parseInt(this._startStageInput.node.value, 10) || 0;
    this.cameras.main.fade(300, 0, 0, 0, false, (_cam, progress) => {
      if (progress === 1) {
        this.scene.start('GameScene', { stageCount: startStage, bananaScore: 0, scrollSpeed: CONFIG.SCROLL_SPEED_BASE });
      }
    });
  }
}
