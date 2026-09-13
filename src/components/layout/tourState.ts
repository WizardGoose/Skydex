export const WELCOME_KEY = "skydex.welcome.v1";
export const REPLAY_EVENT = "skydex:welcome-replay";
export const TOUR_QUERY_KEY = "tour";

export const replayTour = () => window.dispatchEvent(new Event(REPLAY_EVENT));

export const isTourRequested = (search: string): boolean =>
  new URLSearchParams(search).get(TOUR_QUERY_KEY) === "1";

export const closeTourLocation = (location: { pathname: string; search: string; hash: string }) => {
  const params = new URLSearchParams(location.search);
  params.delete(TOUR_QUERY_KEY);
  const search = params.toString();
  return { pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash };
};

export const hasSeenTour = (): boolean => {
  try {
    return localStorage.getItem(WELCOME_KEY) !== null;
  } catch {
    /* No storage means every visit would be the first; a tour on every visit
       is worse than none. */
    return true;
  }
};

export const markTourSeen = (): void => {
  try {
    localStorage.setItem(WELCOME_KEY, JSON.stringify({ v: 1, seenAt: Date.now() }));
  } catch {
    /* Nothing to do: the invitation may show again next time. */
  }
};
