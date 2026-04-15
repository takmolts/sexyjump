import Phaser from 'phaser';
import { CONFIG } from '../GameConfig.js';

/**
 * GameScene - メインゲームループ
 *
 * 座標系:
 *   Phaser の Y は下方向が正。
 *   プレイヤーは画面下部からスタートし、カメラが自動的に上スクロール (scrollY が減少) する。
 *   足場は Y 座標が小さいほど「高い」位置にある。
 */
export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  // -------------------------------------------------
  // init: シーン引数受け取り
  // -------------------------------------------------
  init(data) {
    this.resumeStageCount  = data.stageCount  || 0;
    this.resumeBananaScore = data.bananaScore || 0;
    this.resumeScrollSpeed = data.scrollSpeed || CONFIG.SCROLL_SPEED_BASE;
    this.isDebug = data.debug || false;

    this.stageCount   = this.resumeStageCount;
    this.bananaScore  = this.resumeBananaScore;
    this.scrollSpeed  = this.resumeScrollSpeed;

    // ボス戦の次のトリガー段数
    this.nextBossAt = Math.ceil((this.resumeStageCount + 1) / CONFIG.BOSS_EVERY) * CONFIG.BOSS_EVERY;

    // プレイヤー状態
    this.playerDir     = 1;      // 1 = 右方向, -1 = 左方向
    this.coyoteFrames  = 0;
    this.isDead        = false;
    this.bossTriggered = false;

    this.currentPlatform = null;  // 現在乗っている足場
    this.lastSoloX = -1;          // 前回の単独足場のX座標
    this.soloStreak = 0;          // 単独足場の連続数
    this.wingCount = data.wingCount || 0; // 羽ストック数
    // 足場生成カーソル (最上部に生成された足場の Y 座標、初期値は後でセット)
    this.topPlatformY = CONFIG.FIRST_PLATFORM_Y;
    // 最高到達足場の Y 座標 (Y 値が小さいほど高い → 最大値でなく最小値を追跡)
    this.highestStepY = CONFIG.FIRST_PLATFORM_Y;
  }

  // -------------------------------------------------
  // create: シーン初期化
  // -------------------------------------------------
  create() {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

    // 物理ワールド: X のみ境界設定 (左右の壁), Y は無制限
    this.physics.world.setBounds(-W, -9_000_000, W * 3, 9_100_000);

    // ---- 背景 (段数に応じてスクロール) ----
    // 画像を画面幅に合わせ、アスペクト比を維持して縦長に表示
    const backTex = this.textures.get('back').getSourceImage();
    const bgScale = W / backTex.width;
    const bgH = backTex.height * bgScale;
    this.bgImage = this.add.image(W / 2, H / 2, 'back')
      .setDisplaySize(W, bgH)
      .setScrollFactor(0);
    // 背景スクロール用: 画面高さとの差分が最大スクロール量
    this._bgScrollRange = bgH - H;
    this._bgBaseY = H / 2; // 一番下を表示している状態のY

    // 雲エフェクト (視差スクロール)
    this.createClouds();

    // ---- 足場グループ (静的) ----
    this.platforms = this.physics.add.staticGroup();

    // ---- バナナグループ ----
    this.bananas = this.physics.add.staticGroup();

    // ---- フレンドグループ ----
    this.friends = this.physics.add.staticGroup();

    // ---- 最初の足場を生成 ----
    this.addPlatform(W / 2, CONFIG.FIRST_PLATFORM_Y, 180);  // スタート足場 (広め)
    for (let i = 0; i < 22; i++) {
      this.generateNextPlatform();
    }

    // ---- プレイヤー ----
    const startY = CONFIG.FIRST_PLATFORM_Y - CONFIG.PLATFORM_H / 2 - CONFIG.PLAYER_HIT_H / 2 - 2;
    this.player = this.physics.add.sprite(W / 2, startY, 'player');
    this.player.setDisplaySize(CONFIG.PLAYER_RADIUS * 2, CONFIG.PLAYER_RADIUS * 2);
    this.player.setSize(CONFIG.PLAYER_HIT_W, CONFIG.PLAYER_HIT_H);
    this.player.setGravityY(CONFIG.GRAVITY);
    this.player.setCollideWorldBounds(false);
    this.player.setDepth(10);
    this.player.setMaxVelocity(CONFIG.PLAYER_SPEED * 1.5, CONFIG.MAX_FALL_SPEED);
    this.player.play('player_run');

    // ---- 衝突判定 ----
    this.collider = this.physics.add.collider(
      this.player, this.platforms, this._onLand, this._preCollide, this
    );
    this.physics.add.overlap(
      this.player, this.bananas, this._collectBanana, null, this
    );

    // ---- フレンド衝突 ----
    this.physics.add.overlap(
      this.player, this.friends, this._touchFriend, null, this
    );

    // ---- 敵グループ ----
    this.enemies = this.add.group();
    this.physics.add.overlap(
      this.player, this.enemies, this._hitEnemy, null, this
    );

    // 敵の定期スポーン
    this.time.addEvent({
      delay: CONFIG.ENEMY_SPAWN_INTERVAL,
      loop: true,
      callback: this._spawnEnemy,
      callbackScope: this
    });

    // ---- カメラ設定 ----
    // カメラの初期スクロール位置: プレイヤーが画面下部から 20% の位置に見えるようにする
    const camInitY = startY - H * 0.80;
    this.cameras.main.setScroll(0, camInitY);
    this.cameras.main.setBounds(-Infinity, -9_000_000, W + Infinity, 9_200_000);

    // ---- 入力 ----
    this.input.on('pointerdown', this._handleTap, this);

    // ---- UI ----
    this._createUI();

    // ---- ジャンプ方向インジケーター ----
    this.dirArrow = this.add.graphics().setDepth(15).setScrollFactor(0);

    // ---- デバッグ ----
    if (this.isDebug) {
      this._createDebugUI();
    }

    // BGM再生
    if (!this.sound.get('bgm_game') || !this.sound.get('bgm_game').isPlaying) {
      this.bgm = this.sound.add('bgm_game', { loop: true, volume: 0.5 });
      this.bgm.play();
    } else {
      this.bgm = this.sound.get('bgm_game');
    }

    // フェードイン
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  // -------------------------------------------------
  // 足場生成
  // -------------------------------------------------
  addPlatform(x, y, width, ghost = false) {
    const texture = ghost ? 'platform_ghost' : 'platform';
    const p = this.platforms.create(x, y, texture);
    p.setDisplaySize(width, CONFIG.PLATFORM_H);
    p.refreshBody();
    p.platformId = this._platformCounter = (this._platformCounter || 0) + 1;
    p.isGhost = ghost;
    return p;
  }

  generateNextPlatform() {
    const gap = Phaser.Math.Between(CONFIG.PLATFORM_MIN_GAP, CONFIG.PLATFORM_MAX_GAP);
    this.topPlatformY -= gap;
    const W = CONFIG.WIDTH;
    const y = this.topPlatformY;

    if (Math.random() < CONFIG.PLATFORM_MULTI_CHANCE) {
      // --- 複数足場 (2〜3本) ---
      this.soloStreak = 0;
      const count = Math.random() < 0.5 ? 2 : 3;
      const pw = count === 2 ? 120 : CONFIG.PLATFORM_MULTI_W;
      const margin = 20;
      const slotW = (W - margin * 2) / count;

      // 罠床判定: 100段以降、段数に応じて確率上昇 (100段ごとに+10%)
      const ghostChance = this.stageCount < 100 ? 0
        : Math.min(0.5, Math.floor(this.stageCount / 100) * 0.1);
      const ghostSlot = Math.random() < ghostChance
        ? Phaser.Math.Between(0, count - 1) : -1;

      // バナナを1つの足場にだけ置く (罠床にも置く = バナナで釣る罠)
      const bananaSlot = Math.random() < 0.7 ? Phaser.Math.Between(0, count - 1) : -1;

      for (let i = 0; i < count; i++) {
        const cx = margin + slotW * i + slotW / 2;
        const x = cx + Phaser.Math.Between(-10, 10);
        const isGhost = i === ghostSlot;
        this.addPlatform(Phaser.Math.Clamp(x, pw / 2 + 4, W - pw / 2 - 4), y, pw, isGhost);

        if (i === bananaSlot) {
          const type = CONFIG.BANANA_TYPES[Math.floor(Math.random() * CONFIG.BANANA_TYPES.length)];
          this._addBanana(x, y - CONFIG.PLATFORM_H / 2 - 22, type);
        }
      }
    } else {
      // --- 単独足場 (最大幅) ---
      let x = Phaser.Math.Between(CONFIG.PLATFORM_MIN_X, CONFIG.PLATFORM_MAX_X);
      // 前回の単独足場と近すぎる場合はずらす
      const minShift = 80;
      if (this.lastSoloX >= 0 && Math.abs(x - this.lastSoloX) < minShift) {
        // 反対側にずらす
        if (this.lastSoloX > W / 2) {
          x = Phaser.Math.Between(CONFIG.PLATFORM_MIN_X, this.lastSoloX - minShift);
        } else {
          x = Phaser.Math.Between(this.lastSoloX + minShift, CONFIG.PLATFORM_MAX_X);
        }
      }
      this.lastSoloX = x;
      this.soloStreak++;
      const p = this.addPlatform(x, y, CONFIG.PLATFORM_MAX_W);

      // 単独足場が2個以上続く場合、2個目以降は左右に揺れる
      if (this.soloStreak >= 2) {
        const swingRange = 40;
        const origX = x;
        p._swingTween = this.tweens.add({
          targets: p,
          x: origX - swingRange,
          duration: 1200,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
          onUpdate: () => {
            if (!p.body) return;
            p.body.x = p.x - p.body.width / 2;
          }
        });
      }

      if (Math.random() < CONFIG.FRIEND_CHANCE) {
        // フレンド1: バナナ3倍
        this._addFriend(x, y - CONFIG.PLATFORM_H / 2 - CONFIG.FRIEND_SIZE / 2 - 4, 'friend_01');
      } else if (Math.random() < CONFIG.FRIEND2_CHANCE) {
        // フレンド2: 羽
        this._addFriend(x, y - CONFIG.PLATFORM_H / 2 - CONFIG.FRIEND_SIZE / 2 - 4, 'friend_02');
      } else if (Math.random() < CONFIG.BANANA_CHANCE) {
        const type = CONFIG.BANANA_TYPES[Math.floor(Math.random() * CONFIG.BANANA_TYPES.length)];
        this._addBanana(x, y - CONFIG.PLATFORM_H / 2 - 22, type);
      }
    }
  }

  _addFriend(x, y, textureKey = 'friend_01') {
    const size = CONFIG.FRIEND_SIZE;
    const f = this.friends.create(x, y, textureKey);
    f.friendType = textureKey;
    f.setDisplaySize(size, size);
    f.refreshBody();

    // ふわふわアニメ
    this.tweens.add({
      targets: f,
      y: y - 8,
      duration: 800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });
    return f;
  }

  _addBanana(x, y, type) {
    const b = this.bananas.create(x, y, `banana_${type}`);
    b.setDisplaySize(type === 1 ? 28 : type === 3 ? 38 : 48, 36);
    b.refreshBody();
    b.bananaValue = type;

    // ふわふわアニメ
    this.tweens.add({
      targets: b,
      y: y - 6,
      duration: 700 + Math.random() * 400,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });
    return b;
  }

  // -------------------------------------------------
  // 衝突コールバック
  // -------------------------------------------------
  _preCollide(player, platform) {
    // 罠床: 使用済みならすり抜ける、未使用なら乗れる
    if (platform.isGhost && platform._ghostUsed) return false;
    // プレイヤーの足元が足場の上面付近にあるときだけ衝突 (横からの引っかかり防止)
    const playerBottom = player.body.y + player.body.height;
    const platTop = platform.body.y;
    const platBottom = platTop + platform.body.height;
    return player.body.velocity.y >= 0 && playerBottom <= platBottom;
  }

  _onLand(player, platform) {
    this.coyoteFrames = CONFIG.COYOTE_FRAMES;
    this.currentPlatform = platform;

    // 段数カウント: 初めて踏む高さより高い (Y が小さい) 足場に乗ったとき加算
    if (platform.y < this.highestStepY - 4) {
      const gain = Math.round((this.highestStepY - platform.y) / CONFIG.PLATFORM_AVG_GAP);
      this.stageCount += Math.max(1, gain);
      this.highestStepY = platform.y;
      this._updateStageUI();

      // ボス戦トリガー
      if (!this.bossTriggered && this.stageCount >= this.nextBossAt) {
        this.bossTriggered = true;
        this._triggerBoss();
      }
    }

    // 300段以降: 一度乗った足場は4秒後に消滅
    if (this.stageCount >= 300 && !platform.isGhost && !platform._crumbling) {
      platform._crumbling = true;
      // 2秒後から点滅開始 (残り2秒で5回点滅して消滅)
      this.time.delayedCall(2000, () => {
        if (!platform.active) return;
        this.tweens.add({
          targets: platform,
          alpha: 0.2,
          duration: 200,
          yoyo: true,
          repeat: 4,
          onComplete: () => {
            // 現在乗っている足場なら参照をクリア
            if (this.currentPlatform === platform) {
              this.currentPlatform = null;
            }
            if (platform._swingTween) {
              platform._swingTween.stop();
              platform._swingTween = null;
            }
            this.tweens.killTweensOf(platform);
            this.platforms.remove(platform, true, true);
          }
        });
      });
    }
  }

  _collectBanana(player, banana) {
    const val = banana.bananaValue;
    this.bananaScore += val;
    this._updateBananaUI();

    // エフェクト
    const floatY = banana.y;
    const floatX = banana.x;
    // UIに重ねて表示するためスクロール座標からUI座標に変換
    const screenX = floatX - this.cameras.main.scrollX;
    const screenY = floatY - this.cameras.main.scrollY;
    const ft = this.add.text(screenX, screenY, `+${val}🍌`, {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#FFD700',
      stroke: '#000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(100);

    this.tweens.add({
      targets: ft,
      y: screenY - 55,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => ft.destroy()
    });

    banana.destroy();
    this.bananas.refresh();
  }

  // -------------------------------------------------
  // 入力ハンドラ
  // -------------------------------------------------
  _handleTap() {
    if (this.isDead || this.bossTriggered || this._paused || this._resumeGuard) return;
    const canJump = this.player.body.blocked.down || this.coyoteFrames > 0;
    if (canJump) {
      this._doJump();
    }
  }

  _doJump() {
    this.coyoteFrames = 0;

    // 罠床から飛び立ったら使用済みにする（二度と乗れない）
    if (this.currentPlatform && this.currentPlatform.isGhost) {
      this.currentPlatform._ghostUsed = true;
      this.currentPlatform.setAlpha(0.3);
    }

    // ジャンプ速度: 現在の自動移動方向に合わせて横方向をつける
    const vx = CONFIG.PLAYER_SPEED * this.playerDir;
    const vy = CONFIG.JUMP_VY;
    this.player.setVelocity(vx, vy);

    // スクイッシュアニメ
    this.tweens.add({
      targets: this.player,
      scaleY: 0.7,
      scaleX: 1.3,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut'
    });

    // ジャンプエフェクト (白い円)
    const fx = this.add.graphics();
    fx.fillStyle(0xffffff, 0.6);
    fx.fillCircle(this.player.x, this.player.y + CONFIG.PLAYER_RADIUS, 18);
    this.tweens.add({
      targets: fx,
      alpha: 0,
      scaleX: 1.8,
      scaleY: 0.3,
      duration: 250,
      onComplete: () => fx.destroy()
    });
  }

  // -------------------------------------------------
  // UI
  // -------------------------------------------------
  _createUI() {
    const W = CONFIG.WIDTH;

    // 上部HUD背景
    const hudBg = this.add.graphics().setScrollFactor(0).setDepth(50);
    hudBg.fillStyle(0x000000, 0.45);
    hudBg.fillRect(0, 0, W, 50);

    // 羽アイコン (左上に2つ並べて表示)
    this.uiWingIcons = [];
    for (let i = 0; i < 2; i++) {
      const icon = this.add.image(18 + i * 26, 62, 'wing')
        .setDisplaySize(22, 22)
        .setScrollFactor(0).setDepth(51)
        .setAlpha(i < this.wingCount ? 1 : 0.2);
      this.uiWingIcons.push(icon);
    }

    // 段数
    this.uiStageLabel = this.add.text(10, 10, '🏔️ 段数', {
      fontFamily: 'Arial', fontSize: '11px', color: '#aaaaaa'
    }).setScrollFactor(0).setDepth(51);

    this.uiStageText = this.add.text(10, 24, `${this.stageCount} 段`, {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '18px',
      color: '#FFD700', stroke: '#000', strokeThickness: 3, fontStyle: 'bold'
    }).setScrollFactor(0).setDepth(51);

    // バナナ
    this.uiBananaLabel = this.add.text(W / 2, 10, '🍌 バナナ', {
      fontFamily: 'Arial', fontSize: '11px', color: '#aaaaaa'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(51);

    this.uiBananaText = this.add.text(W / 2, 24, `${this.bananaScore} 本`, {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '18px',
      color: '#ffffff', stroke: '#000', strokeThickness: 3, fontStyle: 'bold'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(51);

    // 次ボスまで
    this.uiBossLabel = this.add.text(W - 10, 10, '次ボス', {
      fontFamily: 'Arial', fontSize: '11px', color: '#ff9800'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(51);

    this.uiBossText = this.add.text(W - 10, 24, `あと ${this.nextBossAt - this.stageCount}段`, {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '14px',
      color: '#ff9800', stroke: '#000', strokeThickness: 2
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(51);

    // 一時停止ボタン
    const pauseBtn = this.add.image(W - 22, 66, 'stop')
      .setDisplaySize(36, 36)
      .setScrollFactor(0).setDepth(52).setInteractive();
    pauseBtn.on('pointerdown', (pointer) => {
      pointer.event.stopPropagation();
      this._togglePause();
    });

    // ミュートボタン (一時停止の左)
    this._muted = this.sound.mute;
    this.muteBtn = this.add.text(W - 77, 56, this._muted ? '🔇' : '🔊', {
      fontSize: '32px'
    }).setScrollFactor(0).setDepth(52).setInteractive();
    this.muteBtn.on('pointerdown', (pointer) => {
      pointer.event.stopPropagation();
      this._muted = !this._muted;
      this.sound.mute = this._muted;
      this.muteBtn.setText(this._muted ? '🔇' : '🔊');
    });

    // 下部: タップ操作ガイド (最初の数秒のみ)
    this.tapGuide = this.add.text(W / 2, CONFIG.HEIGHT - 30, 'タップでジャンプ！', {
      fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '16px',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3, alpha: 0
    }).setScrollFactor(0).setDepth(51).setOrigin(0.5);

    this.tweens.add({
      targets: this.tapGuide,
      alpha: 1,
      duration: 400,
      onComplete: () => {
        this.time.delayedCall(3000, () => {
          this.tweens.add({ targets: this.tapGuide, alpha: 0, duration: 800 });
        });
      }
    });
  }

  _updateStageUI() {
    this.uiStageText.setText(`${this.stageCount} 段`);
    this.uiBossText.setText(`あと ${Math.max(0, this.nextBossAt - this.stageCount)}段`);
  }

  _updateBananaUI() {
    this.uiBananaText.setText(`${this.bananaScore} 本`);
  }

  _updateWingUI() {
    for (let i = 0; i < this.uiWingIcons.length; i++) {
      this.uiWingIcons[i].setAlpha(i < this.wingCount ? 1 : 0.2);
    }
  }

  _createDebugUI() {
    const dbg = this.add.text(CONFIG.WIDTH / 2, CONFIG.HEIGHT - 60, '[DEBUG MODE]', {
      fontFamily: 'Arial', fontSize: '13px', color: '#ff0000'
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5);
  }

  // -------------------------------------------------
  // 雲エフェクト
  // -------------------------------------------------
  createClouds() {
    this.clouds = [];
    for (let i = 0; i < 10; i++) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 0.07 + Math.random() * 0.07);
      const cx = Phaser.Math.Between(0, CONFIG.WIDTH);
      const cy = -(i * 200) + Phaser.Math.Between(-80, 80);
      g.fillEllipse(cx, cy, Phaser.Math.Between(80, 200), Phaser.Math.Between(30, 60));
      this.clouds.push({ gfx: g, baseX: cx, baseY: cy, speed: 0.05 + Math.random() * 0.1 });
    }
  }

  // -------------------------------------------------
  // ボス戦トリガー
  // -------------------------------------------------
  _triggerBoss() {
    // フラッシュ演出
    this.cameras.main.flash(600, 255, 200, 0);

    // "BOSS!" テキスト
    const bossAlert = this.add.text(CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2, '⚔️ BOSS BATTLE!', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '36px',
      color: '#FF5722',
      stroke: '#000', strokeThickness: 5
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: bossAlert,
      alpha: 1,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 400,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        bossAlert.destroy();
        this.cameras.main.fade(500, 0, 0, 0, false, (_cam, progress) => {
          if (progress === 1) {
            if (this.bgm) this.bgm.stop();
            const bossScene = Math.random() < 0.5 ? 'BossScene' : 'MemoryBossScene';
            this.scene.start(bossScene, {
              stageCount: this.stageCount,
              bananaScore: this.bananaScore,
              wingCount: this.wingCount,
              scrollSpeed: this.scrollSpeed,
              bossLevel: Math.floor(this.stageCount / CONFIG.BOSS_EVERY)
            });
          }
        });
      }
    });
  }

  // -------------------------------------------------
  // update
  // -------------------------------------------------
  update(_time, delta) {
    if (this.isDead || this._paused) return;

    const dt = delta / 1000;
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

    // ---- カメラ自動スクロール ----
    this.cameras.main.scrollY -= this.scrollSpeed * dt;

    // ---- 背景スクロール (段数に応じて上へ) ----
    const stageInCycle = this.stageCount % CONFIG.BOSS_EVERY;
    const progress = Math.min(1, stageInCycle / (CONFIG.BOSS_EVERY - 1));
    this.bgImage.y = this._bgBaseY - this._bgScrollRange * progress;

    // ---- プレイヤー自動左右移動 ----
    // 接地中: 足場の端で方向反転
    if (this.player.body.blocked.down && this.currentPlatform) {
      const plat = this.currentPlatform;
      const bodyLeft = plat.body.x;
      const bodyRight = plat.body.x + plat.body.width;
      const margin = 4; // 端ギリギリまで走らせる

      if (this.player.x <= bodyLeft + margin) {
        this.playerDir = 1;
      } else if (this.player.x >= bodyRight - margin) {
        this.playerDir = -1;
      }
      this.player.setVelocityX(CONFIG.PLAYER_SPEED * this.playerDir);
    }

    // 画面端ループ: 左右がつながる
    if (this.player.x < 0) {
      this.player.x += W;
    } else if (this.player.x > W) {
      this.player.x -= W;
    }

    // スプライトの向きを移動方向に合わせる
    this.player.setFlipX(this.playerDir < 0);

    // コヨーテタイムカウントダウン
    if (!this.player.body.blocked.down) {
      this.coyoteFrames = Math.max(0, this.coyoteFrames - 1);
    }

    // ---- 方向インジケーター (UI) ----
    this._updateDirectionArrow();

    // ---- 足場を先行生成 ----
    while (this.topPlatformY > this.cameras.main.scrollY - CONFIG.PLATFORM_BUFFER) {
      this.generateNextPlatform();
    }

    // ---- 画面下から外れた足場・バナナを削除 ----
    const cleanupY = this.cameras.main.scrollY + H + CONFIG.PLATFORM_CLEANUP;
    this.platforms.getChildren().slice().forEach(p => {
      if (p.y > cleanupY) {
        // 揺れTweenを停止してから削除
        if (p._swingTween) {
          p._swingTween.stop();
          p._swingTween = null;
        }
        this.tweens.killTweensOf(p);
        this.platforms.remove(p, true, true);
      }
    });
    this.bananas.getChildren().slice().forEach(b => {
      if (b.y > cleanupY) {
        this.bananas.remove(b, true, true);
      }
    });
    this.friends.getChildren().slice().forEach(f => {
      if (f.y > cleanupY) {
        this.friends.remove(f, true, true);
      }
    });

    // ---- スクロール速度自動加速 ----
    const targetSpeed = Math.min(
      CONFIG.SCROLL_SPEED_BASE + Math.floor(this.stageCount / 50) * CONFIG.SCROLL_SPEED_PER_50,
      CONFIG.SCROLL_SPEED_MAX
    );
    this.scrollSpeed = Phaser.Math.Linear(this.scrollSpeed, targetSpeed, 0.02);

    // ---- ゲームオーバー判定: プレイヤーが画面外 (下) に落ちた ----
    if (this.player.y > this.cameras.main.scrollY + H + 80) {
      if (this.wingCount > 0) {
        this._useWing();
      } else {
        this._gameOver();
      }
    }
  }

  /** 方向インジケーター更新 (プレイヤーの上に小さな三角) */
  _updateDirectionArrow() {
    this.dirArrow.clear();

    // プレイヤーのスクリーン座標
    const sx = this.player.x - this.cameras.main.scrollX;
    const sy = this.player.y - this.cameras.main.scrollY - CONFIG.PLAYER_RADIUS - 14;

    this.dirArrow.fillStyle(0xffffff, 0.75);
    if (this.playerDir > 0) {
      // 右矢印
      this.dirArrow.fillTriangle(sx + 4, sy, sx + 12, sy + 5, sx + 4, sy + 10);
    } else {
      // 左矢印
      this.dirArrow.fillTriangle(sx - 4, sy, sx - 12, sy + 5, sx - 4, sy + 10);
    }
  }

  // -------------------------------------------------
  // フレンド
  // -------------------------------------------------
  _touchFriend(player, friend) {
    if (this.isDead || friend._touched) return;
    friend._touched = true;

    const screenX = friend.x - this.cameras.main.scrollX;
    const screenY = friend.y - this.cameras.main.scrollY - CONFIG.FRIEND_SIZE / 2 - 10;

    if (friend.friendType === 'friend_02') {
      // --- 羽を獲得 (最大2、満タン時はバナナ+50) ---
      if (this.wingCount >= 2) {
        this.bananaScore += 50;
        this._updateBananaUI();

        const ft = this.add.text(screenX, screenY, '+50🍌', {
          fontFamily: 'Arial Black', fontSize: '22px',
          color: '#FFD700', stroke: '#000', strokeThickness: 4
        }).setScrollFactor(0).setDepth(100).setOrigin(0.5);
        this.tweens.add({
          targets: ft, y: screenY - 70, alpha: 0, duration: 1200,
          ease: 'Cubic.easeOut', onComplete: () => ft.destroy()
        });

        // フレンドを消す演出だけして終了
        this.tweens.add({
          targets: friend, alpha: 0, scaleX: 1.8, scaleY: 1.8, duration: 400,
          onComplete: () => { this.friends.remove(friend, true, true); }
        });
        return;
      }
      this.wingCount++;
      this._updateWingUI();

      this.player.setTint(0x00e5ff);
      this.time.delayedCall(500, () => {
        if (this.player.active) this.player.clearTint();
      });

      const ft = this.add.text(screenX, screenY, '🪶 +1', {
        fontFamily: 'Arial Black', fontSize: '22px',
        color: '#00E5FF', stroke: '#000', strokeThickness: 4
      }).setScrollFactor(0).setDepth(100).setOrigin(0.5);

      this.tweens.add({
        targets: ft, y: screenY - 70, alpha: 0, duration: 1200,
        ease: 'Cubic.easeOut', onComplete: () => ft.destroy()
      });
    } else {
      // --- バナナ3倍 ---
      const before = this.bananaScore;
      this.bananaScore = before * 3;
      const gained = this.bananaScore - before;
      this._updateBananaUI();

      this.player.setTint(0xffd700);
      this.time.delayedCall(500, () => {
        if (this.player.active) this.player.clearTint();
      });

      const ft = this.add.text(screenX, screenY, `🍌×3! +${gained}`, {
        fontFamily: 'Arial Black', fontSize: '22px',
        color: '#FFD700', stroke: '#000', strokeThickness: 4
      }).setScrollFactor(0).setDepth(100).setOrigin(0.5);

      this.tweens.add({
        targets: ft, y: screenY - 70, alpha: 0, duration: 1200,
        ease: 'Cubic.easeOut', onComplete: () => ft.destroy()
      });
    }

    // フレンドを消す (キラキラ演出)
    this.tweens.add({
      targets: friend,
      alpha: 0, scaleX: 1.8, scaleY: 1.8, duration: 400,
      onComplete: () => {
        this.friends.remove(friend, true, true);
      }
    });
  }

  // -------------------------------------------------
  // 敵
  // -------------------------------------------------
  _spawnEnemy() {
    if (this.isDead || this.bossTriggered) return;

    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const size = CONFIG.ENEMY_SIZE;
    const camY = this.cameras.main.scrollY;

    // 画面のスクリーン座標でランダムに出現位置を決定
    const startScreenX = Math.random() < 0.5 ? -size : W + size;
    const startScreenY = Phaser.Math.Between(H * 0.1, H * 0.7);

    // ワールド座標に変換
    const enemy = this.add.sprite(startScreenX, camY + startScreenY, 'enemy_01');
    enemy.setDisplaySize(size, size);
    enemy.setDepth(12);
    this.physics.add.existing(enemy);
    enemy.body.setAllowGravity(false);
    enemy.body.setSize(size * 0.7, size * 0.7); // 当たり判定は少し小さめ
    this.enemies.add(enemy);

    // 飛行フェーズ1: ランダム地点に移動 (画面内に入ってくる)
    this.tweens.add({
      targets: enemy,
      x: Phaser.Math.Between(size, W - size),
      y: camY + Phaser.Math.Between(H * 0.1, H * 0.6),
      duration: Phaser.Math.Between(800, 1200),
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (!enemy.active) return;
        // フェーズ2: プレイヤーの「今の位置」に向かってホーミング
        this.tweens.add({
          targets: enemy,
          x: this.player.x,
          y: this.player.y,
          duration: Phaser.Math.Between(600, 1000),
          ease: 'Sine.easeIn',
          onComplete: () => {
            if (!enemy.active) return;
            // フェーズ3: ランダムに飛び去る
            const exitPoints = [];
            const num = Phaser.Math.Between(2, 3);
            for (let i = 0; i < num; i++) {
              exitPoints.push({
                x: Phaser.Math.Between(size, W - size),
                y: this.cameras.main.scrollY + Phaser.Math.Between(H * 0.05, H * 0.8)
              });
            }
            this.tweens.chain({
              targets: enemy,
              tweens: exitPoints.map(p => ({
                x: p.x, y: p.y,
                duration: Phaser.Math.Between(800, 1500),
                ease: 'Sine.easeInOut'
              })),
              onComplete: () => {
                this.enemies.remove(enemy, true, true);
              }
            });
          }
        });
      }
    });

    // 移動方向に合わせて左右反転
    this.time.addEvent({
      delay: 100,
      repeat: Math.floor(CONFIG.ENEMY_DURATION / 100),
      callback: () => {
        if (!enemy.active) return;
        enemy.setFlipX(enemy.body.velocity.x < 0);
      }
    });
  }

  _hitEnemy(player, enemy) {
    if (this.isDead || enemy._hit) return;
    enemy._hit = true;

    const screenX = player.x - this.cameras.main.scrollX;
    const screenY = player.y - this.cameras.main.scrollY - CONFIG.PLAYER_RADIUS - 20;

    if (this.wingCount > 0) {
      // 羽でガード
      this.wingCount--;
      this._updateWingUI();

      this.cameras.main.shake(200, 0.01);
      this.player.setTint(0x00e5ff);
      this.time.delayedCall(300, () => {
        if (this.player.active) this.player.clearTint();
      });

      const ft = this.add.text(screenX, screenY, '🪶 ガード！', {
        fontFamily: 'Arial Black', fontSize: '20px',
        color: '#00E5FF', stroke: '#000', strokeThickness: 4
      }).setScrollFactor(0).setDepth(100).setOrigin(0.5);

      this.tweens.add({
        targets: ft, y: screenY - 60, alpha: 0, duration: 1000,
        ease: 'Cubic.easeOut', onComplete: () => ft.destroy()
      });
    } else {
      // バナナ半減
      const lost = Math.floor(this.bananaScore / 2);
      this.bananaScore -= lost;
      this._updateBananaUI();

      this.cameras.main.shake(300, 0.02);
      this.player.setTint(0xff0000);
      this.time.delayedCall(300, () => {
        if (this.player.active) this.player.clearTint();
      });

      const ft = this.add.text(screenX, screenY, `-${lost}🍌`, {
        fontFamily: 'Arial', fontSize: '24px',
        color: '#FF4444', stroke: '#000', strokeThickness: 4
      }).setScrollFactor(0).setDepth(100).setOrigin(0.5);

      this.tweens.add({
        targets: ft, y: screenY - 60, alpha: 0, duration: 1000,
        ease: 'Cubic.easeOut', onComplete: () => ft.destroy()
      });
    }

    // 敵を消す
    this.tweens.add({
      targets: enemy,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 300,
      onComplete: () => {
        this.enemies.remove(enemy, true, true);
      }
    });
  }

  // -------------------------------------------------
  // 一時停止
  // -------------------------------------------------
  _togglePause() {
    if (this.isDead) return;

    if (this._paused) {
      // 再開 (タップでジャンプしないよう短い入力無効期間)
      this._resumeGuard = true;
      this.time.paused = false;
      this.time.delayedCall(200, () => {
        this._paused = false;
        this._resumeGuard = false;
        this.physics.resume();
        this.tweens.resumeAll();
      });

      if (this._pauseOverlay) { this._pauseOverlay.destroy(); this._pauseOverlay = null; }
      if (this._pauseText) { this._pauseText.destroy(); this._pauseText = null; }
      if (this._resumeText) { this._resumeText.destroy(); this._resumeText = null; }
    } else {
      // 一時停止
      this._paused = true;
      this.physics.pause();
      this.tweens.pauseAll();
      this.time.paused = true;

      const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

      this._pauseOverlay = this.add.graphics().setScrollFactor(0).setDepth(500);
      this._pauseOverlay.fillStyle(0x000000, 0.6);
      this._pauseOverlay.fillRect(0, 0, W, H);
      this._pauseOverlay.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains
      );

      this._pauseText = this.add.text(W / 2, H / 2 - 30, '⏸ PAUSE', {
        fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '42px',
        color: '#ffffff', stroke: '#000', strokeThickness: 5
      }).setOrigin(0.5).setScrollFactor(0).setDepth(501);

      this._resumeText = this.add.text(W / 2, H / 2 + 30, 'タップで再開', {
        fontFamily: '"M PLUS Rounded 1c", Arial', fontSize: '18px',
        color: '#aaaaaa', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5).setScrollFactor(0).setDepth(501);

      this._pauseOverlay.on('pointerdown', () => {
        this._togglePause();
      });
    }
  }

  // -------------------------------------------------
  // 羽で復帰
  // -------------------------------------------------
  _useWing() {
    if (this._recovering) return;
    this._recovering = true;

    this.wingCount--;
    this._updateWingUI();

    // 画面のフラッシュ
    this.cameras.main.flash(400, 0, 200, 255);

    // 画面内で一番近い足場を探す
    const camY = this.cameras.main.scrollY;
    const H = CONFIG.HEIGHT;
    const visiblePlatforms = this.platforms.getChildren()
      .filter(p => !p.isGhost && p.y > camY && p.y < camY + H);

    let targetY, targetX;
    if (visiblePlatforms.length > 0) {
      // 画面中央に一番近い足場を選ぶ
      const centerY = camY + H * 0.5;
      visiblePlatforms.sort((a, b) => Math.abs(a.y - centerY) - Math.abs(b.y - centerY));
      const target = visiblePlatforms[0];
      targetX = target.x;
      targetY = target.y - CONFIG.PLATFORM_H / 2 - CONFIG.PLAYER_HIT_H / 2 - 2;
    } else {
      // 足場がなければ画面中央に飛ばす
      targetX = CONFIG.WIDTH / 2;
      targetY = camY + H * 0.5;
    }

    // プレイヤーを画面下から飛び上がらせる
    this.player.setPosition(targetX, camY + H + 40);
    this.player.setVelocity(0, CONFIG.JUMP_VY * 1.2);

    // 羽エフェクトテキスト
    const ft = this.add.text(CONFIG.WIDTH / 2, H / 2, '🪶 復活！', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '28px',
      color: '#00E5FF', stroke: '#000', strokeThickness: 5
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: ft,
      alpha: 1, y: H / 2 - 40, duration: 400,
      yoyo: true, hold: 600,
      onComplete: () => {
        ft.destroy();
        this._recovering = false;
      }
    });
  }

  // -------------------------------------------------
  // ゲームオーバー
  // -------------------------------------------------
  _gameOver() {
    if (this.isDead) return;
    this.isDead = true;

    if (this.bgm) this.bgm.stop();
    this.sound.play('miss');
    this.cameras.main.shake(400, 0.025);

    // ゲームオーバーテキスト
    const got = this.add.text(CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 30, 'GAME OVER', {
      fontFamily: '"M PLUS Rounded 1c", Arial Black', fontSize: '44px',
      color: '#F44336', stroke: '#000', strokeThickness: 6
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: got, alpha: 1, duration: 500 });

    this.time.delayedCall(1500, () => {
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
  }
}
