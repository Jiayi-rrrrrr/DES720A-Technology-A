let papers;
let edges;
let citationTrend = {};
let disciplines = [];
let colors = {};
let maxCount = 0;

function preload() {
  papers = loadTable("papers.csv", "csv", "header");
  edges = loadTable("edges.csv", "csv", "header");
}

function setup() {
  createCanvas(900, 400);
  background(0);
  noFill();
  strokeWeight(1.5);
  textFont("Courier New");
  textSize(10);

  for (let r = 0; r < papers.getRowCount(); r++) {
    let year = papers.getString(r, "Year");
    let disc = papers.getString(r, "discipline");
    if (!citationTrend[year]) citationTrend[year] = {};
    if (!citationTrend[year][disc]) citationTrend[year][disc] = 0;
    if (!disciplines.includes(disc)) disciplines.push(disc);
  }

  for (let i = 0; i < edges.getRowCount(); i++) {
    let cited = edges.getString(i, "cited_id");
    let citing = edges.getString(i, "citing_id");

    let citedRow = papers.findRow(cited, "id");
    let citingRow = papers.findRow(citing, "id");

    if (citedRow && citingRow) {
      let year = citingRow.getString("Year");
      let disc = citingRow.getString("discipline");

      if (!citationTrend[year]) citationTrend[year] = {};
      if (!citationTrend[year][disc]) citationTrend[year][disc] = 0;
      citationTrend[year][disc]++;

      if (citationTrend[year][disc] > maxCount) {
        maxCount = citationTrend[year][disc];
      }
    }
  }

  colorMode(HSB);
  for (let i = 0; i < disciplines.length; i++) {
    colors[disciplines[i]] = color((i * 40) % 360, 100, 100);
  }
}

function draw() {
  background(0, 60);
  translate(80, height - 60);

  stroke(100);
  line(0, 0, width - 160, 0);
  line(0, 0, 0, -height + 120);

  let years = Object.keys(citationTrend).sort();
  let xStep = (width - 200) / years.length;

  for (let d of disciplines) {
    beginShape();
    stroke(colors[d]);
    noFill();
    for (let i = 0; i < years.length; i++) {
      let year = years[i];
      let count = citationTrend[year][d] || 0;
      let x = i * xStep;
      let y = map(count, 0, maxCount, 0, -height / 2.5); 
      vertex(x, y + sin(frameCount * 0.03 + i * 0.25) * 3);
    }
    endShape();
  }

  noStroke();
  fill(180);
  textAlign(CENTER);
  for (let i = 0; i < years.length; i++) {
    if (i % 2 === 0) text(years[i], i * xStep, 15);
  }

  textAlign(LEFT);
  let labelX = width - 150;
  for (let i = 0; i < disciplines.length; i++) {
    fill(colors[disciplines[i]]);
    text(disciplines[i], labelX, -i * 13);
  }

  textAlign(LEFT);
  fill(255);
  textSize(14);
  text("Citation Trend by Year", 0, -height + 100);
}
