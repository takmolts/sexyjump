import Phaser from 'phaser';
import { CONFIG } from './GameConfig.js';
import BootScene     from './scenes/BootScene.js';
import TitleScene    from './scenes/TitleScene.js';
import GameScene     from './scenes/GameScene.js';
import BossScene       from './scenes/BossScene.js';
import MemoryBossScene from './scenes/MemoryBossScene.js';
import JankenBossScene from './scenes/JankenBossScene.js';
import GameOverScene   from './scenes/GameOverScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: CONFIG.WIDTH,
  height: CONFIG.HEIGHT,
  backgroundColor: '#0d0520',
  parent: 'game-container',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },   // 個別 sprite に setGravityY で設定する
      debug: false
    }
  },
  dom: {
    createContainer: true   // GameOverScene の DOM element (name input) に必要
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CONFIG.WIDTH,
    height: CONFIG.HEIGHT
  },
  scene: [
    BootScene,
    TitleScene,
    GameScene,
    BossScene,
    MemoryBossScene,
    JankenBossScene,
    GameOverScene
  ]
});

export default game;
