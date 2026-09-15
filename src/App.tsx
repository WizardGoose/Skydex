import { createBrowserRouter, RouterProvider, Navigate, useLocation, useParams } from "react-router-dom";
import React, { Suspense, lazy } from "react";
import { Layout } from "./components/layout/Layout";
import { CalculatorStateProvider } from "./context/CalculatorStateContext";
import { RecipeStateProvider } from "./context/RecipeStateContext";
import { usePageTitle } from "./hooks/usePageTitle";
import { ToastProvider } from "./components/ui/Toast";
import { NotFoundRoute, RouteErrorBoundary } from "./components/errors/RouteErrorBoundary";
import { legacyGreenhouseHref, sharedDesignerLocation } from "./greenhouse/route";
import { legacySettingsLocation } from "./components/layout/settingsRoute";
import { preservedRedirectTarget } from "./routeRedirect";
import { WebMcpBridge } from "./webmcp/WebMcpBridge";
import { restoreStaticRoute } from "./staticRouteRestore";

const LandingPage = lazy(() => import("./pages/LandingPage").then((module) => ({ default: module.LandingPage })));
const ItemsPage = lazy(() => import("./pages/ItemsPage").then((module) => ({ default: module.ItemsPage })));
const StoragePage = lazy(() => import("./pages/StoragePage").then((module) => ({ default: module.StoragePage })));
const ProfilePage = lazy(() => import("./profile-view/ProfileView").then((module) => ({ default: module.ProfilePage })));
const ProfileViewerPage = lazy(() => import("./pages/ProfileViewerPage").then((module) => ({ default: module.ProfileViewerPage })));
const ForgePage = lazy(() => import("./pages/ForgePage").then((module) => ({ default: module.ForgePage })));
const GreenhouseShell = lazy(() => import("./greenhouse/GreenhouseShell").then((module) => ({ default: module.GreenhouseShell })));
/*
 * GreenhouseHashRoute is the index child under the already-lazy
 * GreenhouseShell. A static import here pulled GreenhouseWorkspace and its
 * whole island/networth/inventory graph into the startup chunk, so it is
 * lazy too: the greenhouse machinery now downloads only on /greenhouse.
 */
const GreenhouseHashRoute = lazy(() => import("./greenhouse/GreenhouseHashRoute").then((module) => ({ default: module.GreenhouseHashRoute })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
/*
 * Two things are called "settings" in this codebase and only one of them is a
 * settings screen. `SettingsPage` above is the Shards workspace, inherited
 * under that name from upstream and routed at `/shards`. `SiteSettingsPage` is
 * the real one, at `/settings`.
 */
const RecipePage = lazy(() => import("./pages/RecipePage"));
const FusionGraphPage = lazy(() => import("./pages/FusionGraphPage").then((module) => ({ default: module.FusionGraphPage })));
const GuidePage = lazy(() => import("./pages/GuidePage").then((module) => ({ default: module.GuidePage })));
const AboutPage = lazy(() => import("./pages/AboutPage").then((module) => ({ default: module.AboutPage })));

const ContactPage = lazy(() => import("./pages/ContactPage").then((module) => ({ default: module.ContactPage })));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));

/**
 * Route-level fallback. Uses the site accent rather than the violet it was
 * forked with, so a page in flight looks like part of this app instead of a
 * stray spinner from somewhere else.
 */
const LoadingSpinner = () => (
  <div
    className="flex min-h-[calc(100dvh-var(--sd-chrome-h))] items-center justify-center"
    role="status"
    aria-label="Loading page"
  >
    <div
      aria-hidden="true"
      className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500/20 border-t-sky-500"
    />
  </div>
);

const LegacyRedirect: React.FC<{ pathname: string }> = ({ pathname }) => {
  const location = useLocation();
  return <Navigate to={preservedRedirectTarget(pathname, location)} replace />;
};

const AccessoriesRedirect: React.FC = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("tab", "accessories");
  return (
    <Navigate
      to={{
        pathname: "/profile",
        search: "?" + params.toString(),
        hash: location.hash,
      }}
      replace
    />
  );
};

const AppWithProviders = () => {
  return (
    <ToastProvider>
      <WebMcpBridge />
      <Layout />
    </ToastProvider>
  );
};

const ProtectedLayout = () => {
  usePageTitle(); // Update page title based on route

  return (
    <CalculatorStateProvider>
      <RecipeStateProvider>
        <AppWithProviders />
      </RecipeStateProvider>
    </CalculatorStateProvider>
  );
};

const LegacyGreenhouseRedirect = () => {
  const location = useLocation();
  const target = legacyGreenhouseHref(location.pathname, location.search);
  return <Navigate to={target ?? "/greenhouse"} replace />;
};

const LegacySettingsRedirect = () => {
  const location = useLocation();
  return <Navigate to={legacySettingsLocation(location)} replace />;
};

const SharedDesignerRedirect = () => {
  const { layoutCode = "" } = useParams();
  return <Navigate to={sharedDesignerLocation(layoutCode)} replace />;
};

restoreStaticRoute(window);

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <ProtectedLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        /*
         * "/" is the landing page AND the grind dashboard, one page:
         * the W.W identity on top, the grind panels underneath, so
         * opening the site IS opening "what was I working on". The old
         * `/dashboard` address keeps working for bookmarks and the search
         * index, but it is a redirect rather than a second copy of the page.
         */
        {
          index: true,
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <LandingPage />
            </Suspense>
          ),
        },
        {
          path: "dashboard",
          element: <Navigate to="/" replace />,
        },
        {
          path: "greenhouse",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <GreenhouseShell />
            </Suspense>
          ),
          children: [
            {
              index: true,
              element: (
                <Suspense fallback={<LoadingSpinner />}>
                  <GreenhouseHashRoute />
                </Suspense>
              ),
            },
            {
              path: "designer",
              element: <LegacyGreenhouseRedirect />,
            },
            {
              path: "planner",
              element: <LegacyGreenhouseRedirect />,
            },
            {
              path: "share/:layoutCode",
              element: <SharedDesignerRedirect />,
            },
          ],
        },
        {
          path: "recipes",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <ItemsPage />
            </Suspense>
          ),
        },
        {
          path: "crafting",
          element: <LegacyRedirect pathname="/recipes" />,
        },
        {
          path: "items",
          element: <LegacyRedirect pathname="/recipes" />,
        },
        {
          /*
           * Accessories lives inside the profile page now, a tab in Profile
           * rather than a section of its own, so the old address redirects
           * the same way `/dashboard` does above: every bookmark and shared
           * link keeps working, and there is exactly one place the content
           * renders.
           */
          path: "accessories",
          element: <AccessoriesRedirect />,
        },
        {
          path: "profile",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <ProfilePage />
            </Suspense>
          ),
        },
        {
          path: "storage",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <StoragePage />
            </Suspense>
          ),
        },
        {
          path: "pv",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <ProfileViewerPage />
            </Suspense>
          ),
        },
        {
          path: "pv/:player",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <ProfileViewerPage />
            </Suspense>
          ),
        },
        {
          path: "island",
          element: <LegacyRedirect pathname="/storage" />,
        },
        {
          path: "forge",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <ForgePage />
            </Suspense>
          ),
        },
        {
          path: "fusion",
          element: <LegacyRedirect pathname="/shards" />,
        },
        {
          path: "shards",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <SettingsPage />
            </Suspense>
          ),
        },
        {
          path: "settings",
          element: <LegacySettingsRedirect />,
        },
        /* The Tour Lab exists on dev builds only: the condition is statically
           false in production, so the route, the page, and its chunk are all
           dead-branch eliminated rather than merely hidden. */
        ...(import.meta.env.DEV
          ? [
              {
                path: "tour-lab",
                element: (
                  <Suspense fallback={<LoadingSpinner />}>
                    {React.createElement(lazy(() => import("./pages/TourLabPage")))}
                  </Suspense>
                ),
              },
              {
                path: "wonder-lab",
                element: (
                  <Suspense fallback={<LoadingSpinner />}>
                    {React.createElement(lazy(() => import("./pages/WonderLabPage")))}
                  </Suspense>
                ),
              },
            ]
          : []),
        {
          path: "shard-recipes",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <RecipePage />
            </Suspense>
          ),
        },
        {
          path: "fusion-lines",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <FusionGraphPage />
            </Suspense>
          ),
        },
        {
          path: "guide",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <GuidePage />
            </Suspense>
          ),
        },
        {
          path: "about",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <AboutPage />
            </Suspense>
          ),
        },
        {
          path: "contact",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <ContactPage />
            </Suspense>
          ),
        },
        {
          path: "privacy-policy",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <PrivacyPolicy />
            </Suspense>
          ),
        },
        {
          path: "client-privacy-policy",
          element: (
            <Suspense fallback={<LoadingSpinner />}>
              <PrivacyPolicy />
            </Suspense>
          ),
        },
      ],
    },
    {
      path: "*",
      element: <NotFoundRoute />,
    },
  ],
  {
    basename: "",
  }
);

const App = () => {
  return <RouterProvider router={router} />;
};

export default App;
