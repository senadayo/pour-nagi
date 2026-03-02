// assets/game.js
(() => {
  const KEY_QUIZ = "nagi_quiz_passed_v3";
  const KEY_GAME = "nagi_game_cleared_v1";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const statusEl = document.getElementById("status");
  const overlay = document.getElementById("overlay");
  const ovKicker = document.getElementById("ovKicker");
  const ovTitle = document.getElementById("ovTitle");
  const ovText = document.getElementById("ovText");
  const ovAgain = document.getElementById("ovAgain");
  const ovLetter = document.getElementById("ovLetter");

  const btnLeft = document.getElementById("btnLeft");
  const btnRight = document.getElementById("btnRight");
  const btnJump = document.getElementById("btnJump");
  const btnRestart = document.getElementById("btnRestart");

  // ====== ゲーム設定 ======
  const GRAVITY = 1900;
  const MOVE_SPEED = 340;
  const JUMP_SPEED = 780;
  const FRICTION = 0.86;
  const COYOTE_TIME = 0.12;

  // 距離2倍
  const world = { width: 5200, height: 900 };

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
  function rect(x, y, w, h) { return { x, y, w, h }; }
  function coin(x, y) { return { x, y, w: 22, h: 22, taken: false }; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ====== Enemy ======
  function enemy(x, y, minX, maxX, speed) {
    return { x, y, w: 32, h: 26, vx: speed || 90, minX, maxX, alive: true };
  }

  // ====== Level ======
  function makeLevel() {
    const platforms = [];
    const coins = [];
    const enemies = [];

    platforms.push(rect(0, 380, world.width, 40));

    // 前半
    platforms.push(rect(220, 320, 160, 20));
    platforms.push(rect(460, 270, 180, 20));
    platforms.push(rect(760, 310, 170, 20));
    platforms.push(rect(1080, 250, 190, 20));
    platforms.push(rect(1420, 290, 190, 20));
    platforms.push(rect(1730, 235, 190, 20));
    platforms.push(rect(2050, 290, 220, 20));
    platforms.push(rect(2360, 260, 220, 20));

    // 後半
    const s = 2600;
    platforms.push(rect(s + 220, 320, 180, 20));
    platforms.push(rect(s + 520, 275, 190, 20));
    platforms.push(rect(s + 840, 305, 190, 20));
    platforms.push(rect(s + 1160, 245, 210, 20));
    platforms.push(rect(s + 1490, 290, 210, 20));
    platforms.push(rect(s + 1820, 230, 210, 20));
    platforms.push(rect(s + 2140, 290, 240, 20));
    platforms.push(rect(s + 2460, 255, 240, 20));

    // 安心足場
    platforms.push(rect(1200, 340, 380, 18));
    platforms.push(rect(s + 1200, 340, 420, 18));

    // coins
    const coinPoints = [
      [260, 285], [520, 235], [820, 275], [1140, 215], [1490, 255], [1800, 200],
      [2140, 255], [2220, 255], [2440, 225],
      [s + 280, 285], [s + 560, 240], [s + 900, 270], [s + 1200, 205], [s + 1520, 255],
      [s + 1860, 195], [s + 2160, 255], [s + 2260, 255], [s + 2500, 220]
    ];
    for (const [x, y] of coinPoints) coins.push(coin(x, y));

    // enemies
    const groundY = 380 - 26;

    enemies.push(enemy(520, groundY, 420, 720, 110));
    enemies.push(enemy(980, groundY, 880, 1180, 120));
    enemies.push(enemy(1580, groundY, 1480, 1780, 110));
    enemies.push(enemy(2120, groundY, 2000, 2320, 125));

    enemies.push(enemy(1080 + 40, 250 - 26, 1080, 1080 + 190 - 32, 90));
    enemies.push(enemy(1730 + 40, 235 - 26, 1730, 1730 + 190 - 32, 95));

    enemies.push(enemy(s + 620, groundY, s + 520, s + 860, 120));
    enemies.push(enemy(s + 1120, groundY, s + 980, s + 1380, 125));
    enemies.push(enemy(s + 1700, groundY, s + 1560, s + 1960, 120));
    enemies.push(enemy(s + 2320, groundY, s + 2140, s + 2520, 130));

    enemies.push(enemy(s + 1160 + 50, 245 - 26, s + 1160, s + 1160 + 210 - 32, 95));
    enemies.push(enemy(s + 1820 + 60, 230 - 26, s + 1820, s + 1820 + 210 - 32, 100));

    const goal = rect(world.width - 120, 250, 28, 130);
    const goalFlag = rect(world.width - 92, 250, 56, 34);

    return { platforms, coins, enemies, goal, goalFlag };
  }

  // ====== State ======
  let player, cameraX, level;
  let collected, totalCoins, defeated, totalEnemies;
  let gameState;
  const keys = { left: false, right: false, jump: false };
  let jumpPressed = false;

  function reset() {
    level = makeLevel();
    player = {
      x: 60, y: 200,
      w: 34, h: 44,
      vx: 0, vy: 0,
      onGround: false,
      coyote: 0,
      facing: 1,
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

  // ====== Input PC ======
  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft") keys.left = true;
    if (e.code === "ArrowRight") keys.right = true;
    if (e.code === "Space") keys.jump = true;
    if (e.code === "KeyR") reset();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft") keys.left = false;
    if (e.code === "ArrowRight") keys.right = false;
    if (e.code === "Space") keys.jump = false;
  });

  // ====== Input Mobile (hold) ======
  bindHold(btnLeft, (down) => keys.left = down);
  bindHold(btnRight, (down) => keys.right = down);
  bindHold(btnJump, (down) => keys.jump = down);

  btnRestart.addEventListener("click", reset);
  ovAgain.addEventListener("click", reset);

  function bindHold(el, fn) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      fn(true);
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener("pointerup", (e) => { e.preventDefault(); fn(false); });
    el.addEventListener("pointercancel", (e) => { e.preventDefault(); fn(false); });
  }

  // ====== Loop ======
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    if (gameState === "play") step(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function step(dt) {
    const prevBottom = player.y + player.h;

    // move
    if (keys.left) player.vx = -MOVE_SPEED;
    if (keys.right) player.vx = MOVE_SPEED;

    // facing
    if (keys.left && !keys.right) player.facing = -1;
    else if (keys.right && !keys.left) player.facing = 1;
    else {
      if (player.vx > 30) player.facing = 1;
      else if (player.vx < -30) player.facing = -1;
    }

    if (!keys.left && !keys.right) {
      if (player.onGround) player.vx *= FRICTION;
      if (Math.abs(player.vx) < 8) player.vx = 0;
    }

    // coyote
    if (player.onGround) player.coyote = COYOTE_TIME;
    else player.coyote = Math.max(0, player.coyote - dt);

    // jump
    if (keys.jump && !jumpPressed) {
      if (player.onGround || player.coyote > 0) {
        player.vy = -JUMP_SPEED;
        player.onGround = false;
        player.coyote = 0;
      }
      jumpPressed = true;
    }
    if (!keys.jump) jumpPressed = false;

    // gravity
    player.vy += GRAVITY * dt;

    // enemies
    for (const e of level.enemies) {
      if (!e.alive) continue;
      e.x += e.vx * dt;

      if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); }
      if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx); }
    }

    // move & collide
    moveX(player.vx * dt);
    moveY(player.vy * dt);

    // fall lose
    if (player.y > 700) {
      lose("残念…", "落ちちゃった！もう一回いこう。");
      return;
    }

    // coins
    for (const c of level.coins) {
      if (!c.taken && aabb(player, c)) {
        c.taken = true;
        collected++;
        updateStatus();
      }
    }

    // enemy collision (stomp to defeat)
    for (const e of level.enemies) {
      if (!e.alive) continue;
      if (!aabb(player, e)) continue;

      const playerBottom = player.y + player.h;
      const enemyTop = e.y;
      const verticalOverlap = playerBottom - enemyTop;

      const isFalling = player.vy > 0;
      const cameFromAbove = prevBottom <= enemyTop + 6;
      const stomp = isFalling && cameFromAbove && verticalOverlap < 18;

      if (stomp) {
        e.alive = false;
        defeated++;
        player.vy = -JUMP_SPEED * 0.55;
        updateStatus();
      } else {
        lose("残念…", "敵に当たっちゃった！上から踏んで倒そう。");
        return;
      }
    }

    // goal
    if (aabb(player, level.goal) || aabb(player, level.goalFlag)) {
      win();
      return;
    }

    // camera
    cameraX = clamp(player.x - canvas.width * 0.45, 0, world.width - canvas.width);
  }

  function moveX(dx) {
    player.x += dx;
    player.x = clamp(player.x, 0, world.width - player.w);

    for (const p of level.platforms) {
      if (aabb(player, p)) {
        if (dx > 0) player.x = p.x - player.w;
        else if (dx < 0) player.x = p.x + p.w;
        player.vx = 0;
      }
    }
  }

  function moveY(dy) {
    player.y += dy;
    player.onGround = false;

    for (const p of level.platforms) {
      if (aabb(player, p)) {
        if (dy > 0) {
          player.y = p.y - player.h;
          player.vy = 0;
          player.onGround = true;
        } else if (dy < 0) {
          player.y = p.y + p.h;
          player.vy = 0;
        }
      }
    }
  }

  // ====== Win/Lose overlay behavior ======
  function win() {
    gameState = "win";
    localStorage.setItem(KEY_GAME, "yes");

    // クリア時だけ「手紙を見る」を表示
    ovLetter.style.display = "inline-block";

    // クイズも通ってたらそのまま手紙へ（secretが表示する）
    const quizPassed = localStorage.getItem(KEY_QUIZ) === "yes";
    ovLetter.href = "secret.html";

    if (quizPassed) {
      showOverlay("クリア！", "手紙が読めるよ。", "Clear");
    } else {
      showOverlay("クリア！", "次はSecretのクイズをクリアしてね。", "Clear");
    }
  }

  function lose(title, text) {
    gameState = "lose";

    // 負けたら「手紙を見る」は出さない（もう一回のみ）
    ovLetter.style.display = "none";

    showOverlay(title, text, "Try again");
  }

  // ====== Draw ======
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // paper bg
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "rgba(255,255,255,0.92)");
    g.addColorStop(1, "rgba(240,236,228,0.92)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grain
    ctx.globalAlpha = 0.08;
    for (let y = 0; y < canvas.height; y += noise.height) {
      for (let x = 0; x < canvas.width; x += noise.width) {
        ctx.drawImage(noise, x, y);
      }
    }
    ctx.globalAlpha = 1;

    // ground line
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.moveTo(0, 360);
    ctx.lineTo(canvas.width, 360);
    ctx.stroke();

    ctx.save();
    ctx.translate(-cameraX, 0);

    for (const p of level.platforms) drawPlatform(p);
    for (const c of level.coins) if (!c.taken) drawCoin(c);
    for (const e of level.enemies) if (e.alive) drawEnemy(e);
    drawGoal(level.goal, level.goalFlag);
    drawPlayer(player);

    ctx.restore();

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "14px serif";
    ctx.fillText("R: Restart", 12, 22);
  }

  function drawPlatform(p) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = "rgba(0,0,0,0.14)";
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
  }

  function drawCoin(c) {
    const r = 10;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200,170,80,0.75)";
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.stroke();
  }

  function drawEnemy(e) {
    ctx.fillStyle = "rgba(120,80,55,0.78)";
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);

    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillRect(e.x + 9, e.y + 9, 4, 4);
    ctx.fillRect(e.x + 19, e.y + 9, 4, 4);
  }

  function drawGoal(pole, flag) {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(pole.x, pole.y, pole.w, pole.h);

    ctx.fillStyle = "rgba(180,70,70,0.75)";
    ctx.fillRect(flag.x, flag.y, flag.w, flag.h);

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.strokeRect(flag.x + 0.5, flag.y + 0.5, flag.w - 1, flag.h - 1);
  }

  // 赤ベース人間キャラ
  function drawPlayer(pl) {
    const now = performance.now();
    const moving = pl.onGround && Math.abs(pl.vx) > 20;
    const step = moving ? Math.sin(now / 90) * 2.2 : 0;

    const red1 = "rgba(185,55,55,0.92)";
    const red2 = "rgba(145,35,35,0.92)";
    const skin = "rgba(235,206,175,0.95)";
    const dark = "rgba(25,25,25,0.70)";
    const white = "rgba(255,255,255,0.75)";

    ctx.save();
    ctx.translate(pl.x + pl.w / 2, pl.y);
    ctx.scale(pl.facing || 1, 1);
    ctx.translate(-pl.w / 2, 0);

    const x = 0, y = 0;

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(x + 17, y + 44, 12, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = skin;
    ctx.fillRect(x + 11, y + 6, 12, 12);

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x + 15, y + 11, 2, 2);
    ctx.fillRect(x + 19, y + 11, 2, 2);

    ctx.fillStyle = "rgba(220,120,120,0.35)";
    ctx.fillRect(x + 14, y + 14, 2, 2);

    ctx.fillStyle = red1;
    ctx.fillRect(x + 10, y + 3, 14, 6);

    ctx.fillStyle = red2;
    ctx.fillRect(x + 9, y + 8, 8, 3);

    ctx.fillStyle = white;
    ctx.fillRect(x + 12, y + 4, 3, 2);

    ctx.fillStyle = red1;
    ctx.fillRect(x + 10, y + 18, 14, 12);

    ctx.fillStyle = red2;
    ctx.fillRect(x + 20, y + 18, 4, 12);

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x + 14, y + 22, 2, 2);

    ctx.fillStyle = red2;
    ctx.fillRect(x + 7, y + 20, 3, 9);
    ctx.fillRect(x + 24, y + 20, 3, 9);

    ctx.fillStyle = white;
    ctx.fillRect(x + 7, y + 28, 3, 3);
    ctx.fillRect(x + 24, y + 28, 3, 3);

    ctx.fillStyle = red2;
    ctx.fillRect(x + 12, y + 30, 4, 10 + step);
    ctx.fillRect(x + 18, y + 30, 4, 10 - step);

    ctx.fillStyle = dark;
    ctx.fillRect(x + 11, y + 40 + step, 6, 4);
    ctx.fillRect(x + 17, y + 40 - step, 6, 4);

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 10.5, y + 18.5, 13, 11);
    ctx.strokeRect(x + 11.5, y + 6.5, 11, 11);

    ctx.restore();
  }

  function showOverlay(title, text, kicker) {
    ovKicker.textContent = kicker || "Result";
    ovTitle.textContent = title;
    ovText.textContent = text;
    overlay.style.display = "flex";
  }
  function hideOverlay() { overlay.style.display = "none"; }

  function updateStatus() {
    statusEl.textContent =
      `Coins: ${collected} / ${totalCoins}   |   Enemies: ${defeated} / ${totalEnemies}`;
  }

  // start
  reset();
  requestAnimationFrame(loop);
})();