import React, { useMemo } from "react";
import { isRouteErrorResponse, useLocation, useRevalidator, useRouteError } from "react-router-dom";
import FailureSurface from "./FailureSurface";
import { createFailureModel, createNotFoundModel, isLikelyNetworkError, isRouteResponseLike } from "./failureModel";

export const RouteErrorBoundary: React.FC = () => {
  const error = useRouteError();
  const location = useLocation();
  const revalidator = useRevalidator();
  const route = location.pathname + location.search;
  const failure = useMemo(
    () =>
      createFailureModel({
        error,
        route,
        source: "route",
        phase: isRouteErrorResponse(error) || isRouteResponseLike(error) || isLikelyNetworkError(error) ? "data" : undefined,
      }),
    [error, route]
  );

  const retry = () => {
    if (failure.retryMode === "revalidate") {
      revalidator.revalidate();
      return;
    }
    if (typeof window !== "undefined") window.location.reload();
  };

  return <FailureSurface failure={failure} onRetry={retry} />;
};

export const NotFoundRoute: React.FC = () => {
  const location = useLocation();
  const failure = useMemo(() => createNotFoundModel(location.pathname + location.search), [location.pathname, location.search]);
  return <FailureSurface failure={failure} />;
};

export default RouteErrorBoundary;
