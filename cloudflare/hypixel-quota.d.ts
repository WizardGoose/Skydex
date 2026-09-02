export class HypixelQuota {
  constructor(context: {
    storage: {
      transaction<T>(callback: (transaction: {
        get(key: string): Promise<unknown>;
        put(key: string, value: unknown): Promise<void>;
      }) => Promise<T>): Promise<T>;
    };
  });
  fetch(request: Request): Promise<Response>;
}

export const hypixelQuotaPolicy: {
  fallbackLimit: number;
  reserveRatio: number;
};
