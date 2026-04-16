import Phaser from 'phaser';
import { CONFIG } from '../GameConfig.js';

// しりとりのユーティリティ関数 (BootSceneでは不要だがimport関係の整理のためここに記載しない)

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // --- ロード画面UI ---
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

    // 背景
    const bg = this.add.graphics();
    bg.fillGradientStyle(CONFIG.COLOR.SKY_TOP, CONFIG.COLOR.SKY_TOP, CONFIG.COLOR.SKY_BOT, CONFIG.COLOR.SKY_BOT, 1);
    bg.fillRect(0, 0, W, H);

    // ロード中テキスト
    const loadText = this.add.text(W / 2, H / 2 - 20, 'Loading...', {
      fontFamily: '"M PLUS Rounded 1c", Arial',
      fontSize: '28px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // プログレスバー
    const barBg = this.add.graphics();
    barBg.fillStyle(0x333333, 1);
    barBg.fillRoundedRect(W / 2 - 150, H / 2 + 20, 300, 24, 12);

    const bar = this.add.graphics();

    this.load.on('progress', (value) => {
      bar.clear();
      bar.fillStyle(0x00e5ff, 1);
      bar.fillRoundedRect(W / 2 - 150, H / 2 + 20, 300 * value, 24, 12);
    });

    // --- 画像アセット ---
    this.load.spritesheet('player', 'assets/images/koji-run.png', {
      frameWidth: 256,
      frameHeight: 256
    });
    this.load.image('platform', 'assets/images/platform.png');
    this.load.image('back', 'assets/images/back.png');
    this.load.image('boss_01', 'assets/images/boss_01.png');
    this.load.image('boss_02', 'assets/images/boss_02.png');
    this.load.image('boss_03', 'assets/images/boss_03.png');
    this.load.image('boss_04', 'assets/images/boss_04.png');
    this.load.image('boss_05', 'assets/images/boss_05.png');
    this.load.image('boss_06', 'assets/images/boss_06.png');
    this.load.image('jan_gu', 'assets/images/jan_gu.png');
    this.load.image('jan_tyoki', 'assets/images/jan_tyoki.png');
    this.load.image('jan_pa', 'assets/images/jan_pa.png');
    this.load.image('enemy_01', 'assets/images/enemy_01.png');
    this.load.image('friend_01', 'assets/images/friend_01.png');
    this.load.image('friend_02', 'assets/images/friend_02.png');
    this.load.image('wing', 'assets/images/wing.png');
    this.load.image('stop', 'assets/images/stop.png');
    this.load.image('banner', 'assets/images/banner.png');

    // --- 音声 ---
    this.load.audio('bgm_game', 'assets/audio/bgm.mp3');
    this.load.audio('bgm_boss', 'assets/audio/boss.mp3');
    this.load.audio('miss', 'assets/audio/miss.ogg');

    // バナナはスプライトシート的に1枚画像を使用 (手続き型で分割)
    this.load.image('bananas_sheet', 'assets/images/bananas_sheet.png');

    // --- しりとりパネルJSON ---
    this.load.json('panels', 'data/shiritori_panels.json');
  }

  create() {
    // パネル画像を追加ロード (JSONから画像パスを取得)
    const panelsData = this.cache.json.get('panels');
    panelsData.forEach((panel) => {
      this.load.image(`panel_img_${panel.id}`, `assets/images/${panel.image}`);
    });

    this.load.once('complete', () => {
      // パネルテクスチャを画像ベースで生成
      this.createPanelTextures(panelsData);

      // 背景テクスチャを生成
      this.createBackgroundTexture();

      // 足場テクスチャを生成 (画像をベースにフォールバック対応)
      this.createPlatformTexture();
      this.createGhostPlatformTexture();

      // プレイヤー走りアニメーション定義
      this.anims.create({
        key: 'player_run',
        frames: this.anims.generateFrameNumbers('player', { start: 0, end: 24 }),
        frameRate: 20,
        repeat: -1
      });

      // 緑背景を透過処理
      this.chromaKey('enemy_01');
      this.chromaKey('friend_01');
      this.chromaKey('friend_02');
    this.chromaKey('banner');
      this.chromaKeyWhite('platform');

      // バナナテクスチャを分割生成
      this.createBananaTextures();

      this.scene.start('TitleScene');
    });

    this.load.start();
  }

  /** 空のグラデーション背景テクスチャを生成 */
  createBackgroundTexture() {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.0, '#050d1a');
    grad.addColorStop(0.4, '#0a2050');
    grad.addColorStop(0.7, '#0d3a24');
    grad.addColorStop(1.0, '#1a4a15');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 星を追加
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 80; i++) {
      const sx = Math.random() * W;
      const sy = Math.random() * H * 0.65;
      const sr = Math.random() * 1.5 + 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    this.textures.addCanvas('background', canvas);
  }

  /** 足場テクスチャを生成 */
  createPlatformTexture() {
    // すでに platform 画像が読み込まれている場合はそちらを優先
    // platformという名前でキャンバステクスチャを上書きせず、別名で作成
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // 土台 (茶色)
    ctx.fillStyle = '#6D4C41';
    ctx.beginPath();
    this.roundRect(ctx, 0, 8, 200, 24, 8);
    ctx.fill();

    // 草 (緑)
    ctx.fillStyle = '#43A047';
    this.roundRect(ctx, 0, 0, 200, 14, 7);
    ctx.fill();

    // ハイライト
    ctx.fillStyle = '#66BB6A';
    ctx.fillRect(10, 2, 180, 4);

    this.textures.addCanvas('platform_canvas', canvas);
  }

  /** 罠床テクスチャを生成 (暗めの色味) */
  createGhostPlatformTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // 土台 (暗い茶色)
    ctx.fillStyle = '#3a2820';
    ctx.beginPath();
    this.roundRect(ctx, 0, 8, 200, 24, 8);
    ctx.fill();

    // 草 (暗い緑)
    ctx.fillStyle = '#2a5a2a';
    this.roundRect(ctx, 0, 0, 200, 14, 7);
    ctx.fill();

    this.textures.addCanvas('platform_ghost', canvas);
  }

  /** バナナ3種類のテクスチャを生成 */
  createBananaTextures() {
    const sizes = { 1: [40, 60], 3: [70, 60], 5: [100, 60] };

    CONFIG.BANANA_TYPES.forEach(type => {
      const [w, h] = sizes[type];
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      for (let i = 0; i < type; i++) {
        const offsetX = type === 1 ? 10 : (i * (w / type) - 5);
        ctx.save();
        ctx.translate(offsetX + 15, 10);
        ctx.rotate(-0.4 + i * 0.15);
        // バナナ本体
        ctx.fillStyle = '#FFD600';
        ctx.beginPath();
        ctx.ellipse(0, 20, 8, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        // ハイライト
        ctx.fillStyle = '#FFF176';
        ctx.beginPath();
        ctx.ellipse(-2, 15, 3, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      this.textures.addCanvas(`banana_${type}`, canvas);
    });
  }

  /** パネルテクスチャを画像ベースで生成 */
  createPanelTextures(panelsData) {
    panelsData.forEach((panel) => {
      // ロード済みの画像をそのままパネルテクスチャとして登録
      const imgKey = `panel_img_${panel.id}`;
      const source = this.textures.get(imgKey).getSourceImage();
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(source, 0, 0);
      this.textures.addCanvas(`panel_${panel.id}`, canvas);
    });
  }

  /** CSS の border-radius に相当する角丸パス */
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** 指定テクスチャの緑背景を透過に置き換える */
  chromaKey(textureKey) {
    const source = this.textures.get(textureKey).getSourceImage();
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // 緑が強く、赤と青が弱いピクセルを透明にする
      if (g > 100 && g > r * 1.4 && g > b * 1.4) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    this.textures.remove(textureKey);
    this.textures.addCanvas(textureKey, canvas);
  }

  /** 指定テクスチャの白背景を透過に置き換える */
  chromaKeyWhite(textureKey) {
    const source = this.textures.get(textureKey).getSourceImage();
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 230 && g > 230 && b > 230) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    this.textures.remove(textureKey);
    this.textures.addCanvas(textureKey, canvas);
  }
}
