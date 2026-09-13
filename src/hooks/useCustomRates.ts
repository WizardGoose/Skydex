import { useCallback, useEffect, useState } from "react";
import { DataService } from "../services";
import { withCustomRate } from "./customRatesModel";

const CUSTOM_RATES_KEY = "customRates";
const CUSTOM_RATES_EVENT = "skydex:custom-rates-change";

const readStoredRates = (): Record<string, number | undefined> => {
  try {
    const stored = localStorage.getItem(CUSTOM_RATES_KEY);
    return stored ? JSON.parse(stored) as Record<string, number | undefined> : {};
  } catch {
    return {};
  }
};

export const useCustomRates = () => {
  const [customRates, setCustomRates] = useState<Record<string, number | undefined>>({});
  const [defaultRates, setDefaultRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRates = async () => {
      try {
        setLoading(true);
        const dataService = DataService.getInstance();
        const defaults = await dataService.loadDefaultRates();
        setDefaultRates(defaults);

        // Load custom rates from localStorage
        setCustomRates(readStoredRates());
      } catch (error) {
        console.error("Failed to load rates:", error);
        setCustomRates({});
        setDefaultRates({});
      } finally {
        setLoading(false);
      }
    };

    loadRates().catch(console.error);
  }, []);

  useEffect(() => {
    const sync = () => setCustomRates(readStoredRates());
    window.addEventListener(CUSTOM_RATES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CUSTOM_RATES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const updateRate = useCallback((shardId: string, rate: number | undefined) => {
    setCustomRates((current) => {
      const newRates = withCustomRate(current, shardId, rate);
      const customChanges = Object.fromEntries(
        Object.entries(newRates).filter(
          ([id, value]) => value !== undefined && value !== defaultRates[id],
        ),
      );

      try {
        if (Object.keys(customChanges).length > 0) {
          localStorage.setItem(CUSTOM_RATES_KEY, JSON.stringify(customChanges));
        } else {
          localStorage.removeItem(CUSTOM_RATES_KEY);
        }
      } catch {
        // React state above already holds the new rate, so this session behaves
        // correctly either way; only carrying it to the next visit is lost.
      }
      return newRates;
    });
    queueMicrotask(() => window.dispatchEvent(new Event(CUSTOM_RATES_EVENT)));
  }, [defaultRates]);

  const resetRates = useCallback(() => {
    setCustomRates({});
    localStorage.removeItem(CUSTOM_RATES_KEY);
    window.dispatchEvent(new Event(CUSTOM_RATES_EVENT));
  }, []);

  return {
    customRates,
    defaultRates,
    loading,
    updateRate,
    resetRates,
  };
};
