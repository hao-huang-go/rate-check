import { pct } from "./format";

interface Props {
  rates: number[]; // sorted ascending, one per lender
  yours: number;
  youLabel: string;
}

const WIDTH = 520;
const HEIGHT = 150;
const PAD_X = 12;
const AXIS_Y = 118;
const BIN = 0.001; // 0.1 percentage point

// A few specialist lenders price far above the pack; past this quantile they share the last bin.
const AXIS_QUANTILE = 0.9;

// Histogram of lender best rates in 0.1pp bins, with a marker at the user's rate.
export function RateChart({ rates, yours, youLabel }: Props) {
  const axisMax = rates[Math.floor((rates.length - 1) * AXIS_QUANTILE)];
  const lo = Math.floor(Math.min(rates[0], yours) / BIN) * BIN;
  const hi = Math.ceil(Math.max(axisMax, yours) / BIN) * BIN + BIN;
  const binCount = Math.max(1, Math.round((hi - lo) / BIN));
  const bins = new Array<number>(binCount).fill(0);
  for (const r of rates) bins[Math.min(binCount - 1, Math.floor((r - lo) / BIN + 1e-9))]++;
  const tallest = Math.max(...bins);

  const x = (rate: number) => PAD_X + ((rate - lo) / (hi - lo)) * (WIDTH - 2 * PAD_X);
  const barWidth = (WIDTH - 2 * PAD_X) / binCount;
  const yoursX = x(yours);
  const tickStep = binCount > 30 ? 0.005 : 0.0025;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / tickStep) * tickStep; v <= hi; v += tickStep) ticks.push(v);

  return (
    <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img">
      {bins.map((count, i) => {
        if (!count) return null;
        const h = (count / tallest) * (AXIS_Y - 28);
        const binLo = lo + i * BIN;
        const isAboveYou = binLo + BIN / 2 > yours;
        return (
          <rect
            key={i}
            x={PAD_X + i * barWidth + 1}
            y={AXIS_Y - h}
            width={Math.max(1, barWidth - 2)}
            height={h}
            rx={2}
            className={isAboveYou ? "bar dim" : "bar"}
          >
            <title>{`${pct(binLo)}–${pct(binLo + BIN)}: ${count}`}</title>
          </rect>
        );
      })}
      <line x1={PAD_X} x2={WIDTH - PAD_X} y1={AXIS_Y} y2={AXIS_Y} className="axis" />
      {ticks.map((v) => (
        <text key={v} x={x(v)} y={AXIS_Y + 18} className="tick" textAnchor="middle">
          {pct(v, 1)}
        </text>
      ))}
      <line x1={yoursX} x2={yoursX} y1={16} y2={AXIS_Y} className="you-line" />
      <text
        x={yoursX}
        y={11}
        className="you-label"
        textAnchor={yoursX > WIDTH - 60 ? "end" : yoursX < 60 ? "start" : "middle"}
      >
        {`${youLabel} ${pct(yours)}`}
      </text>
    </svg>
  );
}
