const PRODUCTION_API_ORIGIN = "https://api.skydex.ca";

export const profileApiUrl = (path: string): URL => {
  // Phone previews use the development server's narrow relay. Published builds
  // always contact the same hosted service directly; no personal key is needed.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return new URL(`/__skydex-profile${path}`, window.location.origin);
  }
  return new URL(path, PRODUCTION_API_ORIGIN);
};
