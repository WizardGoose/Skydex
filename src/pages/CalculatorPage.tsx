import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Menu, X, Package, Sparkles, Calculator } from "lucide-react";
import { CalculatorForm, CalculationResults, InventoryCalculationResults } from "../components";
import { InventoryManagementModal } from "../components";
import { useCustomRates, useCalculatorState } from "../hooks";
import { useProfile } from "../profile/useProfile";
import { SplitPage, BTN_QUIET, BTN_PRIMARY, PANEL, PageHeader, EmptyState, Figure, Bar, COL } from "../ui/kit";
import { InventoryPanel } from "../components/common/InventoryPanel";
import { DataService, InvCalculationService, CalculationService } from "../services";
import type { CalculationFormData } from "../schemas";
import type { CalculationResult, CalculationParams, RecipeOverride, Data, InventoryCalculationResult } from "../types/types";
import { loadInventory, saveInventory, loadOwnedAttributes, saveOwnedAttributes, loadDisabledShards, saveDisabledShards } from "../utilities";
import { calculateOptimalPathWithWorker, calculateMultipleShardsParallel, type WorkerProgress } from "../services/workerCalculationService";
import { MAX_QUANTITIES } from "../constants";

const INVENTORY_ENABLED_KEY = "skyshards_use_inventory";

// The shared holdings drawer inspects raw profile containers; the legacy shard editor keeps its typed index separately.

const CalculatorFormWithContext: React.FC<{
  onSubmit: (data: CalculationFormData, setForm: (data: CalculationFormData) => void) => void;
  inventory?: Map<string, number>;
  ownedAttributes?: Map<string, number>;
  useInventory: boolean;
  onUseInventoryChange: (enabled: boolean) => void;
}> = ({ onSubmit, inventory, ownedAttributes, useInventory, onUseInventoryChange }) => {
  const { setForm } = useCalculatorState();
  const stableOnSubmit = useCallback((data: CalculationFormData) => onSubmit(data, setForm), [onSubmit, setForm]);
  return (
    <CalculatorForm
      onSubmit={stableOnSubmit}
      inventory={inventory}
      ownedAttributes={ownedAttributes}
      useInventory={useInventory}
      onUseInventoryChange={onUseInventoryChange}
    />
  );
};

// Shared calculation logic (non-inventory mode)
const performCalculation = async (
  formData: CalculationFormData,
  customRates: { [shardId: string]: number | undefined },
  recipeOverrides: RecipeOverride[] = [],
  callbacks: {
    setTargetShardName: (name: string) => void;
    setCurrentShardKey: (key: string) => void;
    setCurrentQuantity: (quantity: number) => void;
    setCurrentParams: (params: CalculationParams) => void;
    setResult: (result: CalculationResult | null) => void;
    setCalculationData: (data: Data | null) => void;
    setCalculating: (v: boolean) => void;
    setProgress: (p: WorkerProgress | null) => void;
    setMaterialShardResults: (results: Map<string, CalculationResult>) => void;
  }
): Promise<(() => void) | null> => {
  let isCancelled = false;

  const checkCancelled = () => isCancelled;

  const handleError = (err: unknown) => {
    if (!isCancelled && err instanceof Error && err.message !== "Worker calculation failed") {
      console.error("Calculation error:", err);
    }
  };

  const cleanup = () => {
    if (!isCancelled) {
      callbacks.setProgress(null);
      callbacks.setCalculating(false);
    }
  };

  // Handle Materials Only mode
  if (formData.materialsOnly) {
    if (!formData.selectedShardKeys || formData.selectedShardKeys.length === 0) {
      return null;
    }

    const dataService = DataService.getInstance();
    const filteredCustomRates = Object.fromEntries(
      Object.entries(customRates).filter(([, v]) => v !== undefined)
    ) as { [shardId: string]: number };

    const params = {
      customRates: formData.ironManView ? filteredCustomRates : await dataService.loadShardCosts(formData.instantBuyPrices),
      hunterFortune: formData.hunterFortune,
      excludeChameleon: formData.excludeChameleon,
      frogBonus: formData.frogBonus,
      newtLevel: formData.newtLevel,
      salamanderLevel: formData.salamanderLevel,
      lizardKingLevel: formData.lizardKingLevel,
      leviathanLevel: formData.leviathanLevel,
      pythonLevel: formData.pythonLevel,
      kingCobraLevel: formData.kingCobraLevel,
      seaSerpentLevel: formData.seaSerpentLevel,
      tiamatLevel: formData.tiamatLevel,
      crocodileLevel: formData.crocodileLevel,
      kuudraTier: formData.kuudraTier,
      moneyPerHour: formData.moneyPerHour,
      customKuudraTime: formData.customKuudraTime,
      kuudraTimeSeconds: formData.kuudraTimeSeconds,
      noWoodenBait: formData.noWoodenBait,
      rateAsCoinValue: !formData.ironManView,
      craftPenalty: formData.craftPenalty,
    };

    callbacks.setCurrentParams(params);
    callbacks.setCalculating(true);
    callbacks.setProgress(null);

    const shardQuantitiesMap = new Map<string, number>();
    if (formData.shardQuantities) {
      formData.shardQuantities.forEach((item: { shard?: { key: string }; quantity?: number }) => {
        if (item.shard && item.quantity) {
          shardQuantitiesMap.set(item.shard.key, item.quantity);
        }
      });
    }

    const targets = formData.selectedShardKeys.map(shardKey => ({
      shard: shardKey,
      quantity: shardQuantitiesMap.get(shardKey) || 1
    }));

    const { promise, cancel: workerCancel } = calculateMultipleShardsParallel(
      targets,
      params,
      recipeOverrides,
      (p) => !checkCancelled() && callbacks.setProgress(p)
    );

    promise
      .then(results => {
        if (checkCancelled()) return;

        const combinedMaterials: Record<string, number> = {};
        let totalTime = 0;
        let totalCraftTime = 0;
        let totalCraftsNeeded = 0;

        // Retain each shard's full result (incl. its fusion tree) so individual
        // trees can be viewed without recalculating. Order matches `targets`.
        const perShardResults = new Map<string, CalculationResult>();

        results.forEach((result, index) => {
          if (result.totalQuantities) {
            result.totalQuantities.forEach((quantity, matKey) => {
              combinedMaterials[matKey] = (combinedMaterials[matKey] || 0) + quantity;
            });
          }

          totalTime += result.totalTime || 0;
          totalCraftTime += result.craftTime || 0;
          totalCraftsNeeded += result.craftsNeeded || 0;

          const shardKey = targets[index]?.shard;
          if (shardKey) {
            perShardResults.set(shardKey, result);
          }
        });

        callbacks.setMaterialShardResults(perShardResults);

        const materialQuantities = new Map<string, number>(Object.entries(combinedMaterials));
        const selectedShardKeys = formData.selectedShardKeys || [];
        const totalShardsRequested = Array.from(shardQuantitiesMap.values()).reduce((sum, qty) => sum + qty, 0) || selectedShardKeys.length;

        // Use the materialBreakdown from the first result since the worker service already merged them globally
        const globalMaterialBreakdown = results.length > 0 ? results[0].materialBreakdown : undefined;

        const combinedResult: CalculationResult = {
          timePerShard: totalShardsRequested > 0 ? totalTime / totalShardsRequested : 0,
          totalTime,
          totalShardsProduced: totalShardsRequested,
          craftsNeeded: totalCraftsNeeded,
          totalQuantities: materialQuantities,
          craftTime: totalCraftTime,
          tree: null,
          materialBreakdown: globalMaterialBreakdown,
        };

        callbacks.setResult(combinedResult);

        return import("../services/calculationService").then(({ CalculationService }) => {
          if (checkCancelled()) return;
          const service = CalculationService.getInstance();
          return service.parseData(params);
        }).then(data => {
          if (checkCancelled() || !data) return;
          callbacks.setCalculationData(data);
          callbacks.setTargetShardName(`${selectedShardKeys.length} Shards`);
          callbacks.setCurrentShardKey(selectedShardKeys[0] || "");
          callbacks.setCurrentQuantity(selectedShardKeys.length);
        });
      })
      .catch(handleError)
      .finally(cleanup);

    return () => {
      isCancelled = true;
      workerCancel();
    };
  }

  // Single shard logic
  if (!formData.shard || formData.shard.trim() === "") {
    return null;
  }

  const dataService = DataService.getInstance();
  const nameToKeyMap = await dataService.getShardNameToKeyMap();
  const shardKey = nameToKeyMap[formData.shard.toLowerCase()];

  if (!shardKey) {
    return null;
  }

  callbacks.setTargetShardName(formData.shard);
  callbacks.setCurrentShardKey(shardKey);
  callbacks.setCurrentQuantity(formData.quantity);

  const filteredCustomRates = Object.fromEntries(
    Object.entries(customRates).filter(([, v]) => v !== undefined)
  ) as { [shardId: string]: number };

  const params = {
    customRates: formData.ironManView ? filteredCustomRates : await dataService.loadShardCosts(formData.instantBuyPrices),
    hunterFortune: formData.hunterFortune,
    excludeChameleon: formData.excludeChameleon,
    frogBonus: formData.frogBonus,
    newtLevel: formData.newtLevel,
    salamanderLevel: formData.salamanderLevel,
    lizardKingLevel: formData.lizardKingLevel,
    leviathanLevel: formData.leviathanLevel,
    pythonLevel: formData.pythonLevel,
    kingCobraLevel: formData.kingCobraLevel,
    seaSerpentLevel: formData.seaSerpentLevel,
    tiamatLevel: formData.tiamatLevel,
    crocodileLevel: formData.crocodileLevel,
    kuudraTier: formData.kuudraTier,
    moneyPerHour: formData.moneyPerHour,
    customKuudraTime: formData.customKuudraTime,
    kuudraTimeSeconds: formData.kuudraTimeSeconds,
    noWoodenBait: formData.noWoodenBait,
    rateAsCoinValue: !formData.ironManView,
    craftPenalty: formData.craftPenalty,
  };

  callbacks.setCurrentParams(params);
  callbacks.setResult(null);
  callbacks.setCalculationData(null);
  callbacks.setMaterialShardResults(new Map());
  callbacks.setCalculating(true);
  callbacks.setProgress({ phase: "parsing", progress: 0, message: "Starting..." });

  const { promise, cancel: workerCancel } = calculateOptimalPathWithWorker(
    shardKey,
    formData.quantity,
    params,
    recipeOverrides,
    (p) => !checkCancelled() && callbacks.setProgress(p)
  );

  promise
    .then(calculationResult => {
      if (checkCancelled()) return;
      callbacks.setResult(calculationResult);

      return import("../services/calculationService").then(({ CalculationService }) => {
        if (checkCancelled()) return;
        const service = CalculationService.getInstance();
        return service.parseData(params);
      }).then(data => {
        if (checkCancelled() || !data) return;
        callbacks.setCalculationData(data);
      });
    })
    .catch(handleError)
    .finally(cleanup);

  return () => {
    isCancelled = true;
    workerCancel();
  };
};

const CalculatorPageContent: React.FC = () => {
  const { result, setResult, calculationData, setCalculationData, targetShardName, setTargetShardName, form, setForm } = useCalculatorState();
  const { customRates } = useCustomRates();

  /**
   * Landing search deep link. Picking a shard from the landing page sends
   * `?q=<shard name>` here, and the form starts on that shard instead of on
   * whatever was last saved.
   *
   * One shot on mount only. The saved form is the user's, so a URL that kept
   * reapplying itself would undo their edits every render.
   */
  const [searchParams] = useSearchParams();
  const deepLinked = useRef(false);
  useEffect(() => {
    const q = searchParams.get("q");
    if (!q || deepLinked.current) return;
    deepLinked.current = true;
    setForm({ ...form, shard: q });
    // `form` is intentionally not a dependency: this reads it once to seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("sd-channel");
    return () => document.documentElement.classList.remove("sd-channel");
  }, []);
  const [currentParams, setCurrentParams] = useState<CalculationParams | null>(null);
  const [currentShardKey, setCurrentShardKey] = useState<string>("");
  const [currentQuantity, setCurrentQuantity] = useState<number>(1);
  const [recipeOverrides, setRecipeOverrides] = useState<RecipeOverride[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress] = useState<WorkerProgress | null>(null);

  // Materials-only mode: per-shard results (incl. trees) and the shard whose tree is being viewed
  const [materialShardResults, setMaterialShardResults] = useState<Map<string, CalculationResult>>(new Map());
  const [materialTreeShardKey, setMaterialTreeShardKey] = useState<string>("");

  // Welcome modal state (first visit only)
  // Inventory state
  const [useInventory, setUseInventory] = useState<boolean>(() => {
    const stored = localStorage.getItem(INVENTORY_ENABLED_KEY);
    return stored === "true";
  });

  const [inventory, setInventory] = useState<Map<string, number>>(loadInventory);
  const [ownedAttributes, setOwnedAttributes] = useState<Map<string, number>>(loadOwnedAttributes);
  const [disabledShards, setDisabledShards] = useState<Set<string>>(loadDisabledShards);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
const [inventoryResult, setInventoryResult] = useState<InventoryCalculationResult | null>(null);
  const [invCalculationData, setInvCalculationData] = useState<Data | null>(null);
  const [invCurrentParams, setInvCurrentParams] = useState<CalculationParams | null>(null);
  const [expandedStates] = useState<Map<string, boolean>>(new Map());
  const [, setRenderTick] = useState(0);

  // Handler for clicking a shard in the attributes tab
  const handleShardClickFromInventory = useCallback(async (shardKey: string) => {
    try {
      const dataService = DataService.getInstance();
      const shards = await dataService.loadShards();
      const shard = shards.find(s => s.key === shardKey);
      
      if (shard) {
        // Calculate remaining quantity based on owned attributes
        const rarityKey = shard.rarity.toLowerCase() as keyof typeof MAX_QUANTITIES;
        const maxQuantity = MAX_QUANTITIES[rarityKey] ?? MAX_QUANTITIES.common;
        const owned = ownedAttributes.get(shardKey) ?? 0;
        const remaining = owned >= maxQuantity ? maxQuantity : Math.max(1, maxQuantity - owned);
        
        const updatedForm = { ...form, shard: shard.name, quantity: remaining };
        setForm(updatedForm);
        setTargetShardName(shard.name);
        setCurrentShardKey(shardKey);
        setCurrentQuantity(remaining);
        // Trigger calculation after a brief delay to ensure form is updated
        setTimeout(() => {
          const submit = async (formData: CalculationFormData) => {
            await performCalculation(
              formData,
              customRates,
              recipeOverrides,
              {
                setTargetShardName,
                setCurrentShardKey,
                setCurrentQuantity,
                setCurrentParams,
                setResult,
                setCalculationData,
                setCalculating: setIsCalculating,
                setProgress,
                setMaterialShardResults,
              }
            );
          };
          submit(updatedForm).catch(console.error);
        }, 0);
      }
    } catch (error) {
      console.error("Failed to load shard from key:", error);
    }
  }, [form, setForm, setTargetShardName, customRates, recipeOverrides, ownedAttributes, setResult, setCalculationData]);

  // Handler for importing shard levels from profile
  const handleShardLevelsImport = useCallback((levels: {
    newtLevel?: number;
    salamanderLevel?: number;
    lizardKingLevel?: number;
    leviathanLevel?: number;
    pythonLevel?: number;
    kingCobraLevel?: number;
    seaSerpentLevel?: number;
    tiamatLevel?: number;
    crocodileLevel?: number;
  }) => {
    const updatedForm = { ...form, ...levels };
    setForm(updatedForm);
  }, [form, setForm]);

  // Persist inventory toggle
  useEffect(() => {
    try {
      localStorage.setItem(INVENTORY_ENABLED_KEY, useInventory ? "true" : "false");
    } catch { /* ignore */ }
  }, [useInventory]);

  // Save inventory data to localStorage
  useEffect(() => { saveInventory(inventory); }, [inventory]);
  useEffect(() => { saveOwnedAttributes(ownedAttributes); }, [ownedAttributes]);
  useEffect(() => { saveDisabledShards(disabledShards); }, [disabledShards]);

  // Inventory tree expand/collapse handlers
  const handleToggle = useCallback((nodeId: string) => {
    expandedStates.set(nodeId, !expandedStates.get(nodeId));
    setRenderTick((t) => t + 1);
  }, [expandedStates]);

  const handleExpandAll = useCallback(() => {
    expandedStates.forEach((_, key) => {
      expandedStates.set(key, true);
    });
    setRenderTick((t) => t + 1);
  }, [expandedStates]);

  const handleCollapseAll = useCallback(() => {
    expandedStates.forEach((_, key) => {
      expandedStates.set(key, false);
    });
    setRenderTick((t) => t + 1);
  }, [expandedStates]);

  const handleUseInventoryChange = useCallback((enabled: boolean) => {
    setUseInventory(enabled);
    // Clear results when toggling so user gets fresh calculation
    setResult(null);
    setCalculationData(null);
    setInventoryResult(null);
    setInvCalculationData(null);
  }, [setResult, setCalculationData]);

  /*
   * Game mode, from the one store the nav's ModeToggle writes.
   *
   * The page used to carry its own Ironman / Normal pair that wrote straight
   * into `form.ironManView`, which made this the last tool with a private
   * copy of a setting the whole site shares. That pair is gone,
   * so now the shared profile is the writer and the form field
   * is a follower: the sync effect below folds the mode into the form the
   * same way the buttons used to, results cleared and a recalculation queued,
   * so flipping the nav toggle does exactly what the buttons did.
   */
  const { mode } = useProfile();

  // --- Inventory calculation ---
  const performInventoryCalculation = useCallback(async (formData: CalculationFormData) => {
    if (!formData.shard || formData.shard.trim() === "") {
      return;
    }

    const dataService = DataService.getInstance();
    const nameToKeyMap = await dataService.getShardNameToKeyMap();
    const shardKey = nameToKeyMap[formData.shard.toLowerCase()];

    if (!shardKey) {
      return;
    }

    const filteredCustomRates = Object.fromEntries(
      Object.entries(customRates).filter(([, v]) => v !== undefined)
    ) as { [shardId: string]: number };

    const params: CalculationParams = {
      customRates: formData.ironManView ? filteredCustomRates : await dataService.loadShardCosts(formData.instantBuyPrices),
      hunterFortune: formData.hunterFortune,
      excludeChameleon: formData.excludeChameleon,
      frogBonus: formData.frogBonus,
      newtLevel: formData.newtLevel,
      salamanderLevel: formData.salamanderLevel,
      lizardKingLevel: formData.lizardKingLevel,
      leviathanLevel: formData.leviathanLevel,
      pythonLevel: formData.pythonLevel,
      kingCobraLevel: formData.kingCobraLevel,
      seaSerpentLevel: formData.seaSerpentLevel,
      tiamatLevel: formData.tiamatLevel,
      crocodileLevel: formData.crocodileLevel,
      kuudraTier: formData.kuudraTier,
      moneyPerHour: formData.moneyPerHour,
      customKuudraTime: formData.customKuudraTime,
      kuudraTimeSeconds: formData.kuudraTimeSeconds,
      noWoodenBait: formData.noWoodenBait,
      rateAsCoinValue: !formData.ironManView,
      craftPenalty: formData.craftPenalty,
    };

    setInvCurrentParams(params);
    setIsCalculating(true);

    try {
      const invService = InvCalculationService.getInstance();
      const calculationResult = await invService.calculateOptimalPath(
        shardKey,
        formData.quantity,
        params,
        new Map([...inventory].filter(([id]) => !disabledShards.has(id))),
        recipeOverrides,
        ownedAttributes
      );

      setInventoryResult(calculationResult);

      const calculationService = CalculationService.getInstance();
      const data = await calculationService.parseData(params);
      setInvCalculationData(data);
    } catch (err) {
      console.error("Inventory calculation failed:", err);
    } finally {
      setIsCalculating(false);
    }
  }, [customRates, inventory, disabledShards, recipeOverrides, ownedAttributes]);

  // --- Standard debounced calculation ---
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const debouncedCalculate = useCallback(
    async (formData: CalculationFormData, delay = 300) => {
      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Cancel any ongoing worker calculation
      if (cancelRef?.current) {
        cancelRef.current();
        cancelRef.current = null;
      }

      setResult(null);
      setCalculationData(null);
      setInventoryResult(null);
      setInvCalculationData(null);
      setMaterialShardResults(new Map());
      setProgress(null);

      debounceTimeoutRef.current = setTimeout(async () => {
        if (useInventory && !formData.materialsOnly) {
          // Inventory mode - use InvCalculationService
          performInventoryCalculation(formData).catch(console.error);
        } else {
          // Standard mode - use worker-based calculation
          const callbacks = {
            setTargetShardName,
            setCurrentShardKey,
            setCurrentQuantity,
            setCurrentParams,
            setResult,
            setCalculationData,
            setCalculating: setIsCalculating,
            setProgress,
            setMaterialShardResults,
          };

          try {
            cancelRef.current = await performCalculation(formData, customRates, recipeOverrides, callbacks);
          } catch (err) {
            if (err instanceof Error && !err.message.includes("not found")) {
              console.error("Calculation failed:", err);
            }
          }
        }
      }, delay);
    },
    [customRates, recipeOverrides, useInventory, performInventoryCalculation, setTargetShardName, setCurrentShardKey, setCurrentQuantity, setCurrentParams, setResult, setCalculationData]
  );

  const formRef = useRef(form);
  formRef.current = form;

  /*
   * Fold the shared mode into the form. This is the whole rewiring: the form
   * keeps its `ironManView` field because forty places downstream read it, but
   * nothing on this page writes it any more - the mode toggle, through the
   * store, is the only author. Early return keeps this from looping: once the
   * two agree the effect does nothing, however often its dependencies get new
   * identities.
   *
   * This runs on first load, so the store has to arrive already knowing what a
   * returning player chose. It does: `useProfile` seeds itself from the legacy
   * keys when its own key is absent. Without that the store would arrive on its
   * Ironman default, disagree with a saved Normal form, and this effect would
   * overwrite the choice and clear the results on the way past.
   */
  useEffect(() => {
    const ironman = mode === "ironman";
    const current = formRef.current;
    if (!current || current.ironManView === ironman) return;

    const newForm = { ...current, ironManView: ironman };
    setForm(newForm);
    setResult(null);
    setCalculationData(null);
    setInventoryResult(null);
    setInvCalculationData(null);
    debouncedCalculate(newForm, 100).catch(console.error);
  }, [mode, debouncedCalculate, setForm, setResult, setCalculationData]);

  const handleCalculate = useCallback(async (formData: CalculationFormData, setFormFn: (data: CalculationFormData) => void) => {
    setFormFn(formData);
    // For immediate fields like shard selection, calculate immediately
    const currentForm = formRef.current;
    const materialsOnlyChanged = formData.materialsOnly !== currentForm?.materialsOnly;
    const selectedShardsChanged = JSON.stringify(formData.selectedShardKeys) !== JSON.stringify(currentForm?.selectedShardKeys);

    if (formData.shard !== currentForm?.shard || formData.quantity !== currentForm?.quantity || materialsOnlyChanged || selectedShardsChanged) {
      await debouncedCalculate(formData, 100);
    } else {
      await debouncedCalculate(formData, 300);
    }
  }, [debouncedCalculate]);

  const handleResultUpdate = (newResult: CalculationResult) => {
    setResult(newResult);
  };

  const handleRecipeOverridesUpdate = (newOverrides: RecipeOverride[]) => {
    setRecipeOverrides(newOverrides);
  };

  const resetRecipeOverrides = () => {
    setRecipeOverrides([]);
  };

  // Re-calculate when customRates, recipeOverrides, inventory, or useInventory change and form is valid
  useEffect(() => {
    const currentForm = formRef.current;
    const isValidForm = currentForm && (
      (currentForm.shard && currentForm.shard.trim() !== "") ||
      (currentForm.materialsOnly && currentForm.selectedShardKeys && currentForm.selectedShardKeys.length > 0)
    );

    if (isValidForm) {
      debouncedCalculate(currentForm, 150).catch(console.error);
    }
  }, [customRates, recipeOverrides, inventory, useInventory, debouncedCalculate]);

  // Initialize params from form for inventory mode display
  useEffect(() => {
    if (!useInventory || !form) return;

    const initializeParams = async () => {
      const dataService = DataService.getInstance();
      const filteredCustomRates = Object.fromEntries(
        Object.entries(customRates).filter(([, v]) => v !== undefined)
      ) as { [shardId: string]: number };

      const params: CalculationParams = {
        customRates: form.ironManView ? filteredCustomRates : await dataService.loadShardCosts(form.instantBuyPrices),
        hunterFortune: form.hunterFortune,
        excludeChameleon: form.excludeChameleon,
        frogBonus: form.frogBonus,
        newtLevel: form.newtLevel,
        salamanderLevel: form.salamanderLevel,
        lizardKingLevel: form.lizardKingLevel,
        leviathanLevel: form.leviathanLevel,
        pythonLevel: form.pythonLevel,
        kingCobraLevel: form.kingCobraLevel,
        seaSerpentLevel: form.seaSerpentLevel,
        tiamatLevel: form.tiamatLevel,
        crocodileLevel: form.crocodileLevel,
        kuudraTier: form.kuudraTier,
        moneyPerHour: form.moneyPerHour,
        customKuudraTime: form.customKuudraTime,
        kuudraTimeSeconds: form.kuudraTimeSeconds,
        noWoodenBait: form.noWoodenBait,
        rateAsCoinValue: !form.ironManView,
        craftPenalty: form.craftPenalty,
      };

      setInvCurrentParams(params);
    };

    void initializeParams();
  }, [form, customRates, useInventory]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Determine which results to show
  const showInventoryResults = useInventory && !form.materialsOnly && inventoryResult && invCalculationData && invCurrentParams;
  const showStandardResults = !useInventory || form.materialsOnly ? (result && calculationData && currentParams) : false;

  /*
    What this page is currently working with, as a strip of figures.

    The first four are properties of the saved configuration and are readable
    the moment the page loads, because the inventory and the override list come
    from local storage rather than from the network. The last two belong to a
    calculation and are dashes until one has finished: a zero there would say
    "this fusion needs no materials", which is a different and false claim while
    the solver is still running.
  */
  const strip = (
    <div className={`${PANEL} flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 py-2`}>
      <Figure label="Inventory" value={inventory.size.toLocaleString()} title="Shard types you have imported" />
      <Figure label="Attributes" value={ownedAttributes.size.toLocaleString()} title="Shard attributes you already own" />
      <Figure label="Excluded" value={disabledShards.size.toLocaleString()} title="Shards you have switched off, so the solver may not spend them" />
      <Figure label="Overrides" value={recipeOverrides.length.toLocaleString()} title="Recipes you have pinned in place of the solver's choice" />
      <Figure label="Quantity" value={form.quantity.toLocaleString()} title="How many of the target shard you asked for" />
      <Figure
        label="Materials"
        value={result?.totalQuantities ? result.totalQuantities.size.toLocaleString() : "-"}
        title={result ? "Distinct shards the path consumes" : "No calculation has finished yet"}
      />
      <Figure
        label="Crafts"
        value={typeof result?.craftsNeeded === "number" ? Math.round(result.craftsNeeded).toLocaleString() : "-"}
        title={result ? "Fusions the path performs" : "No calculation has finished yet"}
      />
    </div>
  );

  return (
    <>
      {/* The signature split: configuration in the rail under the logo,
          results under the tabs. Same furniture positions as every page. */}
      <SplitPage
        railLabel="Fusion configuration"
        rail={
          <>
            {/* Narrow viewports collapse the rail behind one button. */}
            <div className="min-[900px]:hidden">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`${BTN_QUIET} w-full justify-center`}>
                {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                <span>{sidebarOpen ? "Hide" : "Show"} Configuration</span>
              </button>
            </div>

            <div className={`${sidebarOpen ? "block" : "hidden min-[900px]:block"} space-y-3`}>
              {/*
                Inventory Section. This inline purple block is the panel that
                set the pattern for every tab, so it now IS
                the pattern: the kit's InventoryPanel, the same construction
                the greenhouse planner uses. The count chip and summary state
                only what the maps actually hold, and an empty inventory says
                so in words rather than showing a zero.
              */}

              <InventoryPanel
                title="Shard quantities"
                icon={Package}
                count={inventory.size > 0 ? `${inventory.size} shard${inventory.size !== 1 ? "s" : ""}` : null}
                summary={
                  inventory.size === 0 ? (
                    <span className="text-slate-400">No shard quantities saved.</span>
                  ) : (
                    <>
                      <span className="text-slate-100 font-medium">{inventory.size}</span> saved shard type{inventory.size !== 1 ? "s" : ""}
                      {ownedAttributes.size > 0 && (
                        <span className="ml-2">
                          • <span className="text-slate-100 font-medium">{ownedAttributes.size}</span> attribute{ownedAttributes.size !== 1 ? "s" : ""}
                        </span>
                      )}
                    </>
                  )
                }
              >
                <button onClick={() => setShowInventoryModal(true)} className={`${BTN_PRIMARY} w-full justify-center`}>
                  <Package className="w-4 h-4" />
                  <span>Edit shard quantities</span>
                </button>
              </InventoryPanel>

              {/*
                Calculator Settings Form, on a pane of glass.

                The form owns its own surface, and that surface is a tint with
                no blur behind it. Over the curtain that is fine, because the
                curtain has already softened everything underneath; in the sharp
                channel opened above it is not, and the photograph reads straight
                through the control stack. This wrapper is the blurred ground the
                form cannot give itself. It carries no padding, so the form's own
                border lands exactly on the pane's edge rather than nesting a
                second card inside the first.
              */}
              <div className="ws-panel sd-glass rounded-md">
                <CalculatorFormWithContext
                  onSubmit={handleCalculate}
                  inventory={useInventory ? inventory : undefined}
                  ownedAttributes={ownedAttributes}
                  useInventory={useInventory}
                  onUseInventoryChange={handleUseInventoryChange}
                />
              </div>
            </div>
          </>
        }
      >
        <div className="space-y-3">
            <PageHeader
              title="Fusion Calculator"
              sub="The cheapest path to a shard, solved against your rates and what you already hold."
              icon={Calculator}
              actions={
                form.shard ? (
                  <span className="text-[11px] text-slate-400">
                    target <span className="font-medium text-purple-200">{form.shard}</span>
                  </span>
                ) : undefined
              }
            />

            {strip}

            {/* Loading Indicator. The kit's own rail rather than a hand-rolled
                one, so a progress bar on this page is the same object as a
                progress bar anywhere else on the site. */}
            {isCalculating && (
              <div className={`${PANEL} px-3 py-2.5`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[12px] font-medium text-slate-200">{progress?.message || "Calculating..."}</span>
                  {typeof progress?.progress === "number" && (
                    <span className={`${COL} tabular-nums`}>{Math.round((progress.progress || 0) * 100)}%</span>
                  )}
                </div>
                <Bar done={Math.min(100, Math.round((progress?.progress || 0) * 100))} total={100} />
              </div>
            )}

            {/* Inventory Results */}
            {showInventoryResults && (
              <InventoryCalculationResults
                result={inventoryResult}
                data={invCalculationData}
                targetShardName={form.shard || "Unknown Shard"}
                targetShard={form.shard || ""}
                ironManView={form.ironManView}
                expandedStates={expandedStates}
                onToggle={handleToggle}
                onExpandAll={handleExpandAll}
                onCollapseAll={handleCollapseAll}
                params={invCurrentParams}
                recipeOverrides={recipeOverrides}
                onRecipeOverridesUpdate={handleRecipeOverridesUpdate}
                onResetRecipeOverrides={resetRecipeOverrides}
                inventory={inventory}
                disabledShards={disabledShards}
                onDisabledShardsChange={setDisabledShards}
              />
            )}

            {/* Standard Results */}
            {showStandardResults && (
              <CalculationResults
                result={result!}
                data={calculationData!}
                targetShardName={targetShardName}
                targetShard={currentShardKey}
                requiredQuantity={currentQuantity}
                params={currentParams!}
                onResultUpdate={handleResultUpdate}
                recipeOverrides={recipeOverrides}
                onRecipeOverridesUpdate={handleRecipeOverridesUpdate}
                onResetRecipeOverrides={resetRecipeOverrides}
                ironManView={form.ironManView}
                materialsOnly={form.materialsOnly}
                materialShardResults={materialShardResults}
                materialTreeShardKey={materialTreeShardKey}
                onMaterialTreeShardChange={setMaterialTreeShardKey}
              />
            )}

            {/* Empty State */}
            {!result && !inventoryResult && !isCalculating && (
              <div className={PANEL}>
                <EmptyState
                  icon={Sparkles}
                  title="Ready to calculate"
                  hint={
                    <>
                      Choose a target shard in the rail and the solver will find the cheapest path to it. First time fusing shards? Read the{" "}
                      <a href="/guide" className="text-purple-300 underline hover:text-purple-200">
                        guide
                      </a>
                      .
                    </>
                  }
                />
              </div>
            )}
        </div>
      </SplitPage>

      {/* Inventory Management Modal */}
      <InventoryManagementModal
        open={showInventoryModal}
        onClose={() => setShowInventoryModal(false)}
        inventory={inventory}
        ownedAttributes={ownedAttributes}
        onInventoryChange={setInventory}
        onOwnedAttributesChange={setOwnedAttributes}
        disabledShards={disabledShards}
        onDisabledShardsChange={setDisabledShards}
        onShardClick={handleShardClickFromInventory}
        onShardLevelsImport={handleShardLevelsImport}
      />
    </>
  );
};

export const CalculatorPage: React.FC = () => <CalculatorPageContent />;
