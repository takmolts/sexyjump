import { CONFIG } from './GameConfig.js';

/**
 * GASからスコア一覧を取得する
 * @param {number} limit 取得件数
 * @returns {Promise<Array<{name:string, score:number}>>}
 */
export async function fetchScores(limit = 10) {
  const params = new URLSearchParams({
    action: 'get',
    game_id: CONFIG.GAME_ID,
    limit: String(limit)
  });
  const url = `${CONFIG.GAS_URL}?${params}`;

  try {
    const res = await fetch(url, { cache: 'no-cache', redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.scores || [];
  } catch (err) {
    console.error('[GAS] スコア取得エラー:', err);
    return [];
  }
}

/**
 * GASにスコアを送信する (Image ping方式 = CORSを回避)
 * @param {string} playerName プレイヤー名
 * @param {number} score スコア
 * @returns {Promise<boolean>}
 */
export function sendScore(playerName, score) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      action: 'post',
      game_id: CONFIG.GAME_ID,
      player_name: playerName,
      score: String(score)
    });
    const url = `${CONFIG.GAS_URL}?${params}`;

    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(true); // GASはJSONを返すのでonerrorになるが送信は成功している
    img.src = url;

    // 5秒でタイムアウト
    setTimeout(() => resolve(false), 5000);
  });
}
