import type { ExperimentCondition, ExperimentAnalysis } from "../experiment";

export class ExperimentGraph {
  constructor(
    private canvas: HTMLCanvasElement,
    private squaredPeriod: boolean,
  ) {}

  draw(conditions: ExperimentCondition[], analysis: ExperimentAnalysis) {
    const canvas = this.canvas,
      width = canvas.clientWidth,
      height = 230,
      ratio = Math.min(devicePixelRatio, 2);
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!conditions.length) {
      ctx.fillStyle = "#576472";
      ctx.font = "14px system-ui";
      ctx.fillText("Сохраните измерения, чтобы увидеть точки", 16, 32);
      return;
    }
    const xs = conditions.map((condition) => condition.lengthMeters),
      ys = conditions.map((condition) =>
        this.squaredPeriod
          ? condition.periodSquaredSeconds2
          : condition.periodSeconds,
      ),
      rawXMin = Math.min(...xs),
      rawXMax = Math.max(...xs),
      xPad = Math.max((rawXMax - rawXMin) * 0.08, rawXMax * 0.03),
      xMin = Math.max(0, rawXMin - xPad),
      xMax = rawXMax + xPad,
      rawYMin = Math.min(...ys),
      rawYMax = Math.max(...ys),
      yPad = Math.max((rawYMax - rawYMin) * 0.14, rawYMax * 0.08, 0.01),
      yMin = Math.max(0, rawYMin - yPad),
      yMax = rawYMax + yPad,
      left = 54,
      right = width - 14,
      top = 20,
      bottom = height - 34,
      plotWidth = Math.max(1, right - left),
      plotHeight = Math.max(1, bottom - top),
      xAt = (x: number) => left + ((x - xMin) / (xMax - xMin || 1)) * plotWidth,
      yAt = (y: number) =>
        bottom - ((y - yMin) / (yMax - yMin || 1)) * plotHeight;

    ctx.font = "11px system-ui";
    ctx.strokeStyle = "#d4d8dc";
    ctx.fillStyle = "#47515b";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const fraction = i / 4,
        x = left + fraction * plotWidth,
        y = bottom - fraction * plotHeight,
        xValue = xMin + fraction * (xMax - xMin),
        yValue = yMin + fraction * (yMax - yMin);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillText(xValue.toFixed(2), x - 13, height - 14);
      ctx.fillText(yValue.toFixed(2), 2, y + 4);
    }
    // Show the measured unconstrained fit only on T² vs L; no theoretical series is plotted.
    if (this.squaredPeriod && analysis.fit) {
      const {
        slopeSecondsSquaredPerMeter: slope,
        interceptSecondsSquared: intercept,
      } = analysis.fit;
      ctx.strokeStyle = "#f15a0a";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(xAt(xMin), yAt(slope * xMin + intercept));
      ctx.lineTo(xAt(xMax), yAt(slope * xMax + intercept));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "#2563eb";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    for (const condition of conditions) {
      const x = xAt(condition.lengthMeters),
        y = yAt(
          this.squaredPeriod
            ? condition.periodSquaredSeconds2
            : condition.periodSeconds,
        );
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "#1c2732";
    ctx.fillText("L (м)", Math.max(left, right - 36), height - 2);
  }
}
