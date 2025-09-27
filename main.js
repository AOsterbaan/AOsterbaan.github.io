/* jshint esversion: 6 */

let table;

// Data arrays and results
let dataX = [];
let dataY = [];
let gaussY = [];
let productY = [];
let attenY = [];
let attenProductY = [];
let integral = 0;

// GUI & sliders
let gui;
let y2scale = 1;
let GausMean = 400;
let GausSig = 10;
let GraphFS = 24;
const GAUS_AMP = 1; // fixed amplitude

// New sliders
let Depth = 100;
let Concentration = 0.01;

// -------------------- Preload CSV --------------------
function preload() {
  table = loadTable("data.csv", "csv", "header");
}

// -------------------- Setup --------------------
function setup() {
  const wrapper = document.getElementById('plot-wrapper');
  const cnv = createCanvas(wrapper.clientWidth, wrapper.clientHeight);
  cnv.parent(wrapper);

  initPlot();
  parseCSV();
  initSliders();

  setTimeout(windowResized, 50);
}

// -------------------- CSV Parsing --------------------
function parseCSV() {
  if (!table) {
    console.error("data.csv failed to load");
    return;
  }
  dataX = [];
  dataY = [];

  for (let r = 0; r < table.getRowCount(); r++) {
    dataX.push(float(table.getString(r, 0)));
    dataY.push(float(table.getString(r, 1)));
  }
}

// -------------------- GUI / Sliders --------------------
function initSliders() {
  gui = createGui('Plot controls', 100, 100);
  const parent = gui.prototype._panel;

  const sliders = [
    new ProductSlider('mean', 300, 800, GausMean, 1, 'Center', 'nm'),
    new ProductSlider('sigma', 1, 200, GausSig, 1, 'Width (σ)', 'nm'),
    new ProductSlider('depth', 0, 500, Depth, 1, 'Depth', 'µm'),
    new ProductSlider('conc', 0, 0.1, Concentration, 0.001, 'Concentration', '')
  ];

  const callbacks = [
    val => { GausMean = val; updateCurve(); },
    val => { GausSig = val; updateCurve(); },
    val => { Depth = val; updateCurve(); },
    val => { Concentration = val; updateCurve(); }
  ];

  sliders.forEach((slider, i) => {
    slider.attachParent(parent);
    slider.setCallback(callbacks[i]);
  });

  const PAD_SIDE = 10;
  setPanelPosition(gui, "right", attPlot.GPLOT.mar[2], PAD_SIDE);

  updateCurve();
}

// -------------------- Curve Computation --------------------
function updateCurve() {
  if (!dataX.length) return;

  const npts = 400;
  const minX = 0; // extend to 0 for integration
  const maxX = Math.max(...dataX);
  const dataMax = Math.max(...dataY); // max value for extrapolation

  let fullGaussY = [];
  let fullProductY = [];
  let fullAttenY = [];
  let fullAttenProductY = [];

  for (let i = 0; i < npts; i++) {
    const x = lerp(minX, maxX, i / (npts - 1));
    const g = GAUS_AMP * Math.exp(-Math.pow(x - GausMean, 2) / (2 * GausSig * GausSig));
    const yData = interp1(dataX, dataY, x, dataMax);

    fullGaussY.push({ x, y: g });
    fullProductY.push({ x, y: g * yData * x});
    fullAttenY.push({ x, y: g * Math.exp(-yData * Concentration * Depth) });
    fullAttenProductY.push({ x, y: g * Math.exp(-yData * Concentration * Depth) * yData * x});
  }

  // Compute global max of raw product values for scaling
  const productMax = Math.max(...fullProductY.map(p => p.y));

  // Scale product arrays
  fullProductY = fullProductY.map(p => ({ x: p.x, y: p.y / productMax }));
  fullAttenProductY = fullAttenProductY.map(p => ({ x: p.x, y: p.y / productMax }));

  // Compute integrals over full range
  const integralProduct = trapz(fullProductY.map(p => p.x), fullProductY.map(p => p.y));
  const integralAtten = trapz(fullAttenProductY.map(p => p.x), fullAttenProductY.map(p => p.y));

  // Percentage attenuation
  const percentAtten = 100 * integralAtten / integralProduct;

  integral = integralProduct; // still show original integral if needed
  integralPercent = percentAtten; // store for title

  // Store only visible range for plotting
  const plotMinX = Math.min(...dataX);
  const plotMaxX = Math.max(...dataX);

  gaussY = fullGaussY.filter(p => p.x >= plotMinX && p.x <= plotMaxX);
  productY = fullProductY.filter(p => p.x >= plotMinX && p.x <= plotMaxX);
  attenY = fullAttenY.filter(p => p.x >= plotMinX && p.x <= plotMaxX);
  attenProductY = fullAttenProductY.filter(p => p.x >= plotMinX && p.x <= plotMaxX);

  redraw();
}

// -------------------- Draw Plot Title --------------------
function drawPlot() {
  const PAD = 60;
  const minX = Math.min(...dataX);
  const maxX = Math.max(...dataX);
  const minY = 0;
  const maxY = Math.max(
    ...dataY,
    ...gaussY.map(p => p.y),
    ...productY.map(p => p.y),
    ...attenY.map(p => p.y),
    ...attenProductY.map(p => p.y)
  );

  const mapX = x => map(x, minX, maxX, PAD, width - PAD);
  const mapY = y => map(y, minY, maxY, height - PAD, PAD);

  drawAxes(PAD);

  // Draw curves
  drawLine(dataX, dataY, mapX, mapY, color(0, 0, 255));
  drawLine(gaussY.map(p => p.x), gaussY.map(p => p.y), mapX, mapY, color(0, 220, 0));
  drawLine(productY.map(p => p.x), productY.map(p => p.y), mapX, mapY, color(220, 0, 0));
  drawLine(attenY.map(p => p.x), attenY.map(p => p.y), mapX, mapY, color(0, 180, 80));
  drawLine(attenProductY.map(p => p.x), attenProductY.map(p => p.y), mapX, mapY, color(180, 0, 80));

  // Draw title
  noStroke(); fill(0);
  textSize(16); textAlign(CENTER);
  text(
    `Absorbed photons at max depth relative to surface = ${nf(integralPercent, 1, 1)}%`,
    width / 2,
    PAD / 2
  );

  // Draw legend
  const legendX = width - PAD - 150;
  let legendY = PAD;
  const legendSpacing = 20;
  const legendBoxSize = 12;

  const legendItems = [
    { col: color(0, 0, 255), label: "Absorbance" },
    { col: color(0, 220, 0), label: "Gaussian LED" },
    { col: color(220, 0, 0), label: "Absorbed Photons" },
    { col: color(0, 180, 80), label: "Attenuated Light" },
    { col: color(180, 0, 80), label: "Attenuated --> Absorbed Photons" }
  ];

  textAlign(LEFT, CENTER);
  textSize(14);
  legendItems.forEach(item => {
    fill(item.col);
    rect(legendX, legendY - legendBoxSize / 2, legendBoxSize, legendBoxSize);
    fill(0);
    text(item.label, legendX + legendBoxSize + 5, legendY);
    legendY += legendSpacing;
  });
}



// Updated interpolation remains the same
function interp1(xs, ys, x, defaultValue = null) {
  if (x < xs[0]) return defaultValue !== null ? defaultValue : ys[0];
  if (x > xs[xs.length - 1]) return defaultValue !== null ? defaultValue : ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return lerp(ys[i], ys[i + 1], t);
    }
  }
}


// -------------------- Drawing --------------------
function draw() {
  clear();
  drawPlot();
}

// -------------------- Plotting --------------------
function initPlot() {
  attPlot = new PlotCanvas(this);
  attPlot.plotSetup();

  attPlot.GPLOT.getXAxis().getAxisLabel().setText("Depth (\u03BCm)");
  attPlot.GPLOT.getYAxis().getAxisLabel().setText("Intensity (mW/cm²)");
  attPlot.GPLOT.getTitle().setText("");

  attPlot.GPLOT.getXAxis().getAxisLabel().setFontSize(GraphFS);
  attPlot.GPLOT.getYAxis().getAxisLabel().setFontSize(GraphFS);
  attPlot.GPLOT.getXAxis().setFontSize(GraphFS);
  attPlot.GPLOT.getYAxis().setFontSize(GraphFS);
  attPlot.GPLOT.getTitle().setFontSize(GraphFS);
  attPlot.GPLOT.setFontSize(GraphFS);
}

// -------------------- Axes & Utilities --------------------
function drawAxes(PAD) {
  stroke(0); strokeWeight(1);
  line(PAD, PAD, PAD, height - PAD);
  line(PAD, height - PAD, width - PAD, height - PAD);

  noStroke(); fill(0); textSize(14);
  textAlign(CENTER);
  text("Wavelength (nm)", width / 2, height - 20);

  push();
  translate(20, height / 2);
  rotate(-PI / 2);
  textAlign(CENTER, CENTER);
  text("Value", 0, 0);
  pop();
}

function interp1(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return lerp(ys[i], ys[i + 1], t);
    }
  }
}

function trapz(xs, ys) {
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    area += 0.5 * (ys[i] + ys[i + 1]) * (xs[i + 1] - xs[i]);
  }
  return area;
}

function drawLine(xs, ys, mapX, mapY, col) {
  stroke(col); strokeWeight(2); noFill();
  beginShape();
  xs.forEach((x, i) => vertex(mapX(x), mapY(ys[i])));
  endShape();
}

// -------------------- ProductSlider --------------------
class ProductSlider {
  constructor(key, min, max, init, step, label, units) {
    this.val = init;

    this.div = document.createElement("div");
    this.div.className = "qs_container";

    this.labelDiv = document.createElement("div");
    this.labelDiv.className = "qs_label";
    this.labelDiv.innerHTML = `<b>${label}:</b> `;

    this.valBox = document.createElement("input");
    this.valBox.type = "text"; this.valBox.style.width = "60px";
    this.valBox.value = formatSigFig(init, 3);

    this.labelDiv.appendChild(this.valBox);
    this.labelDiv.append(` ${units}`);
    this.div.appendChild(this.labelDiv);

    this.sliderDiv = document.createElement("input");
    this.sliderDiv.type = "range";
    this.sliderDiv.min = min;
    this.sliderDiv.max = max;
    this.sliderDiv.step = step;
    this.sliderDiv.value = init;
    this.sliderDiv.style.width = "160px";
    this.div.appendChild(this.sliderDiv);

    this.callback = null;

    this.sliderDiv.addEventListener("input", e => {
      this.val = Number(e.target.value);
      this.valBox.value = formatSigFig(this.val, 3);
      if (this.callback) this.callback(this.val);
    });

    this.valBox.addEventListener("input", e => {
      const v = Number(e.target.value);
      if (!isNaN(v)) {
        this.val = v;
        if (this.callback) this.callback(this.val);
      }
    });
  }

  attachParent(parent) { parent.appendChild(this.div); }
  setCallback(cb) { this.callback = cb; }
}

// -------------------- Formatting --------------------
function formatSigFig(num, sigfigs) {
  return Number.parseFloat(num).toPrecision(sigfigs);
}

// -------------------- Panel / Canvas Helpers --------------------
function setPanelPosition(guiObject, side = "left", offsetTop = 20, pad = 20) {
  if (!guiObject || !guiObject.prototype || !guiObject.prototype._panel) return;

  const panel = guiObject.prototype._panel;
  panel.style.position = "fixed";
  panel.style.top = offsetTop + "px";

  if (side === "left") {
    panel.style.left = pad + "px";
    panel.style.right = "auto";
  } else {
    panel.style.right = pad + "px";
    panel.style.left = "auto";
  }
}

function getPanelWidth(guiObject) {
  const panel = guiObject?.prototype?._panel;
  if (!panel) return 0;

  let wasHidden = false;
  if (panel.style.display === "none") {
    wasHidden = true;
    panel.style.display = "block";
  }

  const width = panel.getBoundingClientRect().width;
  if (wasHidden) panel.style.display = "none";
  return width;
}

function computeCanvasSize() {
  const PAD_SIDE = 20;
  const aspect = 4 / 3;

  let availableWidth, maxHeight;

  if (window.innerWidth < 800) {
    availableWidth = window.innerWidth - PAD_SIDE * 2;
    maxHeight = window.innerHeight * 0.5;
  } else {
    const leftWidth = 0;
    const rightWidth = getPanelWidth(gui) + PAD_SIDE;
    availableWidth = Math.max(300, window.innerWidth - leftWidth - rightWidth - PAD_SIDE);
    maxHeight = window.innerHeight * 0.9;
  }

  let w = availableWidth;
  let h = w / aspect;

  if (h > maxHeight) {
    h = maxHeight;
    w = h * aspect;
  }

  return { width: w, height: h };
}

function initPanelPositions() {
  if (window.innerWidth < 800) return;
  const PAD_SIDE = 20;
  const topY = PAD_SIDE;
  if (gui) setPanelPosition(gui, "right", topY, PAD_SIDE);
}

function windowResized() {
  const size = computeCanvasSize();
  if (typeof resizeCanvas === 'function') resizeCanvas(size.width, size.height);

  if (attPlot && attPlot.GPLOT) {
    attPlot.GPLOT.setOuterDim(size.width, size.height);
    attPlot.GPLOT.setPos(0, 0);
  }

  initPanelPositions();
  loop();
}
