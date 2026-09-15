import { useState, useEffect } from "react";
import { DataService } from "../services/dataService";
import type { FusionData } from "../utilities";

export const useFusionData = () => {
  const [fusionData, setFusionData] = useState<FusionData | null>(null);
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    const loadData = async () => {
      /* DataService owns the one fusion-data.json fetch and parse. A second
       * main-thread JSON.parse of the 7.5 MB document here showed up as its
       * own long task on every page that mounted this hook. */
      const dataService = DataService.getInstance();
      try {
        setLoading(true);
        const [fusion, defaultRates] = await Promise.all([
          dataService.loadFusionData(),
          dataService.loadDefaultRates().catch(() => ({})),
        ]);
        if (!live) return;
        setFusionData(fusion);
        setRates(defaultRates);
      } catch (error) {
        console.error("Failed to load fusion data:", error);
        if (!live) return;
        setFusionData(null);
        setRates(null);
      } finally {
        if (live) setLoading(false);
      }
    };
    loadData().catch(console.error);
    return () => {
      live = false;
    };
  }, []);

  return { fusionData, rates, loading };
};
