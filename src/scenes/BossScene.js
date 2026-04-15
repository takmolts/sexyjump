import Phaser from 'phaser';
import { CONFIG } from '../GameConfig.js';

// -------------------------------------------------------
// しりとりユーティリティ
// -------------------------------------------------------
const SMALL_KANA = new Set(['ゃ','ゅ','ょ','ぁ','ぃ','ぅ','ぇ','ぉ','っ','ャ','ュ','ョ','ァ','ィ','ゥ','ェ','ォ','ッ']);

/** 語尾の単位を返す (拗音・長音を考慮) */
function getLastUnit(word) {
  if (!word || word.length === 0) return '';
  const n = word.length;
  let last = word[n - 1];

  // 長音 ー → 1つ前の文字
  if (last === 'ー') {
    if (n >= 2) {
      const prev = word[n - 2];
      if (SMALL_KANA.has(prev) && n >= 3) {
        return word[n - 3] + prev;
      }
      return prev;
    }
    return last;
  }

  // 末尾が小仮名 → 1つ前と結合
  if (SMALL_KANA.has(last) && n >= 2) {
    return word[n - 2] + last;
  }

  return last;
}

/** 語頭の単位を返す (拗音を考慮) */
function getFirstUnit(word) {
  if (!word || word.length === 0) return '';
  if (word.length >= 2 && SMALL_KANA.has(word[1])) {
    return word[0] + word[1];
  }
  return word[0];
}

/** パネルの readings のうち requiredStart で始まる候補を返す */
function validReadings(panel, requiredStart) {
  return panel.readings.filter(r => getFirstUnit(r) === requiredStart);
}

/**
 * BossScene - ワギャンランド風しりとりボス戦
 *
 * ルール:
 *  - ボスが最初の単語を提示する
 *  - プレイヤーは表示パネルをタップして、直前の単語の末尾から始まる読みのパネルを選ぶ
 *  - 正解: +1ポイント, タイマー +BONUS 秒, ボスの番へ
 *  - 不正解: タイマー -PENALTY 秒
 *  - ボスの番: AIがパネルを選択 (2秒後)
 *    - 有効パネルなし → プレイヤーの勝利
 *  - タイマー 0 or 全パネル消費 → 獲得ポイント vs 目標ポイントで勝敗決定
 *  - 「ん」終わり → 次の番の人に有効パネルなし → 即座に決着
 */
export default class BossScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BossScene' });
  }

  // -------------------------------------------------
  init(data) {
    this.stageCount  = data.stageCount  || 100;
    this.bananaScore = data.bananaScore || 0;
    this.scrollSpeed = data.scrollSpeed || CONFIG.SCROLL_SPEED_BASE;
    this.wingCount   = data.wingCount   || 0;
    this.bossLevel   = data.bossLevel   || 1;
    this.isDebug     = data.debug || false;

    // ボスごとのパラメーター
    this.timeLimit   = Math.max(CONFIG.BOSS_TIME_MIN, CONFIG.BOSS_TIME_BASE + (this.bossLevel - 1) * CONFIG.BOSS_TIME_PER_BOSS);
    this.timeLeft    = this.timeLimit;
    this.bossLife    = 3;         // ボスのライフ
    this.playerScore = 0;

    // ゲーム状態
    this.state       = 'PLAYER_TURN'; // PLAYER_TURN | BOSS_TURN | RESULT
    this.currentWord = '';
    this.requiredStart = '';
    this.usedPanelIds  = new Set();

    // 全パネルデータ
    this.allPanels = this.cache.json.get('panels');
    // 今回表示するパネル (BOSS_PANEL_COUNT 枚ランダム抽出)
    this.displayPanels = Phaser.Utils.Array.Shuffle([...this.allPanels])
      .slice(0, CONFIG.BOSS_PANEL_COUNT);

    // ボスの開幕ワード決定: 場のパネルの読みにつながるワードを選ぶ
    // 場にあるパネルの頭文字を収集
    const fieldFirstUnits = new Set();
    for (const panel of this.displayPanels) {
      for (const reading of panel.readings) {
        fieldFirstUnits.add(getFirstUnit(reading));
      }
    }
    // 全パネルの読みから、末尾が場の頭文字と一致するものを候補にする
    const candidates = [];
    for (const panel of this.allPanels) {
      for (const reading of panel.readings) {
        const last = getLastUnit(reading);
        if (last !== 'ん' && fieldFirstUnits.has(last)) {
          candidates.push(reading);
        }
      }
    }
    const chosenWord = candidates[Math.floor(Math.random() * candidates.length)];
    this.currentWord   = chosenWord;
    this.requiredStart = getLastUnit(chosenWord);

    this.bossThinkTimer = null;
    this.bossWon = false;
  }

  // -------------------------------------------------
  create() {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

    // ---- 背景 ----
    const bgGfx = this.add.graphics();
    bgGfx.fillGradientStyle(0x1a0a3a, 0x1a0a3a, 0x0a1a2a, 0x0a1a2a, 1);
    bgGfx.fillRect(0, 0, W, H);

    // 装飾: 六角形パターン風
    for (let i = 0; i < 12; i++) {
      const hx = this.add.graphics();
      hx.lineStyle(1, 0xffffff, 0.04);
      const hcx = Phaser.Math.Between(0, W);
      const hcy = Phaser.Math.Between(0, H);
      const hr  = Phaser.Math.Between(30, 80);
      hx.strokeCircle(hcx, hcy, hr);
    }

    // ---- タイマーバー ----
    this.timerBarBg = this.add.graphics();
    this.timerBarBg.fillStyle(0x333333, 1);
    this.timerBarBg.fillRoundedRect(10, 10, W - 20, 14, 7);

    this.timerBar = this.add.graphics();
    this._updateTimerBar();

    this.timerText = this.add.text(W - 14, 10, `${Math.ceil(this.timeLeft)}秒`, {
      fontFamily: 'Arial', fontSize: '11px', color: '#ffffff'
    }).setOrigin(1, 0);

    // ---- ボスキャラ (ランダム選択、左向きに反転) ----
    const bossKeys = ['boss_01', 'boss_02', 'boss_03'];
    const bossKey = bossKeys[Math.floor(Math.random() * bossKeys.length)];
    const bossImg = this.add.image(W * 0.78, 105, bossKey).setDisplaySize(120, 120).setFlipX(true);
    this.tweens.add({
      targets: bossImg,
      y: 110,
      duration: 1000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    // ---- ボスライフ表示 (ボス画像の下) ----
    this.scoreText = this.add.text(W * 0.78, 170, this._bossLifeText(), {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '16px', color: '#FF5722',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);

    // ---- セリフフキダシ ----
    this.balloonGfx = this.add.graphics();
    this.balloonText = this.add.text(0, 0, '', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '16px',
      color: '#222222',
      wordWrap: { width: 220 }
    });

    // ---- 必要文字表示 ----
    this.requiredLabel = this.add.text(14, 30, '「 」から始まるパネルを選んで！', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '13px',
      color: '#ffffff', stroke: '#000', strokeThickness: 2
    });

    this.requiredCharText = this.add.text(W / 2, 185, '', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '50px',
      fontStyle: 'bold',
      color: '#FFD700',
      stroke: '#000000', strokeThickness: 6,
      shadow: { offsetX: 2, offsetY: 2, color: '#8B4513', blur: 4, fill: true }
    }).setOrigin(0.5);

    this.chainWordText = this.add.text(W / 2, 240, '', {
      fontFamily: 'Arial', fontSize: '13px', color: '#aaaaaa', stroke: '#000', strokeThickness: 1
    }).setOrigin(0.5);

    // ---- プレイヤーキャラ ----
    const playerImg = this.add.sprite(W * 0.18, 115, 'player').setDisplaySize(64, 64);
    playerImg.play('player_run');
    this.tweens.add({
      targets: playerImg,
      y: 120,
      duration: 800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    // 段数・バナナUI
    this.add.text(W / 2, 265, `${this.stageCount}段 🍌${this.bananaScore}本`, {
      fontFamily: 'Arial', fontSize: '12px', color: '#888888'
    }).setOrigin(0.5);

    // ---- パネルグリッド生成 ----
    this.panelObjects = [];
    this._createPanelGrid();

    // ---- ボス開幕メッセージ ----
    this._showBalloon(`「${this.currentWord}」！\nさあ始めるぞ！`);
    this._updateRequiredUI();

    // ---- タイマー ----
    this.timerEvent = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: this._tickTimer,
      callbackScope: this
    });

    // フェードイン
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  // -------------------------------------------------
  // パネルグリッド
  // -------------------------------------------------
  _createPanelGrid() {
    const W = CONFIG.WIDTH;
    const cols = 4;
    const rows = Math.ceil(CONFIG.BOSS_PANEL_COUNT / cols);
    const panelW = 82, panelH = 56;
    const marginX = (W - cols * panelW) / (cols + 1);
    const startY = 260;
    const gapY   = 2;

    this.displayPanels.forEach((panel, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const px = marginX + col * (panelW + marginX) + panelW / 2;
      const py = startY + row * (panelH + gapY) + panelH / 2;

      // スプライト
      const img = this.add.image(px, py, `panel_${panel.id}`)
        .setDisplaySize(panelW, panelH)
        .setInteractive()
        .setDepth(5);

      // setDisplaySize後のscaleを記録
      img._baseScaleX = img.scaleX;
      img._baseScaleY = img.scaleY;

      // クリックイベント
      img.on('pointerdown', () => this._onPanelTap(panel, img));
      img.on('pointerover', () => {
        if (!this.usedPanelIds.has(panel.id)) {
          img.setScale(img._baseScaleX * 1.08, img._baseScaleY * 1.08);
        }
      });
      img.on('pointerout', () => img.setScale(img._baseScaleX, img._baseScaleY));

      this.panelObjects.push({ panel, img, px, py });
    });
  }

  // -------------------------------------------------
  // パネルタップ処理
  // -------------------------------------------------
  _onPanelTap(panel, img) {
    if (this.state !== 'PLAYER_TURN') return;
    if (this.usedPanelIds.has(panel.id)) return;

    // 有効な読みを確認
    const candidates = validReadings(panel, this.requiredStart);
    if (candidates.length === 0) {
      // 不正解
      this._wrongAnswer(img);
      return;
    }

    // 正解: 最初の有効な読みを採用 (戦略的には一番安全な読みを選ぶ)
    // ん終わりでない読みを優先
    const safeReadings = candidates.filter(r => getLastUnit(r) !== 'ん');
    const chosenReading = safeReadings.length > 0 ? safeReadings[0] : candidates[0];

    this._correctAnswer(panel, img, chosenReading, true);
  }

  // -------------------------------------------------
  // 正解処理
  // -------------------------------------------------
  _correctAnswer(panel, img, reading, isPlayer) {
    // パネルを使用済みに
    this.usedPanelIds.add(panel.id);
    img.setAlpha(0.3).setInteractive(false);
    img._baseScaleX = img._baseScaleX * 0.9;
    img._baseScaleY = img._baseScaleY * 0.9;
    img.setScale(img._baseScaleX, img._baseScaleY);

    // 正解エフェクト
    const color = isPlayer ? CONFIG.COLOR.PANEL_CORRECT : 0xe91e63;
    const fe = this.add.graphics().setDepth(20);
    fe.fillStyle(color, 0.6);
    fe.fillRoundedRect(img.x - 41, img.y - 43, 82, 86, 12);
    this.tweens.add({ targets: fe, alpha: 0, duration: 500, onComplete: () => fe.destroy() });

    const lastUnit = getLastUnit(reading);
    this.currentWord   = reading;
    this.requiredStart = lastUnit;

    if (isPlayer) {
      this.bossLife--;
      this.playerScore++;
      this.timeLeft = Math.min(this.timeLeft + CONFIG.BOSS_TIME_BONUS, this.timeLimit + CONFIG.BOSS_TIME_BONUS);
      this._updateScoreUI();

      // ボスライフ0 → プレイヤー勝利
      if (this.bossLife <= 0) {
        this._showBalloon('ぐ…やられた…！');
        this.time.delayedCall(1500, () => this._endBattle(true));
        this.state = 'RESULT';
        return;
      }

      // 「ん」終わり → ボスは応答不能 → プレイヤー勝利
      if (lastUnit === 'ん') {
        this._showBalloon('「ん」で終わった！\nボスに返す言葉がない！');
        this.time.delayedCall(1500, () => this._endBattle(true));
        this.state = 'RESULT';
        return;
      }

      // ボスの番へ
      this._showBalloon(`「${reading}」！`);
      this.requiredLabel.setText(`ボスが「${lastUnit}」から考え中…`);
      this.state = 'BOSS_TURN';
      this.time.delayedCall(1800, () => this._bossTurn());
    } else {
      // ボスの正解
      this._showBalloon(`「${reading}」だ！次は「${lastUnit}」から答えよ！`);
      this._updateRequiredUI();
      this.state = 'PLAYER_TURN';
    }
  }

  // -------------------------------------------------
  // 不正解処理
  // -------------------------------------------------
  _wrongAnswer(img) {
    this.timeLeft = Math.max(0, this.timeLeft - CONFIG.BOSS_TIME_PENALTY);
    this._updateTimerBar();

    // 赤フラッシュ
    const fe = this.add.graphics().setDepth(20);
    fe.fillStyle(CONFIG.COLOR.PANEL_WRONG, 0.7);
    fe.fillRoundedRect(img.x - 41, img.y - 43, 82, 86, 12);
    this.tweens.add({ targets: fe, alpha: 0, duration: 400, onComplete: () => fe.destroy() });

    this.cameras.main.shake(200, 0.015);
    this._showBalloon('それは違う！-5秒！');
  }

  // -------------------------------------------------
  // ボスAIターン
  // -------------------------------------------------
  _bossTurn() {
    if (this.state === 'RESULT') return;

    // ボスが選べるパネルを探す
    const available = this.displayPanels.filter(p => !this.usedPanelIds.has(p.id));
    const validPanels = available.filter(p => validReadings(p, this.requiredStart).length > 0);

    if (validPanels.length === 0) {
      // ボスに有効パネルなし → プレイヤーの勝利！
      this._showBalloon('な、なんだと…！\n返す言葉がない！\nやられた！');
      this.state = 'RESULT';
      this.time.delayedCall(1800, () => this._endBattle(true));
      return;
    }

    // ボスAI: 「ん」終わりのパネルを優先 (プレイヤーを詰める)
    const killerPanels = validPanels.filter(p =>
      validReadings(p, this.requiredStart).some(r => getLastUnit(r) === 'ん')
    );

    let chosenPanel, chosenReading;
    if (killerPanels.length > 0 && Math.random() < 0.4) {
      chosenPanel = killerPanels[Math.floor(Math.random() * killerPanels.length)];
      const kr = validReadings(chosenPanel, this.requiredStart).filter(r => getLastUnit(r) === 'ん');
      chosenReading = kr[0];
    } else {
      chosenPanel = validPanels[Math.floor(Math.random() * validPanels.length)];
      const vr = validReadings(chosenPanel, this.requiredStart);
      chosenReading = vr[0];
    }

    // ボスの選択したパネルをハイライト
    const panelObj = this.panelObjects.find(po => po.panel.id === chosenPanel.id);
    if (panelObj) {
      const hl = this.add.graphics().setDepth(20);
      hl.lineStyle(4, 0xe91e63, 1);
      hl.strokeRoundedRect(panelObj.img.x - 41, panelObj.img.y - 43, 82, 86, 12);
      this.time.delayedCall(600, () => hl.destroy());
    }

    const lastUnit = getLastUnit(chosenReading);

    // ん終わり → プレイヤーは返せない
    if (lastUnit === 'ん') {
      this.time.delayedCall(700, () => {
        if (panelObj) this._correctAnswer(chosenPanel, panelObj.img, chosenReading, false);
        this.state = 'RESULT';
        this.time.delayedCall(1200, () => {
          this._showBalloon(`「${chosenReading}」！「ん」で終わった！\nお前には返せまい！`);
          this.time.delayedCall(2000, () => this._endBattle(false));
        });
      });
      return;
    }

    this.time.delayedCall(700, () => {
      if (panelObj) this._correctAnswer(chosenPanel, panelObj.img, chosenReading, false);
    });
  }

  // -------------------------------------------------
  // タイマー
  // -------------------------------------------------
  _tickTimer() {
    if (this.state === 'RESULT') return;
    this.timeLeft -= 0.1;
    this._updateTimerBar();

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.state = 'RESULT';
      // タイムアップ → ボスのライフが残っていたら敗北
      if (this.bossLife <= 0) {
        this._showBalloon('時間切れだ！\nでもボスは倒した！');
        this.time.delayedCall(1500, () => this._endBattle(true));
      } else {
        // 正解候補を探してボスが教える
        const available = this.displayPanels.filter(p => !this.usedPanelIds.has(p.id));
        const validPanels = available.filter(p => validReadings(p, this.requiredStart).length > 0);
        if (validPanels.length > 0) {
          const answer = validPanels[0];
          const reading = validReadings(answer, this.requiredStart)[0];
          this._showBalloon(`これだぞ！\n「${reading}」`);
          // 該当パネルをハイライト
          const panelObj = this.panelObjects.find(po => po.panel.id === answer.id);
          if (panelObj) {
            const hl = this.add.graphics().setDepth(20);
            hl.lineStyle(4, 0xff0000, 1);
            hl.strokeRoundedRect(panelObj.img.x - 43, panelObj.img.y - 30, 86, 60, 8);
            this.tweens.add({
              targets: hl, alpha: 0.3, duration: 300,
              yoyo: true, repeat: 3
            });
          }
        } else {
          this._showBalloon(`時間切れだ！`);
        }
        this.time.delayedCall(3000, () => this._endBattle(false));
      }
    }
  }

  _updateTimerBar() {
    this.timerBar.clear();
    const ratio = Math.max(0, this.timeLeft / (this.timeLimit + CONFIG.BOSS_TIME_BONUS));
    const barColor = ratio > 0.5 ? CONFIG.COLOR.PANEL_TIMER_BAR : ratio > 0.25 ? 0xFF9800 : 0xF44336;
    this.timerBar.fillStyle(barColor, 1);
    this.timerBar.fillRoundedRect(10, 10, Math.floor((CONFIG.WIDTH - 20) * ratio), 14, 7);
    if (this.timerText) {
      this.timerText.setText(`${Math.ceil(this.timeLeft)}秒`);
    }
  }

  _bossLifeText() {
    return '❤️'.repeat(this.bossLife) + '🖤'.repeat(3 - this.bossLife);
  }

  _updateScoreUI() {
    this.scoreText.setText(this._bossLifeText());
  }

  _updateRequiredUI() {
    this.requiredCharText.setText(this.requiredStart || '？');
    this.chainWordText.setText(`前の言葉: 「${this.currentWord}」`);
    this.requiredLabel.setText(`「${this.requiredStart}」から始まるパネルを選んで！`);
  }

  // -------------------------------------------------
  // セリフフキダシ
  // -------------------------------------------------
  _showBalloon(text) {
    const W = CONFIG.WIDTH;
    const bx = 10, by = 40;
    const bw = W * 0.62, bh = 70;

    this.balloonGfx.clear();
    this.balloonGfx.fillStyle(0xffffff, 0.95);
    this.balloonGfx.fillRoundedRect(bx, by, bw, bh, 10);
    // 口 (右向き)
    this.balloonGfx.fillTriangle(bx + bw - 8, by + 20, bx + bw + 20, by + 30, bx + bw - 8, by + 40);

    this.balloonText.setText(text);
    this.balloonText.setPosition(bx + 10, by + 10);
    this.balloonText.setWordWrapWidth(bw - 20);
  }

  // -------------------------------------------------
  // 勝敗決定
  // -------------------------------------------------
  _endBattle(playerWins) {
    if (this.timerEvent) this.timerEvent.remove();
    this.state = 'RESULT';

    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

    // オーバーレイ
    const overlay = this.add.graphics().setDepth(100);
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, W, H);
    overlay.setAlpha(0);
    this.tweens.add({ targets: overlay, alpha: 1, duration: 400 });

    const resultText = playerWins ? '🎉 勝利！' : '💀 敗北…';
    const resultColor = playerWins ? '#FFD700' : '#F44336';
    let subText;
    if (playerWins) {
      subText = 'ボスを倒した！\n引き続き登れ！';
    } else if (this.stageCount >= 1000) {
      // 1000段以降は即ゲームオーバー
      subText = 'GAME OVER';
    } else {
      // バナナ1/3に減少、羽没収
      const lost = this.bananaScore - Math.floor(this.bananaScore / 3);
      this.bananaScore = Math.floor(this.bananaScore / 3);
      subText = `バナナ -${lost}本、そして翼を奪われた…\nでも諦めるな！\n引き続き登れ！`;
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

    if (playerWins) {
      // 残り秒数をバナナボーナスとして加算するアニメーション
      const bonus = Math.floor(this.timeLeft);
      this.time.delayedCall(1200, () => {
        this._showBonusAnimation(overlay, bonus, () => {
          this.cameras.main.fade(500, 0, 0, 0, false, (_cam, progress) => {
            if (progress === 1) {
              this.scene.start('GameScene', {
                stageCount: this.stageCount,
                bananaScore: this.bananaScore,
                wingCount: this.wingCount,
                scrollSpeed: Math.max(CONFIG.SCROLL_SPEED_BASE, this.scrollSpeed - 8)
              });
            }
          });
        });
      });
    } else if (this.stageCount >= 1000) {
      // 1000段以降は即ゲームオーバー
      this.time.delayedCall(2800, () => {
        this.cameras.main.fade(500, 0, 0, 0, false, (_cam, progress) => {
          if (progress === 1) {
            this.scene.start('GameOverScene', {
              stageCount: this.stageCount,
              bananaScore: this.bananaScore,
              totalScore: this.stageCount + this.bananaScore * 2
            });
          }
        });
      });
    } else {
      this.time.delayedCall(2800, () => {
        this.cameras.main.fade(500, 0, 0, 0, false, (_cam, progress) => {
          if (progress === 1) {
            this.scene.start('GameScene', {
              stageCount: this.stageCount,
              bananaScore: this.bananaScore,
              wingCount: 0,
              scrollSpeed: Math.max(CONFIG.SCROLL_SPEED_BASE, this.scrollSpeed - 8)
            });
          }
        });
      });
    }
  }

  // -------------------------------------------------
  // ボーナスアニメーション
  // -------------------------------------------------
  _showBonusAnimation(overlay, bonus, onComplete) {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

    const bonusLabel = this.add.text(W / 2, H / 2 + 60, '⏱️ タイムボーナス', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '18px',
      color: '#00E5FF', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(110);

    const bonusText = this.add.text(W / 2, H / 2 + 95, `🍌 +0`, {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '32px',
      color: '#FFD700', stroke: '#000', strokeThickness: 5
    }).setOrigin(0.5).setDepth(110);

    // カウントアップアニメーション
    let current = 0;
    const step = Math.max(1, Math.floor(bonus / 20)); // 20段階程度で刻む
    const interval = Math.max(30, Math.floor(800 / Math.max(1, bonus))); // 全体で約800ms

    const counter = this.time.addEvent({
      delay: interval,
      repeat: bonus > 0 ? Math.ceil(bonus / step) - 1 : 0,
      callback: () => {
        current = Math.min(current + step, bonus);
        bonusText.setText(`🍌 +${current}`);
        // 数字が増えるたびに軽くスケール演出
        this.tweens.add({
          targets: bonusText,
          scaleX: 1.15, scaleY: 1.15,
          duration: 60,
          yoyo: true
        });
      }
    });

    // カウントアップ完了後にバナナスコアに加算して遷移
    const totalTime = interval * Math.ceil(bonus / step) + 400;
    this.time.delayedCall(totalTime, () => {
      // 最終値を確定表示
      bonusText.setText(`🍌 +${bonus}`);
      this.bananaScore += bonus;

      // 加算完了の強調演出
      this.tweens.add({
        targets: bonusText,
        scaleX: 1.3, scaleY: 1.3,
        duration: 200,
        yoyo: true,
        onComplete: () => {
          this.time.delayedCall(800, onComplete);
        }
      });
    });
  }

  // -------------------------------------------------
  // update
  // -------------------------------------------------
  update() {
    // タイマーバーのリアルタイム更新は timerEvent で行うためここでは不要
  }
}
