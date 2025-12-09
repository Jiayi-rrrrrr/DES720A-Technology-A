let nodes = [];
let links = [];
let angle = 0;

let autoRotate = true;

const HUB = 0;
const NORMAL = 1;
const BROKEN = 2;


class Node {
  constructor(x, y, type = NORMAL) {
    this.x = x;
    this.y = y;
    this.type = type;
  }
}


class Link {
  constructor(a, b, broken = false) {
    this.a = a;
    this.b = b;
    this.broken = broken;
  }
}


function setup() {
  createCanvas(windowWidth, windowHeight);

  for (let i = 0; i < 40; i++) {
    let angle = random(TWO_PI);
    let r = random(100, 300);
    let x = width / 2 + cos(angle) * r;
    let y = height / 2 + sin(angle) * r;

    let type = NORMAL;
    if (i < 3) type = HUB;
    if (i > 32) type = BROKEN;

    nodes.push(new Node(x, y, type));
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (random() < 0.08) {
        links.push(new Link(nodes[i], nodes[j], false));
      }
    }
  }

  for (let i = 33; i < nodes.length; i++) {
    if (random() < 0.6) {
      links.push(new Link(nodes[i], random(nodes), true));
    }
  }

  stroke(255);
}


function draw() {
  background(0);

  drawGrid();
  drawHeader();

  push();
  translate(width / 2, height / 2);

  if (autoRotate) angle += 0.001;
  rotate(angle);

  translate(-width / 2, -height / 2);

  drawLinks();
  drawNodes();

  pop();
}

function drawGrid() {
  stroke(40);
  strokeWeight(1);

  for (let i = 0; i < width; i += 40) {
    line(i, 0, i, height);
  }
  for (let j = 0; j < height; j += 40) {
    line(0, j, width, j);
  }
}

function drawHeader() {
  noStroke();
  fill(255);
  textSize(16);
  textFont('monospace');

  text("VIEWPORT: GALACTIC_CORE", 40, 40);
  text("ZOOM: 120% // ROTATION: AUTO", 40, 65);

  text("HUB_NODE ●", width - 180, height - 90);
  text("CITATION ●", width - 180, height - 65);
  text("BROKEN_LINK - - -", width - 180, height - 40);
}


function drawNodes() {
  noStroke();

  for (let n of nodes) {
    if (n.type === HUB) {
      fill(255);
      ellipse(n.x, n.y, 22, 22);
    } else if (n.type === BROKEN) {
      fill(150);
      ellipse(n.x, n.y, 8, 8);
    } else {
      fill(255);
      ellipse(n.x, n.y, 10, 10);
    }
  }
}


function drawLinks() {
  for (let l of links) {
    if (l.broken) {
      stroke(150);
      drawingContext.setLineDash([8, 6]);
    } else {
      stroke(255);
      drawingContext.setLineDash([]);
    }

    strokeWeight(1.2);
    line(l.a.x, l.a.y, l.b.x, l.b.y);
  }
}


function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
