import React, { createContext, useState, useCallback, useEffect } from "react";
import type { CalculationFormData } from "../schemas";
import type { CalculationResult, Data } from "../types/types";
import { saveFormData, loadFormData, clearFormData } from "../utilities";

const defaultForm: CalculationFormData = {
  shard: "",
  quantity: 1,
  hunterFortune: 0,
  hunterFortuneSource: "profile",
  excludeChameleon: false,
  frogBonus: false,
  newtLevel: 0,
  salamanderLevel: 0,
  lizardKingLevel: 0,
  leviathanLevel: 0,
  pythonLevel: 0,
  kingCobraLevel: 0,
  seaSerpentLevel: 0,
  tiamatLevel: 0,
  crocodileLevel: 0,
  kuudraTier: "none", // No Kuudra by default
  kuudraTierSource: "profile",
  moneyPerHour: Infinity,
  customKuudraTime: false,
  kuudraTimeSeconds: null,
  noWoodenBait: false,
  ironManView: true,
  instantBuyPrices: false,
  craftPenalty: 0.8,
  materialsOnly: false,
  selectedShardKeys: [],
  shardQuantities: [],
};

interface CalculatorStateContextType {
  form: CalculationFormData;
  setForm: (data: CalculationFormData) => void;
  resetForm: () => void;
  result: CalculationResult | null;
  setResult: (result: CalculationResult | null) => void;
  calculationData: Data | null;
  setCalculationData: (data: Data | null) => void;
  targetShardName: string;
  setTargetShardName: (name: string) => void;
}

const CalculatorStateContext = createContext<CalculatorStateContextType | undefined>(undefined);

export { CalculatorStateContext };

export const CalculatorStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Calculator settings are always restored and persisted. The old opt-out
  // toggle made the form's behavior depend on a stale preference key.
  const [form, setForm] = useState<CalculationFormData>(() => {
    const savedData = loadFormData();
    return savedData ? { ...defaultForm, ...savedData } : defaultForm;
  });
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [calculationData, setCalculationData] = useState<Data | null>(null);
  const [targetShardName, setTargetShardName] = useState<string>("");
  // Auto-save on every change.
  useEffect(() => {
    saveFormData(form);
  }, [form]);

  const handleSetForm = useCallback((data: CalculationFormData) => {
    setForm(data);
  }, []);

  const resetForm = useCallback(() => {
    setForm(defaultForm);
    clearFormData();
  }, []);

  return (
    <CalculatorStateContext.Provider
      value={{
        form,
        setForm: handleSetForm,
        resetForm,
        result,
        setResult,
        calculationData,
        setCalculationData,
        targetShardName,
        setTargetShardName,
      }}
    >
      {children}
    </CalculatorStateContext.Provider>
  );
};
