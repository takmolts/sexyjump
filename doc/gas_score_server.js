// =============================================================
// Google Apps Script - スコア集計バックエンド (GET統一版)
// Browser Games (tetris 等) のオンラインランキング管理
// =============================================================
//
// 【セットアップ手順】
// 1. Google スプレッドシートを新規作成
//    シート名: scores
//    1行目（ヘッダー）: game_id / player_name / score / timestamp
//
// 2. スプレッドシートの「拡張機能」→「Apps Script」でこのコードを貼り付けて保存
//
// 3. 「デプロイ」→「新しいデプロイ」
//    種類: ウェブアプリ
//    実行ユーザー: 自分
//    アクセス: 全員（匿名ユーザーを含む）
//    → 発行されたURLを engine/net_score.py の SCORE_API_URL に貼り付ける
//
// ★ GET のクエリパラメータで get/post 両方を処理します（POSTは使いません）
// =============================================================

const SHEET_NAME = "scores";
const MAX_PER_GAME = 20;  // 各ゲームの保存上限

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

// -----------------------------------------------------------
// すべての通信を doGet で処理
//   GET  ?action=get&game_id=tetris&limit=10
//   POST ?action=post&game_id=tetris&player_name=AAA&score=12345
// -----------------------------------------------------------
function doGet(e) {
  // CORS対応ヘッダーを含む出力
  try {
    const params  = e.parameter;
    const action  = params.action  || "get";
    const game_id = params.game_id || "tetris";

    if (action === "post") {
      return handlePost(params, game_id);
    } else {
      return handleGet(params, game_id);
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// -----------------------------------------------------------
// スコア取得
// -----------------------------------------------------------
function handleGet(params, game_id) {
  const limit = parseInt(params.limit || "10", 10);
  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();

  const rows = data.slice(1)            // ヘッダー除く
    .filter(r => r[0] === game_id)
    .map(r => ({ name: String(r[1]), score: Number(r[2]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return jsonResponse({ ok: true, scores: rows });
}

// -----------------------------------------------------------
// スコア登録
// -----------------------------------------------------------
function handlePost(params, game_id) {
  const player_name = (params.player_name || "????").slice(0, 16);
  const score       = parseInt(params.score || "0", 10);

  const sheet = getSheet();

  // ヘッダーがなければ初期化
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["game_id", "player_name", "score", "timestamp"]);
  }

  // 同一プレイヤー名が既に存在する場合はスコアが高い方で上書き
  const data = sheet.getDataRange().getValues();
  let existingRow = -1;
  let existingScore = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === game_id && String(data[i][1]) === player_name) {
      existingRow = i + 1;  // シートの行番号（1始まり）
      existingScore = Number(data[i][2]);
      break;
    }
  }

  if (existingRow > 0) {
    if (score > existingScore) {
      sheet.getRange(existingRow, 3).setValue(score);
      sheet.getRange(existingRow, 4).setValue(new Date().toISOString());
    }
  } else {
    sheet.appendRow([game_id, player_name, score, new Date().toISOString()]);
    pruneOldScores(sheet, game_id);
  }

  return jsonResponse({ ok: true });
}

// -----------------------------------------------------------
// 各ゲームID別に MAX_PER_GAME 件を超えた低スコア行を削除
// -----------------------------------------------------------
function pruneOldScores(sheet, game_id) {
  const data = sheet.getDataRange().getValues();
  const gameRows = data.slice(1)
    .map((r, i) => ({ row: i + 2, game_id: r[0], score: Number(r[2]) }))
    .filter(r => r.game_id === game_id)
    .sort((a, b) => b.score - a.score);

  if (gameRows.length > MAX_PER_GAME) {
    const toDelete = gameRows.slice(MAX_PER_GAME).map(r => r.row).sort((a, b) => b - a);
    toDelete.forEach(r => sheet.deleteRow(r));
  }
}

// -----------------------------------------------------------
// ヘルパー: JSON レスポンス
// -----------------------------------------------------------
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
