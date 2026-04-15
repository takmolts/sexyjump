import Phaser from 'phaser';
import { CONFIG } from '../GameConfig.js';
import { fetchScores, sendScore } from '../ScoreAPI.js';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data) {
    this.stageCount  = data.stageCount  || 0;
    this.bananaScore = data.bananaScore || 0;
    this.totalScore  = data.totalScore  || (data.stageCount + data.bananaScore * 2) || 0;
  }

  create() {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

    // ---- 背景 ----
    const bgGfx = this.add.graphics();
    bgGfx.fillGradientStyle(0x0d0520, 0x0d0520, 0x1a0a3a, 0x1a0a3a, 1);
    bgGfx.fillRect(0, 0, W, H);

    // 星
    for (let i = 0; i < 60; i++) {
      const sg = this.add.graphics();
      sg.fillStyle(0xffffff, Math.random() * 0.5 + 0.1);
      sg.fillCircle(Math.random() * W, Math.random() * H, Math.random() * 1.5 + 0.5);
    }

    // ---- GAME OVER テキスト ----
    this.add.text(W / 2, 50, 'GAME OVER', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black',
      fontSize: '46px',
      color: '#F44336',
      stroke: '#000000',
      strokeThickness: 7,
      shadow: { offsetX: 3, offsetY: 3, color: '#000', blur: 8, fill: true }
    }).setOrigin(0.5);

    // ---- スコア表示 ----
    const scoreBg = this.add.graphics();
    scoreBg.fillStyle(0x000000, 0.45);
    scoreBg.fillRoundedRect(20, 110, W - 40, 190, 16);

    this.add.text(W / 2, 135, '最終スコア', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '15px', color: '#aaaaaa'
    }).setOrigin(0.5);

    this.add.text(W / 2, 175, `${this.totalScore}`, {
      fontFamily: '"M PLUS Rounded 1c", Arial Black',
      fontSize: '64px',
      color: '#FFD700',
      stroke: '#000', strokeThickness: 5,
      shadow: { offsetX: 3, offsetY: 3, color: '#8B4513', blur: 6, fill: true }
    }).setOrigin(0.5);

    this.add.text(W / 2, 250, `🏔️ ${this.stageCount} 段  ＋  🍌 ${this.bananaScore} 本 ×2`, {
      fontFamily: 'Arial', fontSize: '16px', color: '#ffffff', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);

    // ---- 名前入力エリア ----
    const nameBg = this.add.graphics();
    nameBg.fillStyle(0x000000, 0.4);
    nameBg.fillRoundedRect(20, 320, W - 40, 120, 14);

    this.add.text(W / 2, 338, 'ランキング登録', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '13px', color: '#FFD700'
    }).setOrigin(0.5);

    // プレイヤー名入力 (HTML input を使う)
    this._playerName = '';
    this._createNameInput(W / 2, 372);

    // 登録ボタン
    this.submitBtn = this._createButton(W / 2, 418, '  スコアを登録する  ', '#1B5E20', '#C8E6C9', () => {
      this._submitScore();
    });

    // ---- ランキング表示エリア ----
    this.rankingArea = this.add.container(0, 420);
    this._loadingText = this.add.text(W / 2, 440, 'ランキング読み込み中...', {
      fontFamily: 'Arial', fontSize: '13px', color: '#aaaaaa'
    }).setOrigin(0.5);

    // ---- ボタン ----
    this._createButton(W / 2 - 90, H - 60, ' もう一度 ', '#1a237e', '#bbdefb', () => {
      this.cameras.main.fade(300, 0, 0, 0, false, (_cam, p) => {
        if (p === 1) this.scene.start('GameScene', { stageCount: 0, bananaScore: 0, scrollSpeed: CONFIG.SCROLL_SPEED_BASE });
      });
    });

    this._createButton(W / 2 + 90, H - 60, ' タイトル ', '#4a235a', '#e1bee7', () => {
      this.cameras.main.fade(300, 0, 0, 0, false, (_cam, p) => {
        if (p === 1) this.scene.start('TitleScene');
      });
    });

    // ランキング読み込み
    this._fetchRanking();

    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  // -------------------------------------------------
  // 名前入力 (DOM input)
  // -------------------------------------------------
  _createNameInput(x, y) {
    // Phaser の DOMElement を使って input を配置
    this.nameInput = this.add.dom(x, y).createFromHTML(
      `<input type="text" id="playerNameInput" value=""
        maxlength="10" placeholder="名前を入力"
        style="
          background: rgba(255,255,255,0.12);
          border: 2px solid rgba(255,255,255,0.35);
          border-radius: 8px;
          color: #ffffff;
          font-size: 18px;
          font-family: 'M PLUS Rounded 1c', Arial;
          padding: 6px 12px;
          width: 200px;
          text-align: center;
          outline: none;
        "
      />`
    );
    this.nameInput.addListener('change');
    this.nameInput.on('change', (evt) => {
      this._playerName = evt.target.value.trim();
    });
  }

  // -------------------------------------------------
  // スコア送信
  // -------------------------------------------------
  async _submitScore() {
    const name = (this.nameInput.node.querySelector('#playerNameInput').value || this._playerName).trim();

    if (!name) {
      // 名前が空の場合エラー表示
      if (this._nameError) this._nameError.destroy();
      this._nameError = this.add.text(CONFIG.WIDTH / 2, 448, '名前を入力してください', {
        fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '13px', color: '#F44336',
        stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5);
      // 入力欄の枠を赤くする
      const input = this.nameInput.node.querySelector('#playerNameInput');
      input.style.borderColor = '#F44336';
      this.time.delayedCall(2000, () => {
        if (this._nameError) { this._nameError.destroy(); this._nameError = null; }
        input.style.borderColor = 'rgba(255,255,255,0.35)';
      });
      return;
    }

    this._playerName = name;

    this.submitBtn.setAlpha(0.5).disableInteractive();
    const sending = this.add.text(CONFIG.WIDTH / 2, 420, '送信中...', {
      fontFamily: 'Arial', fontSize: '13px', color: '#aaaaaa'
    }).setOrigin(0.5);

    const ok = await sendScore(name, this.totalScore);

    sending.destroy();
    if (ok) {
      this.add.text(CONFIG.WIDTH / 2, 420, '✅ 送信完了！', {
        fontFamily: 'Arial', fontSize: '13px', color: '#4CAF50', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5);
      // ランキングを再取得
      setTimeout(() => this._fetchRanking(), 1500);
    } else {
      this.add.text(CONFIG.WIDTH / 2, 420, '⚠️ 送信エラー', {
        fontFamily: 'Arial', fontSize: '13px', color: '#F44336', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5);
    }
  }

  // -------------------------------------------------
  // ランキング取得・表示
  // -------------------------------------------------
  async _fetchRanking() {
    if (this._loadingText) this._loadingText.setText('ランキング読み込み中...');

    const scores = await fetchScores(10);

    if (this._loadingText) this._loadingText.destroy();
    this.rankingArea.removeAll(true);

    const W = CONFIG.WIDTH;
    const startY = 430;

    // ヘッダー
    const hdr = this.add.text(W / 2, startY, '🏆 ランキング TOP10', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '14px',
      color: '#FFD700', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);
    this.rankingArea.add(hdr);

    if (scores.length === 0) {
      const msg = this.add.text(W / 2, startY + 25, 'データなし', {
        fontFamily: 'Arial', fontSize: '13px', color: '#888888'
      }).setOrigin(0.5);
      this.rankingArea.add(msg);
      return;
    }

    scores.forEach((entry, idx) => {
      const rank = idx + 1;
      const isMe = entry.name === this._playerName && entry.score === this.totalScore;
      const color = rank === 1 ? '#FFD700' : rank === 2 ? '#E0E0E0' : rank === 3 ? '#FF8C00' : (isMe ? '#00E5FF' : '#ffffff');
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

      const rowY = startY + 22 + idx * 22;
      const row = this.add.text(W / 2, rowY, `${medal} ${entry.name}  ${entry.score}pt`, {
        fontFamily: 'Arial', fontSize: '14px',
        color: color,
        stroke: '#000', strokeThickness: isMe ? 3 : 1
      }).setOrigin(0.5);
      this.rankingArea.add(row);
    });
  }

  // -------------------------------------------------
  // ボタン生成ヘルパー
  // -------------------------------------------------
  _createButton(x, y, label, bgColor, fgColor, onClick) {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    const textObj = this.add.text(0, 0, label, {
      fontFamily: '"M PLUS Rounded 1c", Arial Black',
      fontSize: '16px', fontStyle: 'bold',
      color: fgColor, stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);

    const pad = 14;
    const bw = textObj.width + pad * 2;
    const bh = 42;

    bg.fillStyle(parseInt(bgColor.replace('#', ''), 16), 1);
    bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
    bg.lineStyle(2, 0xffffff, 0.25);
    bg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);

    container.add([bg, textObj]);
    container.setSize(bw, bh);
    container.setInteractive();
    container.on('pointerdown', () => {
      this.tweens.add({ targets: container, scaleX: 0.93, scaleY: 0.93, duration: 80, yoyo: true });
      onClick();
    });

    return container;
  }
}
