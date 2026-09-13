import React, { useCallback, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, CircleUserRound, Gem, PackageSearch, Sprout } from "lucide-react";
import { Bar, FOCUS, NUM } from "../ui/kit";
import { usePlannerState } from "../greenhouse/planner/usePlannerState";
import { gateStock, planProgress, progressPctLabel, snapshotRows } from "../greenhouse/planner/planEstimates";
import { useGreenhouseDataset } from "../greenhouse/data/datasetStore";
import { useOwned } from "../inventory";
import { formatDuration } from "../greenhouse/planner/time";
import { UniversalSearch, useSiteIndex } from "../search";
import { summarizeSearchCoverage } from "../search/coverage";
import { pickSaying, prepareSayings } from "../sayings";
import { VectorMark } from "../mark";
import { ProfileLookupForm } from "../profile/ProfileLookupForm";
import { legacyProfileRedirectTarget } from "../routeRedirect";

/**
 * The front door.
 *
 * The mark and Universal Search remain the front door. Their composition now
 * follows the Profile revamp's glass, type and colour language without copying
 * Profile's split avatar layout. Wonder remains the front door: centred above
 * the centred search field, with the compact toolkit index underneath.
 *
 * PLACEHOLDER
 * -----------
 * The empty field is Wonder speaking, not a carousel of search-index nouns.
 * `src/sayings` crosses four grammar-safe sentence families with Wonder's own
 * vocabulary, plus a small set of recognisable signature lines. The result is
 * more than a million complete sentences without ever guessing at agreement,
 * articles, spacing, or punctuation.
 *
 * A saying is drawn once per visit and once per focus. It is never redrawn
 * while someone is typing, and that is structural rather than careful: a
 * `placeholder` is only painted by the browser when the field is empty, so a
 * swap during typing is not something the user can be shown. What the focus
 * redraw actually does is give a fresh question to anyone who clicks away and
 * comes back, which is the moment they are looking at the empty field again.
 */

/** Wonder's vocabulary is static, so the grammar deck is prepared once. */
const WONDER_SAYINGS = prepareSayings();

/**
 * The one card of the visitor's own data the page shows.
 *
 * The percentage and the bar run through the exact functions the Planner and
 * the grind panels use - `snapshotRows`, `gateStock`, `planProgress` - so
 * owned stock is credited here the way it is credited everywhere (owned
 * stock IS progress, and
 * a front door reading 0% at a real 19% would be that lie again). The clock
 * is `expectedSecondsLeft` exactly as the Planner recorded it, never
 * re-derived. Null when there is no plan, and the page then shows nothing at
 * all rather than an advert for making one.
 */
const useResumeCard = (): {
  label: string;
  done: number;
  owned: number;
  total: number;
  pct: string;
  secondsLeft: number | null;
} | null => {
  const { state } = usePlannerState();
  const { bridge } = useGreenhouseDataset();
  const heldStock = useOwned({ items: bridge, manual: state.inventory });

  return useMemo(() => {
    const snap = state.snapshot;
    if (!snap || !snap.targetLabel) return null;

    const { rows, unitIds } = snapshotRows(snap);
    const stockOf = gateStock(unitIds, (id: string) => heldStock.count(id));
    const progress = planProgress(rows, stockOf, state.progress);
    if (!(progress.wantedUnits > 0)) return null;

    return {
      label: snap.targetLabel,
      done: progress.harvestedUnits,
      owned: progress.ownedUnits,
      total: progress.wantedUnits,
      pct: progressPctLabel(progress.pct),
      secondsLeft: snap.expectedSecondsLeft ?? null,
    };
  }, [state.snapshot, state.progress, heldStock]);
};

export const LandingPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const legacyProfileTarget = legacyProfileRedirectTarget(location);
  const { index, loading } = useSiteIndex();
  const coverage = useMemo(() => summarizeSearchCoverage(index), [index]);
  const resume = useResumeCard();
  const coverageTotal = coverage.items + coverage.greenhouse + coverage.shards;
  const coverageAreas = [
    { label: "Items", value: coverage.items, to: "/recipes", tone: "items", Icon: PackageSearch },
    { label: "Greenhouse", value: coverage.greenhouse, to: "/greenhouse", tone: "greenhouse", Icon: Sprout },
    { label: "Shards", value: coverage.shards, to: "/shards", tone: "shards", Icon: Gem },
  ];

  const [alert, setAlert] = useState(false);
  const [thinking, setThinking] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);

  /*
   * The one uncertain number in the whole saying pipeline, kept at the edge
   * where it belongs. Everything downstream of this is a pure function of it,
   * so a sentence someone reports can be reproduced from its seed. Read once,
   * in a state initialiser, so it survives re-renders; written nowhere.
   */
  const [visit] = useState(() => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  const [focuses, setFocuses] = useState(0);

  const placeholder = useMemo(
    () => pickSaying(WONDER_SAYINGS, (visit + focuses * 0x9e3779b1) >>> 0),
    [visit, focuses]
  );

  /* Stable identities: the search reports these from an effect, so a new
     function every render would put it in a loop. */
  const onFocusChange = useCallback((v: boolean) => {
    setAlert(v);
    /* Only on the way in. The search reports `false` once at mount, and
       counting that would burn a saying nobody saw. */
    if (v) setFocuses((n) => n + 1);
  }, []);
  const onBusyChange = useCallback((v: boolean) => setThinking(v), []);

  if (legacyProfileTarget !== null) {
    return <Navigate to={legacyProfileTarget} replace />;
  }

  return (
    <div className="sd-toolkit home-toolkit">
      <section
        className="home-toolkit-workspace"
        aria-label="Skydex toolkit"
      >
        <div className="home-toolkit-wonder" aria-label="Skydex companion">
          <VectorMark
            alert={alert}
            thinking={thinking}
            attentionTargetRef={searchRef}
            ambient
            className="aspect-[35/12] w-[13rem] overflow-visible sm:w-[16rem] lg:w-[18rem]"
          />
        </div>

        <div ref={searchRef} className="home-toolkit-search">
          <UniversalSearch
            index={index}
            indexLoading={loading}
            placeholder={placeholder}
            onFocusChange={onFocusChange}
            onBusyChange={onBusyChange}
            className="w-full"
          />
        </div>

        <section className="home-profile-viewer sd-toolkit-glass" aria-labelledby="home-profile-viewer-title">
          <div className="home-profile-viewer-copy">
            <span className="home-profile-viewer-icon" aria-hidden><CircleUserRound /></span>
            <span>
              <small>Profile Viewer</small>
              <strong id="home-profile-viewer-title">View another player</strong>
            </span>
          </div>
          <ProfileLookupForm onSubmit={(player) => navigate(`/pv/${encodeURIComponent(player)}`)} compact />
        </section>

        {resume && (
          <Link to="/greenhouse#planner" className={"home-toolkit-resume sd-toolkit-glass " + FOCUS}>
            <span className="home-toolkit-eyebrow">Current grind</span>
            <span className="home-toolkit-resume-title">
              <strong>{resume.label}</strong>
              <b className={NUM}>{resume.pct}%</b>
            </span>
            <Bar done={resume.done} owned={resume.owned} total={resume.total} />
            <span className="home-toolkit-resume-meta">
              {resume.secondsLeft !== null && (
                <span className={NUM}>
                  {resume.secondsLeft > 0 ? "~" + formatDuration(resume.secondsLeft) + " left" : "done"}
                </span>
              )}
              <span>
                Continue in the Planner
                <ArrowRight aria-hidden />
              </span>
            </span>
          </Link>
        )}

        <section className="home-toolkit-library sd-toolkit-glass" aria-label="Search coverage" aria-busy={loading}>
          <header>
            <div>
              <span className="home-toolkit-eyebrow">Toolkit index</span>
              <h2>Search coverage</h2>
            </div>
            <strong className={NUM}>
              {loading ? "Indexing…" : coverageTotal.toLocaleString() + " searchable"}
            </strong>
          </header>

          <div className="home-toolkit-areas">
            {coverageAreas.map(({ label, value, to, tone, Icon }) => (
              <Link
                key={label}
                to={to}
                data-home-area={tone}
                className={"home-toolkit-area " + FOCUS}
              >
                <span className="home-toolkit-area-icon" aria-hidden>
                  <Icon />
                </span>
                <span className="home-toolkit-area-copy">
                  <strong>{label}</strong>
                  <small>Searchable entries</small>
                </span>
                <span className={"home-toolkit-area-count " + NUM}>
                  {loading ? "…" : value.toLocaleString()}
                </span>
                <ArrowRight className="home-toolkit-area-arrow" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
};

export default LandingPage;
