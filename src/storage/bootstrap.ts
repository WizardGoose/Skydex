import { migrateBrandStorage } from "./migrateBrandStorage";

// Imported before the app so even module-level readers see migrated values.
for (const name of ["localStorage", "sessionStorage"] as const) {
  try {
    migrateBrandStorage(window[name]);
  } catch (error) {
    // Blocked storage or quota errors must leave the original data intact.
    console.warn("Skydex could not finish migrating saved browser data", error);
  }
}
