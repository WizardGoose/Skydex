import { VectorMark } from "../mark";

export function ShardCalculationStatus({ updating }: { updating: boolean }) {
  return <div className="shards-calculation-status" role="status" aria-live="polite" aria-atomic="true">
    <div aria-hidden="true" className="shards-calculation-wonder"><VectorMark alert={false} thinking className="shards-calculation-mark" /></div>
    <div><strong>{updating ? "Wonder is recalculating…" : "Wonder is calculating…"}</strong>
    </div>
  </div>;
}
