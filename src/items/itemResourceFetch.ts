export interface ResourceItem {
  id?: string;
  name?: string;
  tier?: string;
  category?: string;
  skin?: { value?: string } | null;
  item_model?: string;
}

const RESOURCE_URL = "https://api.hypixel.net/v2/resources/skyblock/items";

let inFlight: Promise<ResourceItem[]> | null = null;

export const fetchItemResourceItems = (signal?: AbortSignal): Promise<ResourceItem[]> => {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("The request was aborted.", "AbortError"));
  }
  if (inFlight) return inFlight;

  inFlight = fetch(RESOURCE_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`items resource responded ${response.status}`);
      return response.json() as Promise<{ items?: ResourceItem[] }>;
    })
    .then((body) => body.items ?? [])
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};
