import React, { useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Coins,
  Flame,
  Hammer,
  Landmark,
  LockKeyhole,
  MapPin,
  PackageSearch,
  ShoppingCart,
  Sparkles,
  Store,
  Swords,
  X,
} from "lucide-react";
import type { AcquisitionRoute, AcquisitionRouteKind, AcquisitionRouteStatus } from "./acquisition";
import { BADGE, COL, FOCUS, LABEL, NUM, SectionHead } from "../ui/kit";

const ICON: Record<AcquisitionRouteKind, React.ComponentType<{ className?: string }>> = {
  craft: Hammer,
  forge: Flame,
  shop: Store,
  market: ShoppingCart,
  collection: Sparkles,
  quest: MapPin,
  drop: Swords,
  event: CalendarClock,
  auction: Landmark,
  wiki: PackageSearch,
  unavailable: X,
};

const ICON_TONE: Record<AcquisitionRouteKind, string> = {
  craft: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  forge: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  shop: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  market: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  collection: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  quest: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  drop: "border-red-500/30 bg-red-500/10 text-red-300",
  event: "border-pink-500/30 bg-pink-500/10 text-pink-300",
  auction: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  wiki: "border-white/12 bg-white/6 text-slate-400",
  unavailable: "border-red-500/25 bg-red-500/8 text-red-300",
};

const STATUS_TONE: Record<AcquisitionRouteStatus, string> = {
  ready: "border-emerald-500/35 bg-emerald-500/12 text-emerald-300",
  available: "border-sky-500/35 bg-sky-500/12 text-sky-300",
  conditional: "border-amber-500/35 bg-amber-500/12 text-amber-300",
  missing: "border-orange-500/35 bg-orange-500/12 text-orange-300",
  locked: "border-red-500/35 bg-red-500/12 text-red-300",
  unknown: "border-white/12 bg-white/6 text-slate-400",
  unavailable: "border-red-500/25 bg-red-500/8 text-red-300",
};

const GATE_ICON = {
  met: Check,
  unmet: LockKeyhole,
  unknown: CircleHelp,
} as const;

const GATE_TONE = {
  met: "text-emerald-300",
  unmet: "text-red-300",
  unknown: "text-slate-400",
} as const;

export const RouteStatusBadge: React.FC<{ route: Pick<AcquisitionRoute, "status" | "statusLabel"> }> = ({ route }) => (
  <span className={`${BADGE} rounded-sm border px-1.5 py-0.5 ${STATUS_TONE[route.status]}`}>{route.statusLabel}</span>
);

const RoutePath: React.FC<{ route: AcquisitionRoute; compact?: boolean }> = ({ route, compact = false }) => (
  route.path.length > 0 ? (
    <div className={compact ? "recipes-route-path is-compact" : "recipes-route-path"} aria-label="Route">
      {route.path.map((part, index) => (
        <React.Fragment key={`${route.id}-${part}-${index}`}>
          {index > 0 && <ChevronRight aria-hidden="true" />}
          <span>{part}</span>
        </React.Fragment>
      ))}
    </div>
  ) : null
);

const RouteFacts: React.FC<{ route: AcquisitionRoute }> = ({ route }) => (
  route.cost || route.duration ? (
    <div className="recipes-route-facts">
      {route.cost && (
        <span><Coins aria-hidden="true" /><strong className={NUM}>{route.cost}</strong></span>
      )}
      {route.duration && (
        <span><CalendarClock aria-hidden="true" /><strong className={NUM}>{route.duration}</strong></span>
      )}
    </div>
  ) : null
);

const RouteGates: React.FC<{ route: AcquisitionRoute }> = ({ route }) => (
  route.gates.length > 0 ? (
    <div className="recipes-route-gates">
      <span className={COL}>Profile checks</span>
      {route.gates.map((gate, index) => {
        const GateIcon = GATE_ICON[gate.state];
        return (
          <div key={`${route.id}-${gate.label}-${index}`}>
            <GateIcon className={GATE_TONE[gate.state]} aria-hidden="true" />
            <span>{gate.label}</span>
            <small>{gate.detail}</small>
          </div>
        );
      })}
    </div>
  ) : null
);

export const RecommendedAcquisitionRoute: React.FC<{
  route: AcquisitionRoute | null;
  loadingWiki: boolean;
  alreadyOwned?: boolean;
  heldDetail?: string;
}> = ({ route, loadingWiki, alreadyOwned = false, heldDetail }) => {
  if (alreadyOwned) {
    return (
      <section className="recipes-recommended-route is-complete" aria-labelledby="recipes-route-title">
        <div className="recipes-route-kicker"><span>Best actionable route</span><RouteStatusBadge route={{ status: "ready", statusLabel: "Ready now" }} /></div>
        <div className="recipes-route-lead">
          <span className="recipes-route-icon is-complete"><Check aria-hidden="true" /></span>
          <div>
            <h2 id="recipes-route-title">Use what you already have</h2>
            <p>{heldDetail ?? "The selected profile already covers this target."}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!route) {
    return (
      <section className="recipes-recommended-route" aria-labelledby="recipes-route-title">
        <div className="recipes-route-kicker">
          <span>Best actionable route</span>
          {loadingWiki && <small role="status">checking sources…</small>}
        </div>
        <p className="recipes-route-empty" id="recipes-route-title">
          {loadingWiki ? "Resolving the route from the available game data." : "No proven route is available yet."}
        </p>
      </section>
    );
  }

  const Icon = ICON[route.kind];
  return (
    <section className="recipes-recommended-route" aria-labelledby="recipes-route-title">
      <div className="recipes-route-kicker">
        <span>Best actionable route</span>
        <RouteStatusBadge route={route} />
      </div>
      <div className="recipes-route-lead">
        <span className={`recipes-route-icon ${ICON_TONE[route.kind]}`}><Icon aria-hidden="true" /></span>
        <div>
          <h2 id="recipes-route-title">{route.label}</h2>
          {route.detail && <p>{route.detail}</p>}
        </div>
      </div>
      <RoutePath route={route} />
      <RouteFacts route={route} />
      <RouteGates route={route} />
    </section>
  );
};

export const AlternativeAcquisitionRoutes: React.FC<{
  itemKey: string;
  routes: readonly AcquisitionRoute[];
}> = ({ itemKey, routes }) => {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => setOpen(null), [itemKey, routes]);

  return (
    <section className="recipes-alternative-routes" aria-labelledby="recipes-alternatives-title">
      <div className="recipes-support-heading">
        <div><span>Alternatives</span><h2 id="recipes-alternatives-title">Other ways</h2></div>
        <small className={NUM}>{routes.length}</small>
      </div>
      {routes.length > 0 ? (
        <div className="recipes-alternative-list">
          {routes.map((route) => {
            const Icon = ICON[route.kind];
            const expanded = open === route.id;
            return (
              <div key={route.id} className={expanded ? "is-open" : undefined}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : route.id)}
                  className={FOCUS}
                >
                  <span className={`recipes-route-icon ${ICON_TONE[route.kind]}`}><Icon aria-hidden="true" /></span>
                  <span className="recipes-alternative-copy">
                    <strong>{route.label}</strong>
                    {!expanded && <RoutePath route={route} compact />}
                  </span>
                  <RouteStatusBadge route={route} />
                  <ChevronDown aria-hidden="true" />
                </button>
                {expanded && (
                  <div className="recipes-alternative-detail">
                    <RoutePath route={route} />
                    {route.detail && <p>{route.detail}</p>}
                    <RouteFacts route={route} />
                    <RouteGates route={route} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="recipes-route-empty">No other proven route is currently available.</p>
      )}
    </section>
  );
};

/** Kept as a small compatibility composite for callers that still need one route section. */
export const AcquisitionRoutes: React.FC<{
  itemKey: string;
  routes: readonly AcquisitionRoute[];
  loadingWiki: boolean;
}> = ({ itemKey, routes, loadingWiki }) => (
  <section className="border-b border-white/8">
    <SectionHead title="Ways to get it" />
    <RecommendedAcquisitionRoute route={routes[0] ?? null} loadingWiki={loadingWiki} />
    <AlternativeAcquisitionRoutes itemKey={itemKey} routes={routes.slice(1)} />
    {routes.length === 0 && !loadingWiki && <p className={`${LABEL} px-3 pb-3 text-slate-500`}>No route data yet.</p>}
  </section>
);
