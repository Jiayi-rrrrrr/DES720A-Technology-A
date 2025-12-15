
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


let papersTable;
let edgesTable;

let papersById = {};  
let childrenMap = {};   

let mainGalaxy = null;     
let currentGalaxy = null;  
let fadeAlpha = 0;         

let hoverPlanet = null;
let hoverDist = Infinity;

let starfieldFar = [];
let starfieldNear = [];

function preload(){
  papersTable = loadTable("papers.csv","csv","header");
  edgesTable  = loadTable("edges.csv","csv","header");
}

function setup(){
  createCanvas(windowWidth, windowHeight);
  angleMode(RADIANS);
  smooth();
  textFont('Arial');

  buildStarfield();
  parsePapers();
  buildChildrenMap();

  mainGalaxy = buildMainGalaxy();
  currentGalaxy = mainGalaxy;
  updateHUDCoreLabel(currentGalaxy.coreLabel);
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);

  buildStarfield();

  if (mainGalaxy){
    refreshGalaxyLayout(mainGalaxy);
  }
  if (currentGalaxy && currentGalaxy !== mainGalaxy){
    refreshGalaxyLayout(currentGalaxy);
  }
}

function draw(){
  background(0);

  const cx = width / 2;
  const cy = height / 2;

  drawStarfield();

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

  if (fadeAlpha > 0){
    noStroke();
    fill(0,0,0, fadeAlpha);
    rect(0,0,width,height);
    fadeAlpha = max(fadeAlpha - FADE_SPEED, 0);
  }
}

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

  if (
    d.includes("theory") ||
    d.includes("philosophy") ||
    d.includes("critical")
  ){
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

function setSpawnOutsideScreen(p){
  const diagHalf = Math.hypot(width, height) * 0.5;
  const spawnRadius = random(0.8, 1.1) * diagHalf;
  p.spawnR   = spawnRadius;
  p.spawnAng = random(TWO_PI);
}

function advanceEra(gal){
  gal.stepCooldown++;
  if (gal.stepCooldown > ERA_DURATION){
    gal.stepCooldown = 0;
    if (gal.currentStep < MAX_STEP-1){
      gal.currentStep++;
    }
  }
}

function updatePlanets(gal){
  for (let p of gal.planets){
    if (p.birthStep > gal.currentStep){
      continue;
    }

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

  const orbitR = p.planetSize*2.6;
  stroke(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 120*lf);
  strokeWeight(0.8);
  noFill();
  ellipse(px, py, orbitR*2, orbitR*1.2);

  noStroke();
  const moonCount = 2;
  for (let i=0;i<moonCount;i++){
    const ang = frameCount*0.01 + (TWO_PI/moonCount)*i;
    const mx = px + cos(ang)*orbitR;
    const my = py + sin(ang)*orbitR*0.6;
    fill(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 200*lf);
    circle(mx, my, p.planetSize*0.7);
  }
}

function drawJetSourceBody(p, px, py, lf){
  noStroke();
  fill(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 240*lf);
  circle(px, py, p.planetSize*1.4);

  fill(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 60*lf);
  circle(px, py, p.planetSize*2.4);

  strokeWeight(1.2);
  stroke(p.colorRGB[0], p.colorRGB[1], p.colorRGB[2], 190*lf);

  const jetLen = p.planetSize*3.5;
  const baseAng = frameCount*0.01;
  for (let j=0;j<2;j++){
    const ang = baseAng + j*PI;
    const x2 = px + cos(ang)*jetLen;
    const y2 = py + sin(ang)*jetLen;
    line(px,py, x2,y2);
  }
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
    (hoverPlanet.hasChildren ? "\n(click: open its galaxy)" : "");

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

function mousePressed(){
  if (!currentGalaxy) return;

  const cx = width/2;
  const cy = height/2;

  if (currentGalaxy.mode === "sub"){
    const dc = dist(mouseX, mouseY, cx, cy);
    if (dc < CENTER_CLICK_RADIUS){
      switchToGalaxy(mainGalaxy);
      return;
    }
  }

  if (hoverPlanet && hoverDist <= HOVER_DISTANCE){
    if (hoverPlanet.hasChildren){
      const g2 = buildSubGalaxy(hoverPlanet.paperId);
      if (g2 && g2.planets && g2.planets.length > 0){
        switchToGalaxy(g2);
      }
    }
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
