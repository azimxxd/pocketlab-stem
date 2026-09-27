type Particle = { x: number; y: number; radius: number; phase: number; speed: number };

/** A small, self-contained animated science still-life for the landing page. */
export function mountLandingVisual(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  let width = 0;
  let height = 0;
  let frame = 0;
  let lastFrame = 0;
  let reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const particles: Particle[] = Array.from({ length: 54 }, (_, index) => ({
    x: ((index * 127.1) % 997) / 997,
    y: ((index * 311.7 + 17) % 991) / 991,
    radius: 0.5 + ((index * 7) % 11) / 10,
    phase: index * 2.4,
    speed: 0.12 + ((index * 5) % 9) / 50,
  }));

  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    width = bounds.width;
    height = bounds.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  };

  const roundedRect = (x: number, y: number, w: number, h: number, r: number) => {
    context.beginPath();
    context.roundRect(x, y, w, h, r);
  };

  const draw = (time: number) => {
    if (!width || !height) return;
    const t = (reducedMotion ? 0 : time / 1000) * 0.72;
    context.clearRect(0, 0, width, height);

    const backdrop = context.createLinearGradient(0, 0, width, height);
    backdrop.addColorStop(0, "#111824");
    backdrop.addColorStop(0.52, "#202837");
    backdrop.addColorStop(1, "#10151e");
    context.fillStyle = backdrop;
    context.fillRect(0, 0, width, height);

    const glow = context.createRadialGradient(width * 0.51, height * 0.52, 0, width * 0.51, height * 0.52, width * 0.62);
    glow.addColorStop(0, "rgba(217,126,67,.28)");
    glow.addColorStop(0.42, "rgba(107,105,131,.12)");
    glow.addColorStop(1, "rgba(12,17,24,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    // Quiet etched laboratory grid and atmospheric dust.
    context.save();
    context.strokeStyle = "rgba(211,216,224,.055)";
    context.lineWidth = 1;
    for (let x = 20; x < width; x += 36) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
    }
    for (let y = 18; y < height; y += 36) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    }
    for (const mote of particles) {
      const x = (mote.x * width + Math.sin(t * mote.speed + mote.phase) * 11 + width) % width;
      const y = (mote.y * height - t * mote.speed * 4 + height) % height;
      context.globalAlpha = 0.18 + (Math.sin(t + mote.phase) + 1) * 0.16;
      context.fillStyle = mote.phase % 3 < 1 ? "#f5bd83" : "#c2c9df";
      context.beginPath(); context.arc(x, y, mote.radius, 0, Math.PI * 2); context.fill();
    }
    context.restore();

    // Ground plane and the glass bottle catch warm highlights.
    context.fillStyle = "rgba(8,12,19,.37)";
    context.beginPath(); context.ellipse(width * 0.53, height * 0.82, width * 0.39, height * 0.075, 0, 0, Math.PI * 2); context.fill();
    const bx = width * 0.77, by = height * 0.48, bw = Math.min(width * 0.105, 76), bh = height * 0.31;
    context.save();
    context.translate(bx, by);
    const glass = context.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    glass.addColorStop(0, "rgba(183,204,211,.1)"); glass.addColorStop(.24, "rgba(232,232,217,.42)"); glass.addColorStop(.52, "rgba(92,151,174,.16)"); glass.addColorStop(.88, "rgba(242,186,124,.2)"); glass.addColorStop(1, "rgba(231,231,222,.42)");
    context.fillStyle = glass;
    context.strokeStyle = "rgba(239,222,199,.72)";
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(-bw * .19, -bh * .5); context.lineTo(-bw * .18, -bh * .28); context.quadraticCurveTo(-bw * .48, -bh * .15, -bw * .43, 0); context.lineTo(-bw * .35, bh * .45); context.quadraticCurveTo(0, bh * .53, bw * .35, bh * .45); context.lineTo(bw * .43, 0); context.quadraticCurveTo(bw * .48, -bh * .15, bw * .18, -bh * .28); context.lineTo(bw * .19, -bh * .5); context.closePath(); context.fill(); context.stroke();
    context.fillStyle = "rgba(90,165,190,.43)";
    context.beginPath(); context.moveTo(-bw * .4, bh * .13); context.quadraticCurveTo(0, bh * .08, bw * .4, bh * .13); context.lineTo(bw * .35, bh * .44); context.quadraticCurveTo(0, bh * .5, -bw * .35, bh * .44); context.closePath(); context.fill();
    context.fillStyle = "#d0b18d"; roundedRect(-bw * .22, -bh * .55, bw * .44, bh * .065, 3); context.fill();
    context.restore();

    // Phone with a glowing live-trace display.
    const phoneW = Math.min(width * 0.245, 174), phoneH = Math.min(height * 0.76, 448);
    const px = width * 0.51 - phoneW / 2, py = height * 0.51 - phoneH / 2;
    context.save();
    context.shadowColor = "rgba(2,5,12,.62)"; context.shadowBlur = 32; context.shadowOffsetY = 19;
    const chassis = context.createLinearGradient(px, py, px + phoneW, py + phoneH);
    chassis.addColorStop(0, "#a7a9a5"); chassis.addColorStop(.16, "#323b47"); chassis.addColorStop(.5, "#111821"); chassis.addColorStop(.83, "#535962"); chassis.addColorStop(1, "#bec0b9");
    context.fillStyle = chassis; roundedRect(px, py, phoneW, phoneH, phoneW * .13); context.fill();
    context.restore();
    const inset = phoneW * .037;
    const sx = px + inset, sy = py + inset, sw = phoneW - inset * 2, sh = phoneH - inset * 2;
    const screen = context.createLinearGradient(sx, sy, sx + sw, sy + sh);
    screen.addColorStop(0, "#202a37"); screen.addColorStop(.58, "#192330"); screen.addColorStop(1, "#131c27");
    context.fillStyle = screen; roundedRect(sx, sy, sw, sh, phoneW * .105); context.fill();
    context.fillStyle = "#0c1118"; roundedRect(px + phoneW * .37, py + phoneH * .027, phoneW * .26, phoneH * .022, 8); context.fill();
    context.fillStyle = "#f1e7d7"; context.font = `600 ${Math.max(10, phoneW * .075)}px Manrope, sans-serif`; context.fillText("PocketLab", sx + sw * .11, sy + sh * .14);
    context.fillStyle = "#94a0b0"; context.font = `500 ${Math.max(6, phoneW * .039)}px 'DM Sans', sans-serif`; context.fillText("OSCILLATION · LIVE", sx + sw * .11, sy + sh * .19);

    const graphX = sx + sw * .09, graphY = sy + sh * .35, graphW = sw * .82, graphH = sh * .3;
    context.strokeStyle = "rgba(210,222,231,.12)"; context.lineWidth = 1;
    for (let n = 0; n <= 4; n++) { const y = graphY + graphH * n / 4; context.beginPath(); context.moveTo(graphX, y); context.lineTo(graphX + graphW, y); context.stroke(); }
    const trace = context.createLinearGradient(graphX, graphY, graphX + graphW, graphY);
    trace.addColorStop(0, "rgba(245,173,105,.15)"); trace.addColorStop(.5, "#f4b36e"); trace.addColorStop(1, "#ffe2ac");
    context.save(); context.shadowColor = "#e89854"; context.shadowBlur = 12; context.strokeStyle = trace; context.lineWidth = 2; context.beginPath();
    for (let x = 0; x <= graphW; x += 2) {
      const envelope = Math.exp(-x / graphW * 1.2);
      const y = graphY + graphH * .5 + Math.sin(x / graphW * 15 * Math.PI - t * 2.4) * graphH * .39 * envelope;
      x === 0 ? context.moveTo(graphX + x, y) : context.lineTo(graphX + x, y);
    }
    context.stroke(); context.restore();
    context.fillStyle = "#b8c4d3"; context.font = `500 ${Math.max(7, phoneW * .047)}px 'DM Sans', sans-serif`;
    context.fillText("ПЕРИОД", graphX, graphY + graphH + sh * .09);
    context.fillStyle = "#f0b374"; context.font = `600 ${Math.max(12, phoneW * .1)}px Manrope, sans-serif`;
    context.fillText("0.84 s", graphX, graphY + graphH + sh * .2);
    context.fillStyle = "rgba(240,244,248,.6)"; context.font = `500 ${Math.max(6, phoneW * .04)}px 'DM Sans', sans-serif`;
    context.fillText("Данные с датчиков телефона", graphX, sy + sh * .88);

    // A physically legible pendulum sweeps across the upper right of the still life.
    const pivotX = width * .8, pivotY = height * .12, length = height * .28;
    const angle = Math.sin(t * 1.4) * .48;
    const bobX = pivotX + Math.sin(angle) * length, bobY = pivotY + Math.cos(angle) * length;
    context.save();
    context.strokeStyle = "rgba(222,194,157,.34)"; context.lineWidth = 1;
    context.beginPath(); context.arc(pivotX, pivotY, length, Math.PI * .16, Math.PI * .84); context.stroke();
    context.strokeStyle = "rgba(233,208,175,.8)"; context.lineWidth = 1.3;
    context.beginPath(); context.moveTo(pivotX, pivotY); context.lineTo(bobX, bobY); context.stroke();
    const metal = context.createRadialGradient(bobX - 5, bobY - 6, 1, bobX, bobY, 15);
    metal.addColorStop(0, "#fff1c9"); metal.addColorStop(.28, "#f0bf79"); metal.addColorStop(.74, "#ba7146"); metal.addColorStop(1, "#69453b");
    context.shadowColor = "rgba(239,157,84,.75)"; context.shadowBlur = 23; context.fillStyle = metal;
    context.beginPath(); context.arc(bobX, bobY, 11, 0, Math.PI * 2); context.fill(); context.restore();

    // Low, slow optical sweep glides through the composition.
    const sweep = (t * 31) % (width + 180) - 90;
    const band = context.createLinearGradient(sweep - 60, 0, sweep + 60, 0);
    band.addColorStop(0, "rgba(248,185,112,0)"); band.addColorStop(.5, "rgba(248,185,112,.045)"); band.addColorStop(1, "rgba(248,185,112,0)");
    context.fillStyle = band; context.fillRect(sweep - 60, 0, 120, height);
  };

  const animate = (now: number) => {
    if (document.hidden) { frame = 0; return; }
    if (now - lastFrame > 32) { draw(now); lastFrame = now; }
    frame = requestAnimationFrame(animate);
  };
  const start = () => { if (!reducedMotion && !frame && !document.hidden) frame = requestAnimationFrame(animate); };
  const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  const visibility = () => document.hidden ? stop() : start();
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  motion.addEventListener("change", (event) => { reducedMotion = event.matches; stop(); draw(performance.now()); start(); });
  document.addEventListener("visibilitychange", visibility);
  new ResizeObserver(resize).observe(canvas);
  resize(); start();
}
