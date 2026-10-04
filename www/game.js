(function(){
  // --- CONFIG ---
  const W = window.innerWidth, H = window.innerHeight;
  const cvs = document.getElementById('c'), ctx = cvs.getContext('2d');
  cvs.width = W; cvs.height = H;
  const $ = id => document.getElementById(id);
  const flash = $('flash'), hudtxt = $('hudtxt'), hpfill = $('hpfill'), go = $('go'), gotxt = $('gotxt');
  const joy = $('joy'), stick = $('stick');
  
  // --- STATE ---
  let player = { x: W/2, y: H/2, hp: 100, maxHp: 100, fish: 0, arr: 0, expl: 0, score: 0, dir: 0, aimLock: false, aimAngle: 0, cool: 0 };
  let keys = { up:0, down:0, left:0, right:0, aim:0, boom:0, craft:0 };
  let bullets = [], enemies = [], drops = [], particles = [];
  let joyActive = false, joyId = null, joyStart = {x:0,y:0}, joyDelta = {x:0,y:0};
  let lastTap = 0, aimDouble = false;
  let hitFlash = 0, shake = 0;
  let spawnTimer = 0, autoShootTimer = 0;
  let gameOver = false;
  let playerImg = new Image(), enemyImg = new Image();
  let imgLoaded = false, enemyLoaded = false;
  
  // --- LOAD SPRITES ---
  playerImg.onload = () => imgLoaded = true;
  playerImg.onerror = () => imgLoaded = false;
  playerImg.src = 'player.png?v=' + Date.now();
  enemyImg.onload = () => enemyLoaded = true;
  enemyImg.onerror = () => enemyLoaded = false;
  enemyImg.src = 'enemies.png?v=' + Date.now();

  // --- UTILS ---
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function rand(a,b){ return Math.random()*(b-a)+a; }
  
  // --- DAMAGE ---
  function takeDamage(amount){
    if (hitFlash > 0 || gameOver) return;
    player.hp -= amount;
    hitFlash = 8;
    shake = 6;
    flash.style.opacity = '0.25';
    setTimeout(() => { flash.style.opacity = '0'; }, 90);
    if (navigator.vibrate) navigator.vibrate(40);
    if (player.hp <= 0) { player.hp = 0; gameOver = true; go.style.display = 'block'; gotxt.textContent = 'Score ' + player.score; }
  }

  // --- SPAWN ENEMIES ---
  function spawnEnemy(){
    if (enemies.length >= 8) return;
    let side = Math.floor(rand(0,4));
    let ex, ey;
    if (side === 0) { ex = rand(0,W); ey = -40; }
    else if (side === 1) { ex = W+40; ey = rand(0,H); }
    else if (side === 2) { ex = rand(0,W); ey = H+40; }
    else { ex = -40; ey = rand(0,H); }
    enemies.push({ x:ex, y:ey, hp:35, maxHp:35, type:Math.floor(rand(0,4)), speed:0.95, cool:0 });
  }

  // --- SHOOT ---
  function shoot(angle, isExplosive){
    if (isExplosive) {
      if (player.expl <= 0) return;
      player.expl--;
      bullets.push({ x:player.x, y:player.y, vx:Math.cos(angle)*5, vy:Math.sin(angle)*5, dmg:38, expl:true, life:80 });
    } else {
      bullets.push({ x:player.x, y:player.y, vx:Math.cos(angle)*7, vy:Math.sin(angle)*7, dmg:15, expl:false, life:60 });
    }
  }

  // --- COLLISIONS ---
  function updateBullets(){
    for (let i=bullets.length-1; i>=0; i--) {
      let b = bullets[i];
      b.x += b.vx; b.y += b.vy; b.life--;
      if (b.life <= 0 || b.x < -50 || b.x > W+50 || b.y < -50 || b.y > H+50) { bullets.splice(i,1); continue; }
      for (let j=enemies.length-1; j>=0; j--) {
        let e = enemies[j];
        if (dist(b,e) < 24) {
          if (b.expl) {
            for (let k=enemies.length-1; k>=0; k--) {
              if (dist(b, enemies[k]) < 95) { enemies[k].hp -= 38; if (enemies[k].hp <= 0) { enemies.splice(k,1); player.score += 10; } }
            }
            for (let p=0; p<8; p++) particles.push({ x:b.x, y:b.y, vx:rand(-3,3), vy:rand(-3,3), life:20, color:'#ff6600' });
            bullets.splice(i,1); break;
          } else {
            e.hp -= b.dmg;
            if (e.hp <= 0) { enemies.splice(j,1); player.score += 10; }
            bullets.splice(i,1); break;
          }
        }
      }
    }
  }

  function updateEnemies(){
    for (let i=enemies.length-1; i>=0; i--) {
      let e = enemies[i];
      let dx = player.x - e.x, dy = player.y - e.y;
      let d = Math.hypot(dx,dy);
      if (d > 0) { e.x += (dx/d)*e.speed; e.y += (dy/d)*e.speed; }
      if (d < 30) {
        if (e.cool <= 0) { takeDamage(7); e.cool = 38; }
      }
      if (e.cool > 0) e.cool--;
      if (e.hp <= 0) { enemies.splice(i,1); player.score += 10; }
    }
  }

  function updateDrops(){
    for (let i=drops.length-1; i>=0; i--) {
      let d = drops[i];
      if (dist(d, player) < 36) {
        player.fish += d.fish || 0;
        player.hp = Math.min(player.maxHp, player.hp + (d.hp || 0));
        drops.splice(i,1);
      }
    }
  }

  function updateParticles(){
    for (let i=particles.length-1; i>=0; i--) {
      let p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      if (p.life <= 0) particles.splice(i,1);
    }
  }

  // --- INPUT TOUCH ---
  joy.addEventListener('touchstart', e => {
    e.preventDefault(); joyActive = true; joyId = e.changedTouches[0].identifier;
    let r = joy.getBoundingClientRect();
    joyStart.x = r.left + r.width/2; joyStart.y = r.top + r.height/2;
    let t = e.changedTouches[0];
    joyDelta.x = t.clientX - joyStart.x; joyDelta.y = t.clientY - joyStart.y;
    updateStick();
  }, {passive:false});

  joy.addEventListener('touchmove', e => {
    e.preventDefault();
    for (let t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyDelta.x = t.clientX - joyStart.x; joyDelta.y = t.clientY - joyStart.y;
        updateStick();
      }
    }
  }, {passive:false});

  joy.addEventListener('touchend', e => {
    for (let t of e.changedTouches) {
      if (t.identifier === joyId) { joyActive = false; joyId = null; joyDelta.x = 0; joyDelta.y = 0; stick.style.transform = 'translate(-50%,-50%)'; }
    }
  }, {passive:false});

  function updateStick(){
    let mag = Math.hypot(joyDelta.x, joyDelta.y);
    let max = 45;
    if (mag > max) { joyDelta.x = (joyDelta.x/mag)*max; joyDelta.y = (joyDelta.y/mag)*max; }
    stick.style.transform = `translate(calc(-50% + ${joyDelta.x}px), calc(-50% + ${joyDelta.y}px))`;
  }

  // --- AIM & BOOM ---
  $('b_aim').addEventListener('touchstart', e => {
    e.preventDefault(); keys.aim = 1;
    let now = Date.now();
    if (now - lastTap < 300) { player.aimLock = !player.aimLock; }
    lastTap = now;
  }, {passive:false});
  $('b_aim').addEventListener('touchend', e => { e.preventDefault(); keys.aim = 0; }, {passive:false});

  $('b_boom').addEventListener('touchstart', e => {
    e.preventDefault(); keys.boom = 1;
    if (player.expl > 0) { shoot(player.aimAngle, true); }
  }, {passive:false});
  $('b_boom').addEventListener('touchend', e => { e.preventDefault(); keys.boom = 0; }, {passive:false});

  $('b_craft').addEventListener('touchstart', e => {
    e.preventDefault();
    if (player.fish >= 1 && player.arr >= 3) {
      player.fish -= 1; player.arr -= 3; player.expl += 1;
      player.hp = Math.min(player.maxHp, player.hp + 20);
    }
  }, {passive:false});

  // --- SCREEN TAP SHOOT ---
  cvs.addEventListener('touchstart', e => {
    e.preventDefault();
    let t = e.changedTouches[0];
    let tx = t.clientX, ty = t.clientY;
    if (tx > W/2 && ty > 100) {
      let angle = Math.atan2(ty - player.y, tx - player.x);
      player.aimAngle = angle;
      shoot(angle, false);
    }
  }, {passive:false});

  // --- RESET ---
  $('gobtn').addEventListener('click', () => {
    player.hp = 100; player.fish = 0; player.arr = 0; player.expl = 0; player.score = 0;
    bullets = []; enemies = []; drops = []; particles = [];
    gameOver = false; go.style.display = 'none'; hitFlash = 0; shake = 0;
  });

  // --- UPDATE LOOP ---
  function update(){
    if (gameOver) return;

    // Movement
    let dx = 0, dy = 0;
    if (joyActive) {
      let mag = Math.hypot(joyDelta.x, joyDelta.y);
      if (mag > 10) {
        dx = (joyDelta.x/mag) * 3.4;
        dy = (joyDelta.y/mag) * 3.4;
      }
    }
    if (dx === 0 && dy === 0) {
      if (keys.left) dx -= 3.4; if (keys.right) dx += 3.4;
      if (keys.up) dy -= 3.4; if (keys.down) dy += 3.4;
    }
    player.x = clamp(player.x + dx, 24, W-24);
    player.y = clamp(player.y + dy, 44, H-24);
    if (dx !== 0 || dy !== 0) player.dir = Math.atan2(dy, dx);

    // Aim
    if (keys.aim || player.aimLock) {
      let mag = Math.hypot(joyDelta.x, joyDelta.y);
      if (mag > 10) player.aimAngle = Math.atan2(joyDelta.y, joyDelta.x);
      else if (player.aimLock) player.aimAngle = player.dir;
    } else {
      player.aimAngle = player.dir;
    }

    // Auto-shoot
    autoShootTimer++;
    if (autoShootTimer > 130/16) {
      autoShootTimer = 0;
      if ((dx !== 0 || dy !== 0) && Math.random() < 0.12) shoot(player.aimAngle, false);
    }

    // Spawn
    spawnTimer++;
    if (spawnTimer > 60 && enemies.length < 8) { spawnTimer = 0; spawnEnemy(); }

    // Cooldowns
    if (hitFlash > 0) hitFlash--;
    if (shake > 0) shake *= 0.9;
    if (player.cool > 0) player.cool--;

    updateBullets(); updateEnemies(); updateDrops(); updateParticles();

    // Drops
    if (Math.random() < 0.002) drops.push({ x:rand(50,W-50), y:rand(50,H-50), fish:1, hp:15 });

    // HUD
    hpfill.style.width = (player.hp/player.maxHp*100) + '%';
    hudtxt.textContent = `HP ${Math.floor(player.hp)} | FISH ${player.fish} ARR ${player.arr} EXPL ${player.expl} SCORE ${player.score} ${player.aimLock ? '[AIM LOCK]' : ''}`;
  }

  // --- DRAW ---
  function draw(){
    ctx.fillStyle = '#131326';
    ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = '#1c1c35';
    ctx.lineWidth = 1;
    for (let i=0; i<W; i+=40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke(); }
    for (let j=0; j<H; j+=40) { ctx.beginPath(); ctx.moveTo(0,j); ctx.lineTo(W,j); ctx.stroke(); }

    let sx = 0, sy = 0;
    if (shake > 0.5) { sx = rand(-shake, shake); sy = rand(-shake, shake); }
    ctx.save();
    ctx.translate(sx, sy);

    // Draw player
    if (imgLoaded) {
      let frame = Math.floor(Date.now()/200)%4;
      ctx.drawImage(playerImg, frame*48, 0, 48, 48, player.x-24, player.y-24, 48, 48);
    } else {
      ctx.fillStyle = '#4af';
      ctx.fillRect(player.x-24, player.y-24, 48, 48);
    }

    // Draw enemies
    for (let e of enemies) {
      if (enemyLoaded) {
        let col = e.type % 4;
        ctx.drawImage(enemyImg, col*40, 0, 40, 40, e.x-20, e.y-20, 40, 40);
      } else {
        ctx.fillStyle = '#f44';
        ctx.fillRect(e.x-20, e.y-20, 40, 40);
      }
      // Enemy HP bar
      ctx.fillStyle = '#333';
      ctx.fillRect(e.x-20, e.y-28, 40, 4);
      ctx.fillStyle = '#0f0';
      ctx.fillRect(e.x-20, e.y-28, 40*(e.hp/e.maxHp), 4);
    }

    // Bullets
    for (let b of bullets) {
      ctx.fillStyle = b.expl ? '#ff6600' : '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.expl ? 6 : 3, 0, Math.PI*2); ctx.fill();
    }

    // Drops
    for (let d of drops) {
      ctx.fillStyle = '#0ff';
      ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, Math.PI*2); ctx.fill();
    }

    // Aim line
    if ((keys.aim || player.aimLock) && player.aimAngle !== undefined) {
      ctx.save();
      ctx.setLineDash([4,4]);
      ctx.strokeStyle = player.aimLock ? '#ff69b4' : '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + Math.cos(player.aimAngle)*90, player.y + Math.sin(player.aimAngle)*90);
      ctx.stroke();
      ctx.restore();
    }

    // Particles
    for (let p of particles) {
      ctx.globalAlpha = p.life/20;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x-2, p.y-2, 4, 4);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // --- LOOP ---
  function loop(){
    update();
    draw();
    requestAnimationFrame(loop);
  }
  loop();

  // Prevent context menu
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('touchmove', e => e.preventDefault(), {passive:false});
})();