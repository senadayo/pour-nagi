// assets/game.js
(() => {
  const KEY_QUIZ = "nagi_quiz_passed_v3";
  const KEY_GAME = "nagi_game_cleared_v1";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const statusEl = document.getElementById("status");
  const overlay = document.getElementById("overlay");
  const ovKicker = document.getElementById("ovKicker");
  const ovTitle  = document.getElementById("ovTitle");
  const ovText   = document.getElementById("ovText");
  const ovAgain  = document.getElementById("ovAgain");
  const ovLetter = document.getElementById("ovLetter");

  const btnJump = document.getElementById("btnJump");
  const btnRestart = document.getElementById("btnRestart");

  // ====== 設定（チャリ走風） ======
  const GRAVITY = 2000;

  // オートラン速度：後半ほど上がる（難易度UP）
  const BASE_SPEED = 360;
  const MAX_SPEED_BONUS = 210; // 最大+210
  const SPEED_RAMP_AT = 5200;  // ここまででMAXまで上がるイメージ

  const JUMP_SPEED = 790;
  const DOUBLE_JUMP_SPEED = 720;

  // 難易度UP：猶予を少し短く
  const COYOTE_TIME = 0.09;

  // 距離アップ
  const world = { width: 8600, height: 900 };

  // 2段ジャンプ（追加ジャンプ1回）
  const EXTRA_JUMPS = 1;

  // ====== 軽量グレイン ======
  const noise = document.createElement("canvas");
  noise.width = 220;
  noise.height = 120;
  const nctx = noise.getContext("2d");
  (function makeNoise() {
    const img = nctx.createImageData(noise.width, noise.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 28;
    }
    nctx.putImageData(img, 0, 0);
  })();

  // ====== Utils ======
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function ground(x,y,w,h){ return { x,y,w,h, kind:"ground" }; }
  function block(x,y,w,h){ return { x,y,w,h, kind:"block" }; }
  function coin(x,y){ return { x,y,w:22,h:22,taken:false }; }
  function enemy(x,y,minX,maxX,speed){
    return { x,y,w:32,h:26,vx:speed||110,minX,maxX,alive:true };
  }

  // ====== Level ======
  function makeLevel(){
    const platforms = [];
    const coins = [];
    const enemies = [];

    const GY = 380; // ground top y
    const GH = 40;

    // 地面：ギャップ多め（難易度UP）
    // ※ギャップが広すぎると理不尽なので、幅は段階的に上げてる
    const seg = [
      [0, 920],
      [1060, 1750],
      [1910, 2700],
      [2880, 3600],
      [3760, 4520],
      [4720, 5480],
      [5650, 6400],
      [6560, 7350],
      [7520, 8200],
      [8320, 8600],
    ];
    for(const [a,b] of seg){
      platforms.push(ground(a, GY, b-a, GH));
    }

    // 障害物：低ブロック＆高ブロック（2段ジャンプを活かす）
    // ブロックに横当たり＝負け、上に着地はOK
    const LOW = 40;
    const TALL = 40;

    const blocks = [
      [640,  LOW], [1540, LOW], [2320, LOW], [3180, LOW], [4040, LOW],
      [4880, LOW], [5760, LOW], [6600, LOW], [7440, LOW], [8200, LOW],

      // 高ブロック（難しい：2段ジャンプ推奨）
      [1240, TALL], [2600, TALL], [4460, TALL], [6120, TALL], [7820, TALL],
    ];
    for(const [x,h] of blocks){
      platforms.push(block(x, GY - h, 48, h));
    }

    // コイン：危険地帯の「ジャンプ合図」になるよう配置
    const coinPts = [
      [520,300],[780,300],
      [1120,300],[1300,260],
      [1440,300],[1660,270],
      [2100,300],[2360,270],
      [2820,300],[3050,270],
      [3500,300],[3720,270],
      [4180,300],[4420,270],
      [4700,300],[4980,270],
      [5400,300],[5640,270],
      [6040,300],[6280,270],
      [6480,300],[6720,270],
      [7100,300],[7340,270],
      [7480,300],[7740,270],
      [8040,300],[8280,270],
    ];
    for(const [x,y] of coinPts) coins.push(coin(x,y));

    // 敵：数増（難易度UP）
    const enemyY = GY - 26;

    // 地面パトロール（巡回範囲短め＆速度ちょい速）
    const enemyDefs = [
      [1120, 1080, 1320, 125],
      [2060, 1980, 2240, 135],
      [2940, 2880, 3120, 140],
      [3860, 3780, 4020, 140],
      [4760, 4680, 4920, 145],
      [5660, 5580, 5800, 150],
      [6540, 6460, 6680, 155],
      [7400, 7320, 7520, 160],
      [8140, 8080, 8320, 165],
    ];
    for(const [x,minX,maxX,spd] of enemyDefs){
      enemies.push(enemy(x, enemyY, minX, maxX, spd));
    }

    // ゴール
    const goal = { x: world.width - 120, y: 250, w: 28, h: 130 };
    const goalFlag = { x: world.width - 92, y: 250, w: 56, h: 34 };

    return { platforms, coins, enemies, goal, goalFlag, GY };
  }

  // ====== State ======
  let level, player, cameraX;
  let collected, totalCoins, defeated, totalEnemies;
  let gameState = "play";
  let jumpRequest = false;
  let jumpPressed = false;

  function reset(){
    level = makeLevel();
    player = {
      x: 60, y: 200,
      w: 34, h: 44,
      vx: BASE_SPEED,
      vy: 0,
      onGround: false,
      coyote: 0,
      facing: 1,
      extraJumps: EXTRA_JUMPS,
    };

    cameraX = 0;
    collected = 0;
    totalCoins = level.coins.length;
    defeated = 0;
    totalEnemies = level.enemies.length;
    gameState = "play";

    hideOverlay();
    updateStatus();
  }

  // ====== Input ======
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { jumpRequest = true; }
    if (e.code === "KeyR") reset();
  });

  btnJump.addEventListener("pointerdown", (e) => { e.preventDefault(); jumpRequest = true; });
  btnRestart.addEventListener("click", reset);
  ovAgain.addEventListener("click", reset);

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    jumpRequest = true;
  }, { passive:false });

  // ====== Loop ======
  let last = performance.now();
  function loop(now){
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    if(gameState === "play") step(dt);
    draw();

    requestAnimationFrame(loop);
  }

  function currentSpeed(){
    // 進行度に応じて速度UP（後半ほど難しい）
    const t = clamp(player.x / SPEED_RAMP_AT, 0, 1);
    return BASE_SPEED + MAX_SPEED_BONUS * t;
  }

  function step(dt){
    const prevBottom = player.y + player.h;

    // オートラン（加速）
    player.vx = currentSpeed();
    player.facing = 1;

    // コヨーテ
    if (player.onGround) player.coyote = COYOTE_TIME;
    else player.coyote = Math.max(0, player.coyote - dt);

    // 2段ジャンプ
    if (jumpRequest && !jumpPressed) {
      if (player.onGround || player.coyote > 0) {
        player.vy = -JUMP_SPEED;
        player.onGround = false;
        player.coyote = 0;
        player.extraJumps = EXTRA_JUMPS;
      } else if (player.extraJumps > 0) {
        player.vy = -DOUBLE_JUMP_SPEED;
        player.extraJumps -= 1;
      }
      jumpPressed = true;
      jumpRequest = false;
    }
    if (!jumpRequest) jumpPressed = false;

    // 重力
    player.vy += GRAVITY * dt;

    // 敵移動
    for(const e of level.enemies){
      if(!e.alive) continue;
      e.x += e.vx * dt;
      if(e.x < e.minX){ e.x = e.minX; e.vx = Math.abs(e.vx); }
      if(e.x + e.w > e.maxX){ e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx); }
    }

    // 移動＆衝突
    if(moveX(player.vx * dt)) return; // ブロック横当たりで負け
    moveY(player.vy * dt);

    // 落下負け
    if(player.y > 700){
      lose("残念…", "落ちちゃった！もう一回いこう。");
      return;
    }

    // コイン
    for(const c of level.coins){
      if(!c.taken && aabb(player, c)){
        c.taken = true;
        collected++;
        updateStatus();
      }
    }

    // 敵：踏めば倒す／当たれば負け
    for(const e of level.enemies){
      if(!e.alive) continue;
      if(!aabb(player, e)) continue;

      const playerBottom = player.y + player.h;
      const enemyTop = e.y;
      const verticalOverlap = playerBottom - enemyTop;

      const isFalling = player.vy > 0;
      const cameFromAbove = prevBottom <= enemyTop + 6;
      const stomp = isFalling && cameFromAbove && verticalOverlap < 18;

      if(stomp){
        e.alive = false;
        defeated++;
        // 踏んだら少し跳ねる（気持ちよさ）
        player.vy = -JUMP_SPEED * 0.55;
        updateStatus();
      }else{
        lose("残念…", "敵に当たっちゃった！踏んで倒そう。");
        return;
      }
    }

    // ゴール
    if(aabb(player, level.goal) || aabb(player, level.goalFlag)){
      win();
      return;
    }

    // カメラ（少し先が見える）
    cameraX = clamp(player.x - canvas.width * 0.30, 0, world.width - canvas.width);
  }

  // X移動：ブロック横当たり＝負け
  function moveX(dx){
    player.x += dx;
    player.x = clamp(player.x, 0, world.width - player.w);

    for(const p of level.platforms){
      if(!aabb(player, p)) continue;

      if(dx > 0) player.x = p.x - player.w;
      else if(dx < 0) player.x = p.x + p.w;

      if(p.kind === "block"){
        lose("残念…", "障害物にぶつかった！ジャンプで避けよう。");
        return true;
      }
    }
    return false;
  }

  // Y移動：着地で2段目補充
  function moveY(dy){
    player.y += dy;
    player.onGround = false;

    for(const p of level.platforms){
      if(!aabb(player, p)) continue;

      if(dy > 0){
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
        player.extraJumps = EXTRA_JUMPS;
      }else if(dy < 0){
        player.y = p.y + p.h;
        player.vy = 0;
      }
    }
  }

  // ====== Win/Lose ======
  function win(){
    gameState = "win";
    localStorage.setItem(KEY_GAME, "yes");

    ovLetter.style.display = "inline-block";
    ovLetter.href = "secret.html";

    const quizPassed = localStorage.getItem(KEY_QUIZ) === "yes";
    if(quizPassed){
      showOverlay("クリア！", "手紙が読めるよ。", "Clear");
    }else{
      showOverlay("クリア！", "次はSecretのクイズをクリアしてね。", "Clear");
    }
  }

  function lose(title, text){
    gameState = "lose";
    ovLetter.style.display = "none"; // 失敗時は「もう一回」だけ
    showOverlay(title, text, "Try again");
  }

  // ====== Draw ======
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    const g = ctx.createLinearGradient(0,0,0,canvas.height);
    g.addColorStop(0,"rgba(255,255,255,0.92)");
    g.addColorStop(1,"rgba(240,236,228,0.92)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.globalAlpha = 0.08;
    for(let y=0;y<canvas.height;y+=noise.height){
      for(let x=0;x<canvas.width;x+=noise.width){
        ctx.drawImage(noise, x, y);
      }
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.moveTo(0, 360);
    ctx.lineTo(canvas.width, 360);
    ctx.stroke();

    ctx.save();
    ctx.translate(-cameraX, 0);

    for(const p of level.platforms) drawPlatform(p);
    for(const c of level.coins) if(!c.taken) drawCoin(c);
    for(const e of level.enemies) if(e.alive) drawEnemy(e);
    drawGoal(level.goal, level.goalFlag);
    drawPlayer(player);

    ctx.restore();

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "14px serif";
    ctx.fillText("Space/Tap: Jump (Double Jump) / R: Restart", 12, 22);
  }

  function drawPlatform(p){
    ctx.fillStyle = (p.kind === "block")
      ? "rgba(255,255,255,0.70)"
      : "rgba(255,255,255,0.55)";
    ctx.fillRect(p.x, p.y, p.w, p.h);

    ctx.strokeStyle = "rgba(0,0,0,0.14)";
    ctx.strokeRect(p.x+0.5, p.y+0.5, p.w-1, p.h-1);
  }

  function drawCoin(c){
    const r = 10;
    const cx = c.x + c.w/2;
    const cy = c.y + c.h/2;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fillStyle = "rgba(200,170,80,0.75)";
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r*0.55, 0, Math.PI*2);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.stroke();
  }

  function drawEnemy(e){
    ctx.fillStyle = "rgba(120,80,55,0.78)";
    ctx.fillRect(e.x, e.y, e.w, e.h);

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.strokeRect(e.x+0.5, e.y+0.5, e.w-1, e.h-1);

    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillRect(e.x + 9, e.y + 9, 4, 4);
    ctx.fillRect(e.x + 19, e.y + 9, 4, 4);
  }

  function drawGoal(pole, flag){
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(pole.x, pole.y, pole.w, pole.h);

    ctx.fillStyle = "rgba(180,70,70,0.75)";
    ctx.fillRect(flag.x, flag.y, flag.w, flag.h);

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.strokeRect(flag.x+0.5, flag.y+0.5, flag.w-1, flag.h-1);
  }

  // 赤ベース人間キャラ
  function drawPlayer(pl){
    const now = performance.now();
    const moving = pl.onGround && Math.abs(pl.vx) > 20;
    const step = moving ? Math.sin(now / 90) * 2.2 : 0;

    const red1 = "rgba(185,55,55,0.92)";
    const red2 = "rgba(145,35,35,0.92)";
    const skin = "rgba(235,206,175,0.95)";
    const dark = "rgba(25,25,25,0.70)";
    const white = "rgba(255,255,255,0.75)";

    ctx.save();
    ctx.translate(pl.x, pl.y);

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(17, 44, 12, 3.2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = skin;
    ctx.fillRect(11, 6, 12, 12);

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(15, 11, 2, 2);
    ctx.fillRect(19, 11, 2, 2);

    ctx.fillStyle = "rgba(220,120,120,0.35)";
    ctx.fillRect(14, 14, 2, 2);

    ctx.fillStyle = red1;
    ctx.fillRect(10, 3, 14, 6);
    ctx.fillStyle = red2;
    ctx.fillRect(9, 8, 8, 3);
    ctx.fillStyle = white;
    ctx.fillRect(12, 4, 3, 2);

    ctx.fillStyle = red1;
    ctx.fillRect(10, 18, 14, 12);
    ctx.fillStyle = red2;
    ctx.fillRect(20, 18, 4, 12);

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(14, 22, 2, 2);

    ctx.fillStyle = red2;
    ctx.fillRect(7, 20, 3, 9);
    ctx.fillRect(24, 20, 3, 9);

    ctx.fillStyle = white;
    ctx.fillRect(7, 28, 3, 3);
    ctx.fillRect(24, 28, 3, 3);

    ctx.fillStyle = red2;
    ctx.fillRect(12, 30, 4, 10 + step);
    ctx.fillRect(18, 30, 4, 10 - step);

    ctx.fillStyle = dark;
    ctx.fillRect(11, 40 + step, 6, 4);
    ctx.fillRect(17, 40 - step, 6, 4);

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(10.5, 18.5, 13, 11);
    ctx.strokeRect(11.5, 6.5, 11, 11);

    ctx.restore();
  }

  function showOverlay(title, text, kicker){
    ovKicker.textContent = kicker || "Result";
    ovTitle.textContent = title;
    ovText.textContent = text;
    overlay.style.display = "flex";
  }
  function hideOverlay(){ overlay.style.display = "none"; }

  function updateStatus(){
    const progress = Math.floor((player.x / (world.width - 120)) * 100);
    const spd = Math.round(currentSpeed());
    statusEl.textContent =
      `Progress: ${clamp(progress,0,100)}%  |  Speed: ${spd}  |  Coins: ${collected}/${totalCoins}  |  Enemies: ${defeated}/${totalEnemies}`;
  }

  // start
  reset();
  requestAnimationFrame(loop);
})();
