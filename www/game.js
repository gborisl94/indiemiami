(function(){
  // ============ SETUP ============
  const cvs = document.getElementById('c'), ctx = cvs.getContext('2d');
  const flash = document.getElementById('flash'), hudtxt = document.getElementById('hudtxt');
  const hpfill = document.getElementById('hpfill'), go = document.getElementById('go'), gotxt = document.getElementById('gotxt');
  const joyL = document.getElementById('joyL'), stickL = document.getElementById('stickL');
  const joyR = document.getElementById('joyR'), stickR = document.getElementById('stickR');

  let W = window.innerWidth, H = window.innerHeight;
  function resize(){ W = window.innerWidth; H = window.innerHeight; cvs.width = W; cvs.height = H; }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ============ STATE ============
  const player = { x: W/2, y: H/2, hp: 100, maxHp: 100, fish: 0, arr: 0, expl: 0, score: 0,
                   dir: 0, aimAngle: 0, cool: 0, lastRegen: 0 };
  const keys = { fire: 0 };
  let bullets = [], enemies = [], drops = [], particles = [], floaters = [], trails = [];
  let gameOver = false, hitFlash = 0, shake = 0;
  let spawnTimer = 0, autoShootTimer = 0;

  // ============ JOYSTICKS ============
  function makeJoy(el, stick, onMove, onEnd){
    let active = false, id = null, cx = 0, cy = 0, dx = 0, dy = 0;
    const R = 46;
    function start(e){ e.preventDefault(); const t = e.changedTouches[0]; active=true; id=t.identifier;
      const r = el.getBoundingClientRect(); cx=r.left+r.width/2; cy=r.top+r.height/2;
      dx=t.clientX-cx; dy=t.clientY-cy; update(); }
    function move(e){ e.preventDefault(); for (const t of e.changedTouches) if (t.identifier===id){ dx=t.clientX-cx; dy=t.clientY-cy; update(); } }
    function end(e){ for (const t of e.changedTouches) if (t.identifier===id){ active=false; id=null; dx=0; dy=0;
      stick.style.transform='translate(-50%,-50%)'; onEnd(); } }
    function update(){ const m=Math.hypot(dx,dy); if (m>R){ dx=dx/m*R; dy=dy/m*R; }
      stick.style.transform=`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; onMove(dx,dy,m); }
    el.addEventListener('touchstart', start, {passive:false});
    el.addEventListener('touchmove', move, {passive:false});
    el.addEventListener('touchend', end, {passive:false});
    el.addEventListener('touchcancel', end, {passive:false});
    return { get dx(){return dx;}, get dy(){return dy;}, get mag(){return Math.hypot(dx,dy);} };
  }

  let moveVec = { x:0, y:0 };
  const joyLState = makeJoy(joyL, stickL, (dx,dy,m)=>{ moveVec.x = m>12?dx/m:0; moveVec.y = m>12?dy/m:0; }, ()=>{ moveVec.x=0; moveVec.y=0; });
  const joyRState = makeJoy(joyR, stickR, (dx,dy,m)=>{ if (m>12){ player.aimAngle = Math.atan2(dy,dx); } }, ()=>{});

  // ============ BUTTONS ============
  function bindBtn(id, onDown, onUp){
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e=>{e.preventDefault();onDown();},{passive:false});
    el.addEventListener('touchend', e=>{e.preventDefault(); if(onUp)onUp();},{passive:false});
    el.addEventListener('touchcancel', e=>{e.preventDefault(); if(onUp)onUp();},{passive:false});
  }
  bindBtn('b_fire', ()=>keys.fire=1, ()=>keys.fire=0);
  bindBtn('b_boom', ()=>{ if (player.expl>0) shoot(player.aimAngle, true); });
  bindBtn('b_craft', ()=>{
    if (player.fish>=1 && player.arr>=3){ player.fish-=1; player.arr-=3; player.expl+=1; player.hp=Math.min(player.maxHp, player.hp+20); }
  });

  window.addEventListener('keydown', e=>{
    if (e.code==='Space') keys.fire=1;
    if (e.code==='KeyE' && player.expl>0) shoot(player.aimAngle, true);
    if (e.code==='KeyC' && player.fish>=1 && player.arr>=3){ player.fish-=1; player.arr-=3; player.expl+=1; player.hp=Math.min(player.maxHp, player.hp+20); }
  });
  window.addEventListener('keyup', e=>{ if (e.code==='Space') keys.fire=0; });

  // ============ IMAGES ============
  const playerImg = new Image(), enemyImg = new Image();
  let imgLoaded = false, enemyLoaded = false;
  playerImg.onload = ()=>imgLoaded=true; playerImg.onerror = ()=>imgLoaded=false;
  playerImg.src = 'player.png?v=' + Date.now();
  enemyImg.onload = ()=>enemyLoaded=true; enemyImg.onerror = ()=>enemyLoaded=false;
  enemyImg.src = 'enemies.png?v=' + Date.now();

  // ============ HELPERS ============
  const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const rand = (a,b) => Math.random()*(b-a)+a;

  function addFloater(x, y, text, color){
    floaters.push({ x, y, text, color, life: 40 });
  }

  // ============ DAMAGE ============
  function takeDamage(amount){
    if (hitFlash > 0 || gameOver) return;
    player.hp -= amount;
    hitFlash = 8; shake = 6;
    flash.style.opacity = '0.25';
    setTimeout(()=>{ flash.style.opacity = '0'; }, 90);
    if (navigator.vibrate) navigator.vibrate(40);
    addFloater(player.x, player.y - 30, '-' + amount, '#ff4444');
    if (player.hp <= 0){ player.hp=0; gameOver=true; go.style.display='flex'; gotxt.textContent='Score '+player.score; }
  }

  // ============ SPAWN ============
  function spawnEnemy(){
    if (enemies.length >= 8) return;
    const side = Math.floor(rand(0,4));
    let ex, ey;
    if (side===0){ ex=rand(0,W); ey=-40; }
    else if (side===1){ ex=W+40; ey=rand(0,H); }
    else if (side===2){ ex=rand(0,W); ey=H+40; }
    else { ex=-40; ey=rand(0,H); }
    enemies.push({ x:ex, y:ey, hp:35, maxHp:35, type:Math.floor(rand(0,4)), speed:0.7, cool:0,
                   hitFlash: 0, knockX: 0, knockY: 0 });
  }

  // ============ SHOOT ============
  function shoot(angle, isExplosive){
    if (isExplosive){
      if (player.expl <= 0) return;
      player.expl--;
      bullets.push({ x:player.x, y:player.y, vx:Math.cos(angle)*5, vy:Math.sin(angle)*5, dmg:38, expl:true, life:80 });
    } else {
      bullets.push({ x:player.x, y:player.y, vx:Math.cos(angle)*7, vy:Math.sin(angle)*7, dmg:15, expl:false, life:60 });
    }
  }

  // ============ UPDATE BULLETS ============
  function updateBullets(){
    for (let i=bullets.length-1; i>=0; i--){
      const b = bullets[i];
      const prevX = b.x, prevY = b.y;
      b.x += b.vx; b.y += b.vy; b.life--;

      // Traînée de flèche
      if (!b.expl) trails.push({ x1: prevX, y1: prevY, x2: b.x, y2: b.y, life: 8 });

      if (b.life<=0 || b.x<-50 || b.x>W+50 || b.y<-50 || b.y>H+50){ bullets.splice(i,1); continue; }

      for (let j=enemies.length-1; j>=0; j--){
        const e = enemies[j];
        if (dist(b,e) < 24){
          if (b.expl){
            // Explosion : dégâts de zone + particules
            for (let k=enemies.length-1; k>=0; k--){
              if (dist(b, enemies[k]) < 95){
                enemies[k].hp -= 38;
                enemies[k].hitFlash = 6;
                if (enemies[k].hp<=0){ enemies.splice(k,1); player.score+=10; }
              }
            }
            for (let p=0; p<15; p++) particles.push({
              x:b.x, y:b.y,
              vx:rand(-4,4), vy:rand(-4,4),
              life:25, color: p%2 ? '#ff6600' : '#ffcc00'
            });
            bullets.splice(i,1); break;
          } else {
            e.hp -= b.dmg;
            e.hitFlash = 3;
            // Knockback
            const d = Math.hypot(b.vx, b.vy);
            if (d > 0){ e.knockX = (b.vx/d)*4; e.knockY = (b.vy/d)*4; }
            addFloater(e.x, e.y - 25, '-' + b.dmg, '#ffcc44');
            for (let p=0; p<4; p++) particles.push({
              x:b.x, y:b.y, vx:rand(-2,2), vy:rand(-2,2), life:15, color:'#ffaa00'
            });
            if (e.hp<=0){ enemies.splice(j,1); player.score+=10; }
            bullets.splice(i,1); break;
          }
        }
      }
    }
  }

  // ============ UPDATE ENEMIES ============
  function updateEnemies(){
    for (let i=enemies.length-1; i>=0; i--){
      const e = enemies[i];
      // Knockback
      e.x += e.knockX; e.y += e.knockY;
      e.knockX *= 0.7; e.knockY *= 0.7;

      const dx = player.x-e.x, dy = player.y-e.y;
      const d = Math.hypot(dx,dy);
      if (d>0){ e.x += (dx/d)*e.speed; e.y += (dy/d)*e.speed; }
      if (d < 22 && e.cool <= 0){ takeDamage(4); e.cool = 70; }
      if (e.cool > 0) e.cool--;
      if (e.hitFlash > 0) e.hitFlash--;
      if (e.hp<=0){ enemies.splice(i,1); player.score+=10; }
    }
  }

  // ============ UPDATE DROPS ============
  function updateDrops(){
    for (let i=drops.length-1; i>=0; i--){
      const d = drops[i];
      if (dist(d, player) < 36){
        player.fish += d.fish || 0;
        player.hp = Math.min(player.maxHp, player.hp + (d.hp||0)*2);
        addFloater(player.x, player.y - 30, '+' + ((d.hp||0)*2) + 'HP', '#00ff88');
        drops.splice(i,1);
      }
    }
  }

  // ============ UPDATE PARTICLES / FLOATERS / TRAILS ============
  function updateParticles(){
    for (let i=particles.length-1; i>=0; i--){
      const p = particles[i]; p.x+=p.vx; p.y+=p.vy; p.life--;
      if (p.life<=0) particles.splice(i,1);
    }
    for (let i=floaters.length-1; i>=0; i--){
      const f = floaters[i]; f.y -= 0.8; f.life--;
      if (f.life<=0) floaters.splice(i,1);
    }
    for (let i=trails.length-1; i>=0; i--){
      trails[i].life--;
      if (trails[i].life<=0) trails.splice(i,1);
    }
  }

  // ============ UPDATE ============
  function update(){
    if (gameOver) return;

    // Régén passive
    const nowSec = Math.floor(Date.now()/2000);
    if (nowSec !== player.lastRegen){
      player.lastRegen = nowSec;
      player.hp = Math.min(player.maxHp, player.hp + 1);
    }

    // Déplacement
    const SPEED = 1.66;
    const dx = moveVec.x*SPEED, dy = moveVec.y*SPEED;
    player.x = clamp(player.x+dx, 24, W-24);
    player.y = clamp(player.y+dy, 44, H-24);
    if (dx!==0 || dy!==0) player.dir = Math.atan2(dy,dx);

    // Tir
    if (player.cool > 0) player.cool--;
    if (keys.fire && player.cool <= 0){ shoot(player.aimAngle, false); player.cool = 12; }

    autoShootTimer++;
    if (autoShootTimer > 8){
      autoShootTimer = 0;
      if ((dx!==0 || dy!==0) && Math.random() < 0.12) shoot(player.aimAngle, false);
    }

    // Spawn
    spawnTimer++;
    if (spawnTimer > 60 && enemies.length < 8){ spawnTimer = 0; spawnEnemy(); }

    if (hitFlash > 0) hitFlash--;
    if (shake > 0.5) shake *= 0.9; else shake = 0;

    updateBullets(); updateEnemies(); updateDrops(); updateParticles();

    if (Math.random() < 0.005) drops.push({ x:rand(50,W-50), y:rand(50,H-50), fish:1, hp:15 });

    // HUD
    const hpPct = player.hp/player.maxHp;
    hpfill.style.width = (hpPct*100)+'%';
    hpfill.style.background = hpPct>0.5?'#0d0':hpPct>0.25?'#dd0':'#d22';
    hudtxt.textContent = `HP ${Math.floor(player.hp)} | FISH ${player.fish} ARR ${player.arr} EXPL ${player.expl} SCORE ${player.score}`;
  }

  // ============ DRAW PLAYER ============
  function drawPlayer(){
    // Ombre
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(player.x, player.y+22, 18, 6, 0, 0, Math.PI*2); ctx.fill();

    if (imgLoaded){
      const a = player.aimAngle;
      let frame = 0;
      if (a > -Math.PI/4 && a <= Math.PI/4) frame = 0;
      else if (a > Math.PI/4 && a <= 3*Math.PI/4) frame = 1;
      else if (a > 3*Math.PI/4 || a <= -3*Math.PI/4) frame = 2;
      else frame = 3;
      ctx.drawImage(playerImg, frame*48, 0, 48, 48, player.x-24, player.y-24, 48, 48);
    } else {
      ctx.fillStyle = '#4af';
      ctx.beginPath(); ctx.arc(player.x, player.y, 24, 0, Math.PI*2); ctx.fill();
    }
  }

  // ============ DRAW ============
  function draw(){
    ctx.fillStyle = '#131326'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = '#1c1c35'; ctx.lineWidth = 1;
    for (let i=0; i<W; i+=40){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke(); }
    for (let j=0; j<H; j+=40){ ctx.beginPath(); ctx.moveTo(0,j); ctx.lineTo(W,j); ctx.stroke(); }

    let sx = 0, sy = 0;
    if (shake > 0.5){ sx = rand(-shake, shake); sy = rand(-shake, shake); }
    ctx.save();
    ctx.translate(sx, sy);

    // Ombres ennemis
    for (const e of enemies){
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y+18, 16, 5, 0, 0, Math.PI*2); ctx.fill();
    }

    // Ennemis
    for (const e of enemies){
      if (e.hitFlash > 0){
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(e.x, e.y, 22, 0, Math.PI*2); ctx.fill();
      } else if (enemyLoaded){
        const col = e.type%4;
        ctx.drawImage(enemyImg, col*44, 0, 44, 44, e.x-22, e.y-22, 44, 44);
      } else {
        ctx.fillStyle = '#f44';
        ctx.beginPath(); ctx.arc(e.x, e.y, 22, 0, Math.PI*2); ctx.fill();
      }
      // Barre de vie ennemie
      ctx.fillStyle = '#333'; ctx.fillRect(e.x-20, e.y-30, 40, 4);
      ctx.fillStyle = '#0f0'; ctx.fillRect(e.x-20, e.y-30, 40*(e.hp/e.maxHp), 4);
    }

    drawPlayer();

    // Traînées de flèches
    for (const t of trails){
      ctx.globalAlpha = t.life/8;
      ctx.strokeStyle = '#ffffaa';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Ligne de visée
    if (joyRState.mag > 12){
      ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle = '#ff69b4'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + Math.cos(player.aimAngle)*90, player.y + Math.sin(player.aimAngle)*90);
      ctx.stroke(); ctx.restore();
    }

    // Balles
    for (const b of bullets){
      ctx.fillStyle = b.expl ? '#ff6600' : '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.expl ? 6 : 3, 0, Math.PI*2); ctx.fill();
      if (b.expl){
        ctx.strokeStyle = 'rgba(255,150,0,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, 9, 0, Math.PI*2); ctx.stroke();
      }
    }

    // Drops
    for (const d of drops){
      ctx.fillStyle = '#0ff'; ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,255,255,0.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(d.x, d.y, 9 + Math.sin(Date.now()/200)*2, 0, Math.PI*2); ctx.stroke();
    }

    // Particules
    for (const p of particles){
      ctx.globalAlpha = p.life/25;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x-2, p.y-2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // Dégâts flottants
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    for (const f of floaters){
      ctx.globalAlpha = Math.min(1, f.life/20);
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, f.x+1, f.y+1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    ctx.restore();
  }

  // ============ LOOP ============
  function loop(){
    try { update(); draw(); }
    catch(err){
      ctx.fillStyle = 'rgba(180,0,0,0.85)'; ctx.fillRect(0, 0, W, 20);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
      ctx.fillText('ERR ' + err.message, 6, 14);
    }
    requestAnimationFrame(loop);
  }
  loop();

  // ============ RESTART ============
  document.getElementById('gobtn').addEventListener('click', () => {
    player.hp=100; player.fish=0; player.arr=0; player.expl=0; player.score=0;
    player.x=W/2; player.y=H/2; player.lastRegen=0;
    bullets=[]; enemies=[]; drops=[]; particles=[]; floaters=[]; trails=[];
    gameOver=false; go.style.display='none'; hitFlash=0; shake=0;
  });

  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('touchmove', e => e.preventDefault(), {passive:false});
  document.addEventListener('gesturestart', e => e.preventDefault());
})();