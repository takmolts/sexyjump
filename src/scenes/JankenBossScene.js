import Phaser from 'phaser';
import { CONFIG } from '../GameConfig.js';

/**
 * JankenBossScene - じゃんけんカードボス戦
 *
 * ルール:
 *  - プレイヤーとボスがそれぞれグー×3, チョキ×3, パー×3 の9枚を所持
 *  - 毎ラウンド、プレイヤーがカードを選んで決定→ボスも1枚出す→勝敗判定
 *  - 9ラウンド終了後、勝ち数が多い方が勝利
 *  - ボス04=最弱(ランダム), 05=普通(自分の履歴考慮), 06=最強(相手の残り把握)
 */
export default class JankenBossScene extends Phaser.Scene {
  constructor() {
    super({ key: 'JankenBossScene' });
  }

  init(data) {
    this.stageCount  = data.stageCount  || 100;
    this.bananaScore = data.bananaScore || 0;
    this.scrollSpeed = data.scrollSpeed || CONFIG.SCROLL_SPEED_BASE;
    this.wingCount   = data.wingCount   || 0;
    this.bossLevel   = data.bossLevel   || 1;
    this.bossRush    = data.bossRush    || false;

    this.playerWins = 0;
    this.bossWins   = 0;
    this.draws      = 0;
    this.round      = 0;
    this.totalRounds = 9;

    // 手札: gu=グー, ty=チョキ, pa=パー
    this.playerHand = ['gu','gu','gu','ty','ty','ty','pa','pa','pa'];
    this.bossHand   = ['gu','gu','gu','ty','ty','ty','pa','pa','pa'];

    this.selectedCard = null;
    this.state = 'SELECT'; // SELECT | REVEAL | RESULT

    // プレイヤーが出した履歴
    this.playerHistory = [];
    this.bossHistory   = [];
  }

  create() {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

    // 背景
    const bgGfx = this.add.graphics();
    bgGfx.fillGradientStyle(0x1a1a0a, 0x1a1a0a, 0x0a1a2a, 0x0a1a2a, 1);
    bgGfx.fillRect(0, 0, W, H);

    for (let i = 0; i < 12; i++) {
      const hx = this.add.graphics();
      hx.lineStyle(1, 0xffffff, 0.04);
      hx.strokeCircle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), Phaser.Math.Between(30, 80));
    }

    // ボスキャラ (04〜06)
    this.bossAILevel = Math.floor(Math.random() * 3); // 0=最弱, 1=普通, 2=最強
    const bossKey = ['boss_04', 'boss_05', 'boss_06'][this.bossAILevel];
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
    this.playerScoreText = this.add.text(W * 0.22, 95, '0勝', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '22px',
      color: '#FFD700', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5);

    this.bossScoreText = this.add.text(W * 0.78, 95, '0勝', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '22px',
      color: '#FF5722', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5);

    // ラウンド表示
    this.roundText = this.add.text(W / 2, 30, `Round 1 / ${this.totalRounds}`, {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '16px',
      color: '#ffffff', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5);

    // 対戦エリア (出したカード表示)
    this.battleArea = this.add.container(0, 0);

    // プレイヤー側の出したカード
    this.playerPlayedImg = this.add.image(W * 0.3, 220, 'jan_gu')
      .setDisplaySize(100, 100).setAlpha(0);
    this.bossPlayedImg = this.add.image(W * 0.7, 220, 'jan_gu')
      .setDisplaySize(100, 100).setAlpha(0);

    // VS テキスト
    this.add.text(W / 2, 220, 'VS', {
      fontFamily: 'Arial Black', fontSize: '28px',
      color: '#ffffff', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);

    // 結果テキスト
    this.resultText = this.add.text(W / 2, 290, '', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '28px',
      color: '#FFD700', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);

    // ボスの手札表示 (裏向き)
    this._createBossHandDisplay(W);

    // プレイヤーの手札カード
    this._createPlayerCards(W, H);

    // 決定ボタン
    this.confirmBtn = this._createButton(W / 2, H - 50, '  決定！  ', '#1B5E20', '#C8E6C9', () => {
      this._onConfirm();
    });
    this.confirmBtn.setAlpha(0.4);

    // BGM再生
    this.bgm = this.sound.add('bgm_boss', { loop: true, volume: 0.5 });
    this.bgm.play();

    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  _createBossHandDisplay(W) {
    this.bossCardBacks = [];
    const startX = 45;
    const gap = 35;
    const y = 140;
    for (let i = 0; i < 9; i++) {
      const back = this.add.graphics();
      back.fillStyle(0x880000, 1);
      back.fillRoundedRect(-14, -18, 28, 36, 5);
      back.lineStyle(1, 0xff4444, 0.6);
      back.strokeRoundedRect(-14, -18, 28, 36, 5);
      const q = this.add.text(0, 0, '?', {
        fontSize: '16px', fontFamily: 'Arial Black', color: '#ff6666'
      }).setOrigin(0.5);
      const container = this.add.container(startX + i * gap, y, [back, q]);
      this.bossCardBacks.push(container);
    }
  }

  _createPlayerCards(W, H) {
    this.playerCards = [];
    const CARD_KEYS = { gu: 'jan_gu', ty: 'jan_tyoki', pa: 'jan_pa' };
    const CARD_LABELS = { gu: 'グー', ty: 'チョキ', pa: 'パー' };

    // 3行に配置: グー3枚、チョキ3枚、パー3枚
    const types = ['gu', 'ty', 'pa'];
    const startY = 370;
    const rowGap = 90;
    const cardSize = 72;

    types.forEach((type, row) => {
      for (let col = 0; col < 3; col++) {
        const idx = row * 3 + col;
        const cx = W / 2 + (col - 1) * (cardSize + 16);
        const cy = startY + row * rowGap;

        const img = this.add.image(cx, cy, CARD_KEYS[type])
          .setDisplaySize(cardSize, cardSize)
          .setInteractive();

        // ラベル
        const label = this.add.text(cx, cy + cardSize / 2 + 8, CARD_LABELS[type], {
          fontFamily: 'Arial', fontSize: '11px', color: '#aaaaaa'
        }).setOrigin(0.5);

        const card = { type, img, label, used: false, idx };

        img.on('pointerdown', () => this._selectCard(card));

        this.playerCards.push(card);
      }
    });
  }

  _selectCard(card) {
    if (this.state !== 'SELECT' || card.used) return;

    // 前の選択を解除
    if (this.selectedCard) {
      this.selectedCard.img.clearTint();
    }

    this.selectedCard = card;
    card.img.setTint(0x00e5ff);
    this.confirmBtn.setAlpha(1);
  }

  _onConfirm() {
    if (this.state !== 'SELECT' || !this.selectedCard) return;
    this.state = 'REVEAL';

    const playerType = this.selectedCard.type;

    // プレイヤーのカードを使用済みにする
    this.selectedCard.used = true;
    this.selectedCard.img.setAlpha(0.3).clearTint().disableInteractive();
    this.selectedCard = null;
    this.confirmBtn.setAlpha(0.4);

    // ボスのカード選択
    const bossType = this._bossChoose(playerType);

    // ボスの手札から除去
    const bossIdx = this.bossHand.indexOf(bossType);
    this.bossHand.splice(bossIdx, 1);

    // プレイヤーの手札から除去
    const playerIdx = this.playerHand.indexOf(playerType);
    this.playerHand.splice(playerIdx, 1);

    // 履歴追加
    this.playerHistory.push(playerType);
    this.bossHistory.push(bossType);

    // ボスの裏カードを1枚消す
    const backCard = this.bossCardBacks.pop();
    if (backCard) {
      this.tweens.add({ targets: backCard, alpha: 0, duration: 300 });
    }

    // カード表示
    const CARD_KEYS = { gu: 'jan_gu', ty: 'jan_tyoki', pa: 'jan_pa' };
    this.playerPlayedImg.setTexture(CARD_KEYS[playerType]).setAlpha(1);

    // ボスカードは一瞬遅れて表示
    this.bossPlayedImg.setAlpha(0);
    this.time.delayedCall(500, () => {
      this.bossPlayedImg.setTexture(CARD_KEYS[bossType]).setAlpha(1);

      // 判定
      const result = this._judge(playerType, bossType);
      this.round++;

      let resultStr, resultColor;
      if (result === 'win') {
        this.playerWins++;
        resultStr = 'WIN!';
        resultColor = '#FFD700';
      } else if (result === 'lose') {
        this.bossWins++;
        resultStr = 'LOSE...';
        resultColor = '#F44336';
      } else {
        this.draws++;
        resultStr = 'DRAW';
        resultColor = '#aaaaaa';
      }

      this.resultText.setText(resultStr).setColor(resultColor);
      this.playerScoreText.setText(`${this.playerWins}勝`);
      this.bossScoreText.setText(`${this.bossWins}勝`);
      this.roundText.setText(`Round ${Math.min(this.round + 1, this.totalRounds)} / ${this.totalRounds}`);

      // 次のラウンドへ or 終了
      this.time.delayedCall(1500, () => {
        this.resultText.setText('');
        this.playerPlayedImg.setAlpha(0);
        this.bossPlayedImg.setAlpha(0);

        if (this.round >= this.totalRounds) {
          this._endBattle();
        } else {
          this.state = 'SELECT';
        }
      });
    });
  }

  _judge(player, boss) {
    if (player === boss) return 'draw';
    if ((player === 'gu' && boss === 'ty') ||
        (player === 'ty' && boss === 'pa') ||
        (player === 'pa' && boss === 'gu')) return 'win';
    return 'lose';
  }

  // ボスAI
  _bossChoose(playerType) {
    const hand = [...this.bossHand];
    if (hand.length === 0) return 'gu';

    if (this.bossAILevel === 0) {
      // 最弱: 完全ランダム
      return hand[Math.floor(Math.random() * hand.length)];
    }

    if (this.bossAILevel === 1) {
      // 普通: プレイヤーの履歴から傾向を読む
      // プレイヤーが多く出した手に勝てる手を優先
      const counts = { gu: 0, ty: 0, pa: 0 };
      this.playerHistory.forEach(h => counts[h]++);
      const mostPlayed = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      const counter = { gu: 'pa', ty: 'gu', pa: 'ty' };
      const preferred = counter[mostPlayed];

      // 手札にあれば60%で出す
      if (hand.includes(preferred) && Math.random() < 0.6) {
        return preferred;
      }
      return hand[Math.floor(Math.random() * hand.length)];
    }

    // 最強: プレイヤーの残り手札を把握して最適手を選ぶ
    // プレイヤーの残り手札をカウント
    const playerRemain = { gu: 0, ty: 0, pa: 0 };
    this.playerHand.forEach(h => playerRemain[h]++);

    // 各手の期待勝率を計算
    const total = this.playerHand.length || 1;
    const winMap = { gu: 'ty', ty: 'pa', pa: 'gu' };
    const loseMap = { gu: 'pa', ty: 'gu', pa: 'ty' };

    let bestHand = null;
    let bestScore = -Infinity;

    const uniqueHands = [...new Set(hand)];
    for (const h of uniqueHands) {
      // この手を出した場合: 勝てる確率 - 負ける確率
      const winProb = playerRemain[winMap[h]] / total;
      const loseProb = playerRemain[loseMap[h]] / total;
      const score = winProb - loseProb;
      if (score > bestScore) {
        bestScore = score;
        bestHand = h;
      }
    }

    return bestHand || hand[Math.floor(Math.random() * hand.length)];
  }

  _endBattle() {
    this.state = 'RESULT';
    if (this.bgm) this.bgm.stop();

    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const playerWins = this.playerWins >= this.bossWins; // 引き分けも勝利

    const overlay = this.add.graphics().setDepth(100);
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, W, H);
    overlay.setAlpha(0);
    this.tweens.add({ targets: overlay, alpha: 1, duration: 400 });

    const resultText = playerWins ? '🎉 勝利！' : '💀 敗北…';
    const resultColor = playerWins ? '#FFD700' : '#F44336';
    let subText;

    if (playerWins) {
      const bonus = this.playerWins * 5;
      this.bananaScore += bonus;
      subText = `${this.playerWins}勝 ${this.bossWins}敗 ${this.draws}分\nバナナ +${bonus}本！`;
    } else if (this.bossRush || this.stageCount >= 1000) {
      subText = `${this.playerWins}勝 ${this.bossWins}敗 ${this.draws}分\nGAME OVER`;
    } else {
      const lost = this.bananaScore - Math.floor(this.bananaScore / 3);
      this.bananaScore = Math.floor(this.bananaScore / 3);
      subText = `${this.playerWins}勝 ${this.bossWins}敗 ${this.draws}分\nバナナ -${lost}本、翼を奪われた…`;
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
            const scenes = ['BossScene', 'MemoryBossScene', 'JankenBossScene'];
            const nextScene = scenes[Math.floor(Math.random() * scenes.length)];
            this.scene.start(nextScene, {
              stageCount: this.stageCount + 50,
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

  _createButton(x, y, label, bgColor, fgColor, onClick) {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    const textObj = this.add.text(0, 0, label, {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '20px',
      fontStyle: 'bold', color: fgColor, stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5);

    const pad = 16;
    const bw = textObj.width + pad * 2;
    const bh = 48;

    bg.fillStyle(parseInt(bgColor.replace('#', ''), 16), 1);
    bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
    bg.lineStyle(2, 0xffffff, 0.3);
    bg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);

    container.add([bg, textObj]);
    container.setSize(bw, bh);
    container.setInteractive();
    container.on('pointerdown', () => {
      this.tweens.add({ targets: container, scaleX: 0.92, scaleY: 0.92, duration: 80, yoyo: true });
      onClick();
    });

    return container;
  }
}
