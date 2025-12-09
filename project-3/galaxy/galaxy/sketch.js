// ===========================================================
// Citation Galaxy + Planet Landing View (full version, with surfaces)
// ===========================================================

// ---------- tunables ----------
const MAX_STEP = 8;
const ERA_DURATION = 240;
const ARRIVAL_SPEED = 0.005;
const ORBIT_SPEED_MIN = 0.0004;
const ORBIT_SPEED_MAX = 0.0015;
const SPAWN_DELAY_MIN = 40;
const SPAWN_DELAY_MAX = 260;
const TRAIL_MAX_POINTS = 60;
const HOVER_DISTANCE = 50;
const SYSTEM_SPIN_SPEED = 0.00015;
const CENTER_CLICK_RADIUS = 50;
const FADE_SPEED = 15;

// 视图：星系 or 星球
let viewMode = "galaxy";         // "galaxy" | "planet"
let landedPlanet = null;         // 当前降落的行星对象
let landedFromGalaxy = null;     // 从哪个星系点进来的

// csv
let papersTable;
let edgesTable;

// 数据
let papersById = {};             // id -> paperObj
let childrenMap = {};            // id -> [childPaperObj...]

// 星系
let mainGalaxy = null;
let currentGalaxy = null;

// 动画
let fadeAlpha = 0;

// 交互
let hoverPlanet = null;
let hoverDist = Infinity;

// 背景星野
let starfieldFar = [];
let starfieldNear = [];

// -----------------------------------------------------------
// preload
// -----------------------------------------------------------
function preload(){
  // 需要放在同一目录下
  papersTable = loadTable("papers.csv","csv","header");
  edgesTable  = loadTable("edges.csv","csv","header");
}

// -----------------------------------------------------------
// setup
// -----------------------------------------------------------
function setup(){
  createCanvas(windowWidth, windowHeight);
  angleMode(RADIANS);
  textFont("Arial");
  smooth();

  buildStarfield();
  parsePapers();
  buildChildrenMap();

  mainGalaxy = buildMainGalaxy();
  currentGalaxy = mainGalaxy;
  updateHUDCoreLabel(currentGalaxy.coreLabel);
}

// -----------------------------------------------------------
// resize
// -----------------------------------------------------------
function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  buildStarfield();
  if (mainGalaxy) refreshGalaxyLayout(mainGalaxy);
  if (currentGalaxy && currentGalaxy !== mainGalaxy) refreshGalaxyLayout(currentGalaxy);
}

// -----------------------------------------------------------
// draw
// -----------------------------------------------------------
function draw(){
  background(0);
  drawStarfield();

  if (viewMode === "galaxy") {
    drawGalaxyView();
  } else if (viewMode === "planet") {
    drawPlanetView(landedPlanet);
  }

  if (fadeAlpha > 0){
    noStroke();
    fill(0,0,0, fadeAlpha);
    rect(0,0,width,height);
    fadeAlpha = max(fadeAlpha - FADE_SPEED, 0);
  }
}

// -----------------------------------------------------------
// Galaxy 视图
// -----------------------------------------------------------
function drawGalaxyView(){
  const cx = width/2;
  const cy = height/2;

  if (currentGalaxy){
    advanceEra(currentGalaxy);
    updatePlanets(currentGalaxy);

    const sysRot = frameCount * SYSTEM_SPIN_SPEED;
    updateHUDCoreLabel(currentGalaxy.coreLabel);

    drawCore(cx, cy, currentGalaxy.coreLabel);
    drawTrails(currentGalaxy, sysRot, cx, cy);
    drawPlanetsAndRecordScreenPos(currentGalaxy, sysRot, cx, cy);

    resolveHover(currentGalaxy);
    drawTooltip();
  }
}

// -----------------------------------------------------------
// Planet 视图
// -----------------------------------------------------------
function drawPlanetView(p){
  if (!p){
    viewMode = "galaxy";
    return;
  }

  // 天空渐变
  for (let y=0; y<height*0.55; y++){
    const t = y / (height*0.55);
    const c = lerpColor(color(3,5,12), color(0), t);
    stroke(c);
    line(0,y,width,y);
  }

  // 天空里的其他星体（其实是别的论文，缩小转圈）
  if (landedFromGalaxy){
    const sysRot = frameCount * 0.0009;
    const cx = width * 0.5;
    const cy = height * 0.28;
    for (let op of landedFromGalaxy.planets){
      if (op === p) continue;
      if (op.birthStep > landedFromGalaxy.currentStep) continue;
      if (op.phase === "waiting") continue;
      const ang = op.curAng + sysRot;
      const r   = op.curR * 0.33;
      const px  = cx + cos(ang)*r;
      const py  = cy + sin(ang)*r;
      noStroke();
      fill(op.colorRGB[0], op.colorRGB[1], op.colorRGB[2], 180);
      circle(px, py, 4.5);
    }
  }

  // 星球本体
  drawCurvedPlanetSurface(p);

  // 标题
  fill(255);
  textAlign(LEFT, TOP);
  textSize(14);
  text(p.title || p.paperId, 16, 14, width-32, 60);

  // 提示
  fill(200,200,200,160);
  textSize(12);
  text("点击上半部分天空返回星系 / click sky to return", 16, 70);

  // 如果有 children，给一个按钮
  if (p.hasChildren){
    const bx = width - 190;
    const by = 16;
    const bw = 174;
    const bh = 30;
    const hovered = (mouseX>bx && mouseX<bx+bw && mouseY>by && mouseY<by+bh);
    noStroke();
    fill(hovered? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.25)");
    rect(bx, by, bw, bh, 6);
    stroke(255,120);
    noFill();
    rect(bx, by, bw, bh, 6);
    noStroke();
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(11);
    text("open its citation galaxy →", bx + bw/2, by + bh/2);
  }
}

// -----------------------------------------------------------
// 底部半圆星球（根据学科切换表面）
// -----------------------------------------------------------
function drawCurvedPlanetSurface(p){
  const disc = (p.disciplineRaw || "").toLowerCase();

  // 星球顶端放在 2/3 高度
  const horizonY = height * 0.66;
  // 星球半径控制在底部 1/3 范围内
  const maxRByHeight = (height - horizonY) * 1.25;
  const maxRByWidth  = width * 0.55;
  const planetR = min(maxRByHeight, maxRByWidth);
  const cx = width / 2;
  const cy = horizonY + planetR;

  if (
    disc.includes("theory") ||
    disc.includes("philosophy") ||
    disc.includes("critical")
  ){
    drawMirrorPlanet(cx, cy, planetR);
  } else if (disc.includes("media")){
    drawIcyPlanet(cx, cy, planetR);
  } else if (
    disc.includes("sociology") ||
    disc.includes("social") ||
    disc.includes("culture") ||
    disc.includes("political")
  ){
    drawDustyPlanet(cx, cy, planetR);
  } else if (disc.includes("art")){
    drawArtPlanet(cx, cy, planetR);
  } else {
    drawGenericCraterPlanet(cx, cy, planetR);
  }
}

// 1. 哲学 / 理论：光滑镜面
function drawMirrorPlanet(cx, cy, r){
  const layers = 70;
  for (let i=0; i<layers; i++){
    const t = i / (layers-1);
    const c = lerpColor(color(235), color(80), t*1.1);
    noStroke();
    fill(c);
    arc(cx, cy, r*2*(1 - t*0.05), r*2*(1 - t*0.05), PI, TWO_PI);
  }
  // 一道高光
  noStroke();
  fill(200,220,255,90);
  arc(cx - r*0.15, cy - r*0.15, r*1.2, r*0.85, PI, TWO_PI);
}

// 2. media：冰壳 + 少量浅坑
function drawIcyPlanet(cx, cy, r){
  const layers = 75;
  for (let i=0; i<layers; i++){
    const t = i / (layers-1);
    const base = lerpColor(color(135,175,240), color(20,35,55), t*1.05);
    noStroke();
    fill(base);
    arc(cx, cy, r*2*(1 - t*0.04), r*2*(1 - t*0.04), PI, TWO_PI);
  }
  // 冷高光
  noStroke();
  fill(210,240,255,55);
  arc(cx - r*0.1, cy - r*0.05, r*1.05, r*0.7, PI, TWO_PI);

  // 浅坑
  const rng = makeRNG("media"+(landedPlanet ? landedPlanet.paperId : ""));
  for (let i=0; i<6; i++){
    const ang = PI + rng()*PI;
    const rr  = r * (0.15 + rng()*0.6);
    const x   = cx + cos(ang)*rr;
    const y   = cy + sin(ang)*rr;
    drawCrater(x, y, 18 + rng()*24, color(120,150,190));
  }
}

// 3. 社会 / 文化：沙丘感
function drawDustyPlanet(cx, cy, r){
  const layers = 65;
  for (let i=0; i<layers; i++){
    const t = i / (layers-1);
    const base = lerpColor(color(230,205,140), color(120,90,50), t*1.2);
    noStroke();
    fill(base);
    arc(cx, cy, r*2*(1 - t*0.045), r*2*(1 - t*0.045), PI, TWO_PI);
  }
  // 沙丘条纹
  stroke(255, 240, 210, 50);
  strokeWeight(2);
  noFill();
  for (let k=0; k<4; k++){
    const off = k*0.08;
    arc(cx - r*0.1, cy + r*0.05, r*1.8, r*1.15, PI+off, TWO_PI-off);
  }
  // 少量坑
  const rng = makeRNG("soc"+(landedPlanet ? landedPlanet.paperId : ""));
  for (let i=0; i<5; i++){
    const ang = PI + rng()*PI;
    const rr  = r * (0.2 + rng()*0.55);
    const x   = cx + cos(ang)*rr;
    const y   = cy + sin(ang)*rr;
    drawCrater(x, y, 20 + rng()*30, color(140,110,70));
  }
}

// 4. art：颜色更饱和，坑有装饰感
function drawArtPlanet(cx, cy, r){
  const layers = 70;
  for (let i=0; i<layers; i++){
    const t = i / (layers-1);
    const base = lerpColor(color(255,150,210), color(120,40,80), t*1.1);
    noStroke();
    fill(base);
    arc(cx, cy, r*2*(1 - t*0.04), r*2*(1 - t*0.04), PI, TWO_PI);
  }
  const rng = makeRNG("art"+(landedPlanet ? landedPlanet.paperId : ""));
  for (let i=0; i<7; i++){
    const ang = PI + rng()*PI;
    const rr  = r * (0.18 + rng()*0.6);
    const x   = cx + cos(ang)*rr;
    const y   = cy + sin(ang)*rr;
    // 装饰圈
    noFill();
    stroke(255,180,230,180);
    strokeWeight(1.2);
    ellipse(x, y, 26, 18);
    // 坑
    drawCrater(x, y, 18 + rng()*20, color(140,60,110));
  }
}

// 5. 默认：普通陨石坑
function drawGenericCraterPlanet(cx, cy, r){
  const layers = 70;
  for (let i=0; i<layers; i++){
    const t = i / (layers-1);
    const base = lerpColor(color(185), color(35), t*1.05);
    noStroke();
    fill(base);
    arc(cx, cy, r*2*(1 - t*0.04), r*2*(1 - t*0.04), PI, TWO_PI);
  }
  const rng = makeRNG("generic"+(landedPlanet ? landedPlanet.paperId : ""));
  for (let i=0; i<10; i++){
    const ang = PI + rng()*PI;
    const rr  = r * (0.15 + rng()*0.65);
    const x   = cx + cos(ang)*rr;
    const y   = cy + sin(ang)*rr;
    drawCrater(x, y, 22 + rng()*36, color(90));
  }
}

// 陨石坑
function drawCrater(x, y, r, craterCol){
  // 外圈阴影
  noStroke();
  fill(0,0,0,70);
  ellipse(x + r*0.18, y + r*0.24, r*1.35, r*0.9);

  // 主坑
  const steps = 22;
  for (let i=0; i<steps; i++){
    const t = i / (steps-1);
    const rr = r * lerp(1.0, 0.35, t);
    const shade = lerpColor(craterCol, color(40), t*0.95);
    fill(shade);
    ellipse(x, y, rr*2, rr*1.35);
  }

  // 高光
  noFill();
  stroke(255, 240, 230, 110);
  strokeWeight(1);
  ellipse(x - r*0.12, y - r*0.14, r*1.05, r*0.58);
}

// -----------------------------------------------------------
// 字符串 → 确定性随机
// -----------------------------------------------------------
function makeRNG(str){
  let h = 0;
  for (let i=0; i<str.length; i++){
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return function(){
    h = (h * 1664525 + 1013904223) >>> 0;
    return (h >>> 0) / 4294967296;
  };
}

// -----------------------------------------------------------
// HUD label
// -----------------------------------------------------------
function updateHUDCoreLabel(txt){
  const hudEl = document.getElementById("coreLabel");
  if (hudEl){
    hudEl.textContent = shortenCoreLabel(txt);
  }
}

function shortenCoreLabel(t){
  const MAX_CHARS = 60;
  if (!t) return "";
  if (t.length <= MAX_CHARS) return t;
  return t.slice(0, MAX_CHARS-3) + "...";
}

// -----------------------------------------------------------
// 星野背景
// -----------------------------------------------------------
function buildStarfield(){
  starfieldFar = [];
  starfieldNear = [];

  for (let i=0; i<1200; i++){
    starfieldFar.push({
      x: random(width),
      y: random(height),
      a: random(20,60),
      r: random(0.5,1.2)
    });
  }
  for (let i=0; i<400; i++){
    starfieldNear.push({
      x: random(width),
      y: random(height),
      a: random(120,220),
      r: random(1,2.2)
    });
  }
}

function drawStarfield(){
  noStroke();
  for (let s of starfieldFar){
    fill(255,255,255,s.a);
    circle(s.x, s.y, s.r);
  }
  for (let s of starfieldNear){
    fill(255,255,255,s.a);
    circle(s.x, s.y, s.r);
  }
}

// -----------------------------------------------------------
// CSV 解析
// -----------------------------------------------------------
function parsePapers(){
  papersById = {};
  for (let r=0; r<papersTable.getRowCount(); r++){
    const pid        = papersTable.getString(r,"id");
    const title      = papersTable.getString(r,"title");
    const rawYear    = papersTable.getString(r,"Year");
    const disc       = papersTable.getString(r,"discipline");
    const morphRaw   = papersTable.getString(r,"morphType");

    const y = parseYear(rawYear);
    if (isNaN(y)) continue;

    papersById[pid] = {
      id: pid,
      title: title,
      year: y,
      disciplineRaw: disc,
      morphType: morphRaw ? int(morphRaw) : 1
    };
  }
}

function buildChildrenMap(){
  childrenMap = {};
  for (let r=0; r<edgesTable.getRowCount(); r++){
    const citedID  = edgesTable.getString(r,"cited_id");
    const citingID = edgesTable.getString(r,"citing_id");
    if (!citedID || !citingID) continue;

    const citedPaper  = papersById[citedID];
    const citingPaper = papersById[citingID];
    if (!citedPaper || !citingPaper) continue;

    if (!childrenMap[citedID]){
      childrenMap[citedID] = [];
    }
    childrenMap[citedID].push(citingPaper);
  }
}

// -----------------------------------------------------------
// Galaxy 构建
// -----------------------------------------------------------
function buildMainGalaxy(){
  let rows = [];
  for (let pid in papersById){
    if (pid.startsWith("A")){
      rows.push(papersById[pid]);
    }
  }
  return makeGalaxySystem({
    coreId: "AOK",
    coreLabel: "The Archaeology of Knowledge",
    rowObjs: rows,
    mode: "main"
  });
}

function buildSubGalaxy(aid){
  const corePaper = papersById[aid];
  const kids = childrenMap[aid] || [];
  return makeGalaxySystem({
    coreId: aid,
    coreLabel: corePaper ? corePaper.title : aid,
    rowObjs: kids,
    mode: "sub"
  });
}

function recomputeRadiusMapperForGalaxy(gal){
  const outerMax = min(windowWidth, windowHeight) * 0.45;
  const innerMin = outerMax * 0.08;

  gal.radiusForYear = function(y){
    if (gal.minYear === gal.maxYear){
      return (innerMin + outerMax)/2;
    }
    let t = (y - gal.minYear) / (gal.maxYear - gal.minYear);
    return lerp(innerMin, outerMax, t);
  };
}

function makeGalaxySystem(cfg){
  let rowObjs = cfg.rowObjs.slice();

  let years = rowObjs.map(o => o.year);
  if (years.length === 0){
    years = [2000];
  }
  const minYearVal = min(years);
  const maxYearVal = max(years);

  const gal = {
    mode: cfg.mode,
    coreId: cfg.coreId,
    coreLabel: cfg.coreLabel,
    minYear: minYearVal,
    maxYear: maxYearVal,
    planets: [],
    currentStep: 0,
    stepCooldown: 0,
    radiusForYear: null
  };

  recomputeRadiusMapperForGalaxy(gal);

  function yearToStep(y){
    if (gal.maxYear === gal.minYear) return 0;
    let t = (y - gal.minYear) / (gal.maxYear - gal.minYear);
    return floor(t * (MAX_STEP-1));
  }

  for (let row of rowObjs){
    const discInfo = disciplineInfo(row.disciplineRaw);
    const baseR    = gal.radiusForYear(row.year);
    const finalR   = baseR * discInfo.scale;
    const finalAng = random(TWO_PI);

    const p = {
      paperId: row.id,
      title: row.title,
      paperYear: row.year,
      disciplineRaw: row.disciplineRaw,
      colorRGB: discInfo.color,
      bandScale: discInfo.scale,
      morphType: row.morphType,
      birthStep: yearToStep(row.year),
      spawnDelay: random(SPAWN_DELAY_MIN, SPAWN_DELAY_MAX),
      ageInEra: 0,
      phase: "waiting",
      t: 0,
      finalR: finalR,
      finalAngle: finalAng,
      orbitSpeed: random(ORBIT_SPEED_MIN, ORBIT_SPEED_MAX) * (random()<0.5 ? -1 : 1),
      spawnR: 0,
      spawnAng: 0,
      planetSize: random(5,9),
      curR: finalR,
      curAng: finalAng,
      trail: [],
      incomingTrail: [],
      screenX: null,
      screenY: null,
      hasChildren: !!childrenMap[row.id] && (childrenMap[row.id].length > 0)
    };

    setSpawnOutsideScreen(p);
    gal.planets.push(p);
  }

  return gal;
}

function refreshGalaxyLayout(gal){
  recomputeRadiusMapperForGalaxy(gal);
  for (let p of gal.planets){
    p.finalR = gal.radiusForYear(p.paperYear) * p.bandScale;
    setSpawnOutsideScreen(p);
  }
}

// -----------------------------------------------------------
// discipline 映射
// -----------------------------------------------------------
function disciplineInfo(discRaw){
  const d = (discRaw || "").toLowerCase();

  if (d.includes("media")){
    return { color:[140,180,255], scale:0.95 };
  }
  if (d.includes("gender") || d.includes("body")){
    return { color:[255,170,120], scale:1.00 };
  }
  if (d.includes("education") || d.includes("communication")){
    return { color:[120,230,190], scale:1.08 };
  }
  if (d.includes("theory") || d.includes("philosophy") || d.includes("critical")){
    return { color:[210,180,255], scale:1.15 };
  }
  if (
    d.includes("sociology") ||
    d.includes("social") ||
    d.includes("political") ||
    d.includes("culture") ||
    d.includes("cultural") ||
    d.includes("policy") ||
    d.includes("polic")
  ){
    return { color:[255,230,150], scale:1.22 };
  }
  if (d.includes("art") || d.includes("aesthetics")){
    return { color:[255,140,220], scale:1.10 };
  }
  return { color:[200,200,200], scale:1.18 };
}

// -----------------------------------------------------------
// 星球生成在画面外
// -----------------------------------------------------------
function setSpawnOutsideScreen(p){
  const diagHalf = Math.hypot(width, height) * 0.5;
  const spawnRadius = random(0.8, 1.1) * diagHalf;
  p.spawnR   = spawnRadius;
  p.spawnAng = random(TWO_PI);
}

// -----------------------------------------------------------
// era 推进
// -----------------------------------------------------------
function advanceEra(gal){
  gal.stepCooldown++;
  if (gal.stepCooldown > ERA_DURATION){
    gal.stepCooldown = 0;
    if (gal.currentStep < MAX_STEP-1){
      gal.currentStep++;
    }
  }
}

// -----------------------------------------------------------
// 更新行星状态
// -----------------------------------------------------------
function updatePlanets(gal){
  for (let p of gal.planets){
    if (p.birthStep > gal.currentStep) continue;

    if (p.phase === "waiting"){
      p.ageInEra++;
      if (p.ageInEra > p.spawnDelay){
        p.phase = "incoming";
        p.t = 0;
      } else {
        continue;
      }
    }

    if (p.phase === "incoming"){
      p.t += ARRIVAL_SPEED;
      if (p.t >= 1){
        p.t = 1;
        p.phase = "settled";
      }
    } else if (p.phase === "settled"){
      p.finalAngle += p.orbitSpeed;
    }

    let curR, curAng;
    if (p.phase === "incoming"){
      const e = 1 - pow(1 - p.t, 2);
      curR  = lerp(p.spawnR, p.finalR, e);
      const easedAng  = lerpAngle(p.spawnAng, p.finalAngle, e);
      const bonusTurn = 0.2 * (1 - e);
      curAng = easedAng + bonusTurn;
    } else {
      curR  = p.finalR;
      curAng= p.finalAngle;
    }

    p.curR   = curR;
    p.curAng = curAng;
  }
}

function lerpAngle(a0, a1, t){
  let da = a1 - a0;
  da = atan2(sin(da), cos(da));
  return a0 + da * t;
}

// -----------------------------------------------------------
// 绘制核心、尾迹、行星
// -----------------------------------------------------------
function drawCore(cx, cy, label){
  noStroke();
  fill(255);
  circle(cx, cy, 10);

  fill(255,200);
  textAlign(CENTER, TOP);
  textSize(12);
  text(shortenCoreLabel(label), cx, cy+10);
}

function drawTrails(gal, sysRot, cx, cy){
  for (let p of gal.planets){
    if (p.phase !== "settled") continue;
    if (p.trail.length < 2) continue;

    for (let i=1; i<p.trail.length; i++){
      const a = p.trail[i-1];
      const b = p.trail[i];

      const lifeT = i / p.trail.length;
      const alphaVal = lerp(140, 10, lifeT);
      const w = lerp(2.2, 0.4, lifeT);

      strokeWeight(w);
      stroke(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], alphaVal);
      line(a.x, a.y, b.x, b.y);
    }
  }
}

function drawPlanetsAndRecordScreenPos(gal, sysRot, cx, cy){
  for (let p of gal.planets){
    if (p.birthStep > gal.currentStep) continue;
    if (p.phase === "waiting") continue;

    const ang = p.curAng + sysRot;
    const r   = p.curR;
    const px  = cx + cos(ang)*r;
    const py  = cy + sin(ang)*r;

    p.screenX = px;
    p.screenY = py;

    if (p.phase === "incoming"){
      addSampleToTrail(p.incomingTrail, {x:px, y:py}, 6);
      drawIncomingTrail(p);
    }

    if (p.phase === "settled"){
      addSampleToTrail(p.trail, {x:px, y:py}, TRAIL_MAX_POINTS);
    }

    drawPlanetBody(p, px, py);
  }
}

function drawIncomingTrail(p){
  if (p.incomingTrail.length < 2) return;
  for (let i=1; i<p.incomingTrail.length; i++){
    const a = p.incomingTrail[i-1];
    const b = p.incomingTrail[i];

    const lifeT = i / p.incomingTrail.length;
    const alphaVal = lerp(220, 30, lifeT);
    const w = lerp(3.0, 0.6, lifeT);

    strokeWeight(w);
    stroke(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], alphaVal);
    line(a.x, a.y, b.x, b.y);
  }
}

function addSampleToTrail(arr, pt, maxLen){
  const MIN_DIST = 2;
  if (arr.length === 0){
    arr.push(pt);
  } else {
    const last = arr[arr.length - 1];
    if (dist(last.x,last.y, pt.x,pt.y) > MIN_DIST){
      arr.push(pt);
      if (arr.length > maxLen){
        arr.shift();
      }
    }
  }
}

// 星系里的小球形态保持原样
function drawPlanetBody(p, px, py){
  const lf = (p.phase === "incoming") ? p.t : 1;
  switch(p.morphType){
    case 2:
      drawPlanetarySystemBody(p, px, py, lf);
      break;
    case 3:
      drawJetSourceBody(p, px, py, lf);
      break;
    case 4:
      drawNebulaBody(p, px, py, lf);
      break;
    case 1:
    default:
      drawCoreStarBody(p, px, py, lf);
      break;
  }
}

function drawCoreStarBody(p, px, py, lf){
  noStroke();
  fill(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 80*lf);
  circle(px, py, p.planetSize*2.6);
  fill(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 230*lf);
  circle(px, py, p.planetSize*1.6);
}

function drawPlanetarySystemBody(p, px, py, lf){
  noStroke();
  fill(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 60*lf);
  circle(px, py, p.planetSize*3.0);
  fill(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 220*lf);
  circle(px, py, p.planetSize*1.8);
}

function drawJetSourceBody(p, px, py, lf){
  noStroke();
  fill(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 240*lf);
  circle(px, py, p.planetSize*1.4);
}

function drawNebulaBody(p, px, py, lf){
  noFill();
  stroke(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 160*lf);
  strokeWeight(1.2);
  beginShape();
  const steps = 22;
  for (let i=0; i<steps; i++){
    const ang = TWO_PI * (i/steps);
    const baseR = p.planetSize*2.2;
    const n = noise(
      p.paperYear*0.01 + i*0.2,
      frameCount*0.01 + p.paperYear*0.03
    );
    const radius = baseR * lerp(0.8,1.2,n);
    const vx = px + cos(ang)*radius;
    const vy = py + sin(ang)*radius;
    vertex(vx,vy);
  }
  endShape(CLOSE);
  noStroke();
  fill(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 60*lf);
  circle(px, py, p.planetSize*2.0);
  fill(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 140*lf);
  circle(px, py, p.planetSize*1.2);
}

// -----------------------------------------------------------
// hover + tooltip
// -----------------------------------------------------------
function resolveHover(gal){
  hoverPlanet = null;
  hoverDist   = Infinity;

  for (let p of gal.planets){
    if (p.birthStep > gal.currentStep) continue;
    if (p.phase === "waiting") continue;
    if (p.screenX == null) continue;

    const d = dist(mouseX, mouseY, p.screenX, p.screenY);
    if (d < hoverDist){
      hoverDist = d;
      hoverPlanet = p;
    }
  }
}

function drawTooltip(){
  if (!hoverPlanet) return;
  if (hoverDist > HOVER_DISTANCE) return;

  const tipW = 320;
  const label =
    hoverPlanet.title +
    "\nYear: " + hoverPlanet.paperYear +
    "\nDiscipline: " + hoverPlanet.disciplineRaw +
    "\n(click to land)";

  const lines = label.split("\n");
  const tipH = lines.length * 16 + 16;

  let bx = mouseX + 16;
  let by = mouseY + 16;
  if (bx + tipW > width)  bx = width  - tipW - 10;
  if (by + tipH > height) by = height - tipH - 10;

  noStroke();
  fill(20,20,20,230);
  rect(bx, by, tipW, tipH, 4);

  stroke(255,80);
  noFill();
  rect(bx, by, tipW, tipH, 4);

  noStroke();
  fill(255);
  textSize(12);
  textAlign(LEFT, TOP);
  text(label, bx+8, by+8, tipW-16, tipH-16);
}

// -----------------------------------------------------------
// 点击
// -----------------------------------------------------------
function mousePressed(){
  // 星球视图
  if (viewMode === "planet"){
    // 右上角按钮
    if (landedPlanet && landedPlanet.hasChildren){
      const bx = width - 190;
      const by = 16;
      const bw = 174;
      const bh = 30;
      if (mouseX>bx && mouseX<bx+bw && mouseY>by && mouseY<by+bh){
        const g2 = buildSubGalaxy(landedPlanet.paperId);
        switchToGalaxy(g2);
        viewMode = "galaxy";
        landedPlanet = null;
        return;
      }
    }
    // 点天空回去
    if (mouseY < height * 0.55){
      viewMode = "galaxy";
      landedPlanet = null;
      return;
    }
    return;
  }

  // 星系视图
  const cx = width/2;
  const cy = height/2;

  // 子星系点中心回主星系
  if (currentGalaxy && currentGalaxy.mode === "sub"){
    const dc = dist(mouseX, mouseY, cx, cy);
    if (dc < CENTER_CLICK_RADIUS){
      switchToGalaxy(mainGalaxy);
      return;
    }
  }

  // 点到行星 → 落地
  if (hoverPlanet && hoverDist <= HOVER_DISTANCE){
    landedPlanet = hoverPlanet;
    landedFromGalaxy = currentGalaxy;
    viewMode = "planet";
  }
}

function switchToGalaxy(gal){
  currentGalaxy = gal;
  refreshGalaxyLayout(currentGalaxy);

  currentGalaxy.currentStep = 0;
  currentGalaxy.stepCooldown = 0;
  for (let p of currentGalaxy.planets){
    p.phase = "waiting";
    p.ageInEra = 0;
    p.t = 0;
    p.trail = [];
    p.incomingTrail = [];
  }

  fadeAlpha = 255;
}

// -----------------------------------------------------------
// Year 解析
// -----------------------------------------------------------
function parseYear(raw){
  if (!raw) return NaN;
  const s = String(raw).trim();

  let m1 = s.match(/^(\d{4})[\/-]/);
  if (m1) return int(m1[1]);

  let m3 = s.match(/^(\d{4})$/);
  if (m3) return int(m3[1]);

  let m4 = s.match(/(19|20)\d{2}/);
  if (m4) return int(m4[0]);

  return NaN;
}
