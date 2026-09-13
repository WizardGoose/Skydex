export type CustomRates = Record<string, number | undefined>;

export const withCustomRate = (
  current: CustomRates,
  shardId: string,
  rate: number | undefined,
): CustomRates => ({ ...current, [shardId]: rate });

export const hasCustomRateChanges = (
  customRates: CustomRates,
  defaultRates: Record<string, number>,
): boolean =>
  Object.entries(customRates).some(
    ([id, rate]) => rate !== undefined && rate !== defaultRates[id],
  );
