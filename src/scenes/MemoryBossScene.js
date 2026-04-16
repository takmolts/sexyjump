import Phaser from 'phaser';
import { CONFIG } from '../GameConfig.js';

/**
 * MemoryBossScene - 神経衰弱ボス戦
 *
 * ルール:
 *  - 4×6 = 24枚 (12ペア) のカードを裏向きに配置
 *  - プレイヤーとボスが交互に2枚ずつめくる
 *  - 一致すればそのプレイヤーが獲得しもう一度手番
 *  - 不一致なら裏に戻して相手の番
 *  - 全ペア揃ったらボスより多ければ勝ち
 *  - 勝利: めくった回数×2 のバナナ獲得
 *  - 敗北: バナナ1/3、羽没収
 */
export default class MemoryBossScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MemoryBossScene' });
  }

  init(data) {
    this.stageCount  = data.stageCount  || 100;
    this.bananaScore = data.bananaScore || 0;
    this.scrollSpeed = data.scrollSpeed || CONFIG.SCROLL_SPEED_BASE;
    this.wingCount   = data.wingCount   || 0;
    this.bossLevel   = data.bossLevel   || 1;
    this.bossRush    = data.bossRush   || false;

    this.playerPairs = 0;
    this.bossPairs   = 0;
    this.flipCount   = 0;       // プレイヤーのめくり回数
    this.totalPairs  = 12;

    this.state = 'PLAYER_TURN'; // PLAYER_TURN | BOSS_TURN | RESULT
    this.flippedCards = [];      // 現在めくられているカード (最大2枚)
    this.matchedIds  = new Set();
  }

  create() {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

    // 背景
    const bgGfx = this.add.graphics();
    bgGfx.fillGradientStyle(0x0a1a3a, 0x0a1a3a, 0x1a0a2a, 0x1a0a2a, 1);
    bgGfx.fillRect(0, 0, W, H);

    for (let i = 0; i < 12; i++) {
      const hx = this.add.graphics();
      hx.lineStyle(1, 0xffffff, 0.04);
      hx.strokeCircle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), Phaser.Math.Between(30, 80));
    }

    // ボスキャラ (強さと連動: 01=最弱, 02=普通, 03=最強)
    const bossKeys = ['boss_01', 'boss_02', 'boss_03'];
    this.bossAILevel = Math.floor(Math.random() * 3); // 0=最弱, 1=普通, 2=最強
    const bossKey = bossKeys[this.bossAILevel];
    const bossImg = this.add.image(W * 0.78, 60, bossKey).setDisplaySize(80, 80).setFlipX(true);
    this.tweens.add({
      targets: bossImg, y: 65, duration: 1000,
      ease: 'Sine.easeInOut', yoyo: true, repeat: -1
    });

    // プレイヤーキャラ
    const playerImg = this.add.sprite(W * 0.22, 60, 'player').setDisplaySize(50, 50);
    playerImg.play('player_run');
    this.tweens.add({
      targets: playerImg, y: 65, duration: 800,
      ease: 'Sine.easeInOut', yoyo: true, repeat: -1
    });

    // スコア表示
    this.playerScoreText = this.add.text(W * 0.22, 95, '0枚', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '26px',
      color: '#FFD700', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);

    this.bossScoreText = this.add.text(W * 0.78, 95, '0枚', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '26px',
      color: '#FF5722', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);

    // ターン表示
    this.turnText = this.add.text(W / 2, 55, 'あなたの番！', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '16px',
      color: '#00E5FF', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5);

    // 段数・バナナUI
    this.add.text(W / 2, 20, `${this.stageCount}段 🍌${this.bananaScore}本`, {
      fontFamily: 'Arial', fontSize: '12px', color: '#888888'
    }).setOrigin(0.5);

    // カードグリッド生成
    this._createCardGrid();

    // BGM再生
    this.bgm = this.sound.add('bgm_boss', { loop: true, volume: 0.5 });
    this.bgm.play();

    // フェードイン
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  _createCardGrid() {
    const W = CONFIG.WIDTH;
    const cols = 4, rows = 6;
    const cardW = 78, cardH = 90;
    const marginX = (W - cols * cardW) / (cols + 1);
    const startY = 120;
    const gapY = 6;

    // 12ペア分のパネルをランダム選択
    const allPanels = this.cache.json.get('panels');
    const shuffled = Phaser.Utils.Array.Shuffle([...allPanels]);
    const selectedPanels = shuffled.slice(0, this.totalPairs);

    // 各パネルを2枚ずつ配列にしてシャッフル
    const cardData = [];
    selectedPanels.forEach(panel => {
      cardData.push({ ...panel, pairKey: panel.id });
      cardData.push({ ...panel, pairKey: panel.id });
    });
    Phaser.Utils.Array.Shuffle(cardData);

    this.cards = [];

    cardData.forEach((data, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = marginX + col * (cardW + marginX) + cardW / 2;
      const cy = startY + row * (cardH + gapY) + cardH / 2;

      // 裏面 (青いカード)
      const back = this.add.graphics();
      back.fillStyle(0x1a3a6a, 1);
      back.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 8);
      back.lineStyle(2, 0x4488cc, 0.8);
      back.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 8);
      // 中央に？マーク
      const qMark = this.add.text(0, 0, '?', {
        fontSize: '28px', fontFamily: 'Arial Black',
        color: '#4488cc', stroke: '#1a2a4a', strokeThickness: 2
      }).setOrigin(0.5);

      const backContainer = this.add.container(cx, cy, [back, qMark]).setDepth(5);

      // 表面 (パネル画像)
      const face = this.add.image(cx, cy, `panel_${data.id}`)
        .setDisplaySize(cardW - 4, cardH - 4)
        .setDepth(4)
        .setVisible(false);

      // インタラクション用のヒットエリア
      backContainer.setSize(cardW, cardH);
      backContainer.setInteractive();

      const card = {
        idx,
        data,
        face,
        backContainer,
        cx, cy,
        isFlipped: false,
        isMatched: false
      };

      backContainer.on('pointerdown', () => this._onCardTap(card));

      this.cards.push(card);
    });
  }

  _onCardTap(card) {
    if (this.state !== 'PLAYER_TURN') return;
    if (card.isFlipped || card.isMatched) return;
    if (this.flippedCards.length >= 2) return;

    this._flipCard(card, true);
    this.flippedCards.push(card);
    this.flipCount++;

    if (this.flippedCards.length === 2) {
      // 2枚めくった → 判定
      this.state = 'CHECKING';
      this.time.delayedCall(800, () => this._checkMatch(true));
    }
  }

  _flipCard(card, faceUp) {
    if (faceUp) {
      card.backContainer.setVisible(false);
      card.face.setVisible(true);
      card.isFlipped = true;
    } else {
      card.backContainer.setVisible(true);
      card.face.setVisible(false);
      card.isFlipped = false;
    }
  }

  _checkMatch(isPlayer) {
    const [c1, c2] = this.flippedCards;

    // 最強ボスはプレイヤーがめくったカードも記憶する
    if (isPlayer && this.bossAILevel === 2 && this._bossMemory) {
      const ai = { maxMemory: 99 };
      if (!this._bossMemory.includes(c1) && this._bossMemory.length < ai.maxMemory) this._bossMemory.push(c1);
      if (!this._bossMemory.includes(c2) && this._bossMemory.length < ai.maxMemory) this._bossMemory.push(c2);
    }

    if (c1.data.pairKey === c2.data.pairKey) {
      // 一致！
      c1.isMatched = true;
      c2.isMatched = true;

      // 枠を光らせる
      const color = isPlayer ? 0x00e5ff : 0xff5722;
      [c1, c2].forEach(c => {
        c.face.setAlpha(0.5);
        const glow = this.add.graphics().setDepth(10);
        glow.lineStyle(3, color, 1);
        glow.strokeRoundedRect(c.cx - 39, c.cy - 45, 78, 90, 8);
        this.tweens.add({ targets: glow, alpha: 0.3, duration: 500 });
      });

      if (isPlayer) {
        this.playerPairs++;
        this.playerScoreText.setText(`${this.playerPairs}枚`);
      } else {
        this.bossPairs++;
        this.bossScoreText.setText(`${this.bossPairs}枚`);
      }

      this.flippedCards = [];

      // 全ペア揃ったか
      if (this.playerPairs + this.bossPairs >= this.totalPairs) {
        this.time.delayedCall(600, () => this._endBattle());
        return;
      }

      // 一致ならもう一回同じ人の番
      if (isPlayer) {
        this.state = 'PLAYER_TURN';
      } else {
        this.time.delayedCall(800, () => this._bossTurn());
      }
    } else {
      // 不一致 → 裏に戻す
      this.time.delayedCall(400, () => {
        this._flipCard(c1, false);
        this._flipCard(c2, false);
        this.flippedCards = [];

        if (isPlayer) {
          // ボスの番
          this.state = 'BOSS_TURN';
          this.turnText.setText('ボスの番…');
          this.turnText.setColor('#FF5722');
          this.time.delayedCall(800, () => this._bossTurn());
        } else {
          // プレイヤーの番
          this.state = 'PLAYER_TURN';
          this.turnText.setText('あなたの番！');
          this.turnText.setColor('#00E5FF');
        }
      });
    }
  }

  // ボスAI
  _bossTurn() {
    if (this.state === 'RESULT') return;

    const available = this.cards.filter(c => !c.isMatched && !c.isFlipped);
    if (available.length < 2) {
      this._endBattle();
      return;
    }

    // ボスAI: bossAILevel に応じて強さが変わる
    // 0=最弱: 記憶しない、完全ランダム
    // 1=普通: 記憶あり(最大8枚)、ペア発見率40%
    // 2=最強: 記憶あり(全部)、ペア発見率80%、プレイヤーがめくったカードも覚える
    const AI_PARAMS = [
      { memoryChance: 0,    maxMemory: 0,  spyPlayer: false },
      { memoryChance: 0.3,  maxMemory: 8,  spyPlayer: false },
      { memoryChance: 0.5,  maxMemory: 99, spyPlayer: true  },
    ];
    const ai = AI_PARAMS[this.bossAILevel];

    let pick1, pick2;

    if (!this._bossMemory) this._bossMemory = [];

    if (Math.random() < ai.memoryChance && this._bossMemory.length >= 2) {
      // 記憶からペアを探す
      const mem = this._bossMemory.filter(c => !c.isMatched);
      let foundPair = false;
      for (let i = 0; i < mem.length && !foundPair; i++) {
        for (let j = i + 1; j < mem.length && !foundPair; j++) {
          if (mem[i].data.pairKey === mem[j].data.pairKey) {
            pick1 = mem[i];
            pick2 = mem[j];
            foundPair = true;
          }
        }
      }
    }

    if (!pick1) {
      // ランダムに2枚選ぶ
      Phaser.Utils.Array.Shuffle(available);
      pick1 = available[0];
      pick2 = available[1];
    }

    // ボスの記憶に追加 (上限あり)
    const addMemory = (card) => {
      if (!this._bossMemory.includes(card) && this._bossMemory.length < ai.maxMemory) {
        this._bossMemory.push(card);
      }
    };
    addMemory(pick1);
    addMemory(pick2);

    // 1枚目をめくる
    this._flipCard(pick1, true);
    this.flippedCards = [pick1];

    this.time.delayedCall(600, () => {
      // 2枚目をめくる
      this._flipCard(pick2, true);
      this.flippedCards.push(pick2);

      this.time.delayedCall(800, () => this._checkMatch(false));
    });
  }

  _endBattle() {
    this.state = 'RESULT';
    if (this.bgm) this.bgm.stop();

    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const playerWins = this.playerPairs >= this.bossPairs; // 引き分けも勝利

    const overlay = this.add.graphics().setDepth(100);
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, W, H);
    overlay.setAlpha(0);
    this.tweens.add({ targets: overlay, alpha: 1, duration: 400 });

    const resultText = playerWins ? '🎉 勝利！' : '💀 敗北…';
    const resultColor = playerWins ? '#FFD700' : '#F44336';
    let subText;

    if (playerWins) {
      const bonus = this.playerPairs * 3;
      this.bananaScore += bonus;
      subText = `${this.playerPairs} vs ${this.bossPairs}\nバナナ +${bonus}本！`;
    } else if (this.bossRush || this.stageCount >= 1000) {
      subText = `${this.playerPairs} vs ${this.bossPairs}\nGAME OVER`;
    } else {
      const lost = this.bananaScore - Math.floor(this.bananaScore / 3);
      this.bananaScore = Math.floor(this.bananaScore / 3);
      subText = `${this.playerPairs} vs ${this.bossPairs}\nバナナ -${lost}本、翼を奪われた…`;
    }

    const rt = this.add.text(W / 2, H / 2 - 60, resultText, {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '52px',
      color: resultColor, stroke: '#000', strokeThickness: 7
    }).setOrigin(0.5).setDepth(110).setAlpha(0);

    const st = this.add.text(W / 2, H / 2 + 10, subText, {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '20px',
      color: '#ffffff', stroke: '#000', strokeThickness: 3,
      align: 'center'
    }).setOrigin(0.5).setDepth(110).setAlpha(0);

    this.tweens.add({ targets: [rt, st], alpha: 1, duration: 600, delay: 200 });

    this.time.delayedCall(3000, () => {
      this.cameras.main.fade(500, 0, 0, 0, false, (_cam, progress) => {
        if (progress === 1) {
          if (!playerWins && (this.bossRush || this.stageCount >= 1000)) {
            this.scene.start('GameOverScene', {
              stageCount: this.stageCount,
              bananaScore: this.bananaScore,
              totalScore: this.stageCount + this.bananaScore * 2
            });
          } else if (playerWins && this.bossRush) {
            // ボスラッシュ: 次のボス戦へ
            const nextScene = Math.random() < 0.5 ? 'BossScene' : 'MemoryBossScene';
            this.scene.start(nextScene, {
              stageCount: this.stageCount,
              bananaScore: this.bananaScore,
              wingCount: this.wingCount,
              scrollSpeed: this.scrollSpeed,
              bossLevel: this.bossLevel + 1,
              bossRush: true
            });
          } else {
            this.scene.start('GameScene', {
              stageCount: this.stageCount,
              bananaScore: this.bananaScore,
              wingCount: playerWins ? this.wingCount : 0,
              scrollSpeed: Math.max(CONFIG.SCROLL_SPEED_BASE, this.scrollSpeed - 8)
            });
          }
        }
      });
    });
  }
}
