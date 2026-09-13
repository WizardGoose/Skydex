import App from "../App";

// The static-host handoff is restored before App creates its router.
export const AppWithRedirect = () => {
  return <App />;
};
