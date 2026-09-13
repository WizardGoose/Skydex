import type { ReactNode } from "react";
import { ProfileItemTile } from "../profile-view/profile-sections/ProfileItemTile";
import { rarityKey } from "../search/rarity";
import { CropImage } from "./components/shared";

/** The same item/count cell used by Profile, with the plant's own artwork. */
export function GreenhousePlantIdentity({ id, name, rarity, count, detail, onOpen }: {
  id: string;
  name: string;
  rarity?: string | null;
  count: number;
  detail?: ReactNode;
  onOpen: (id: string) => void;
}) {
  const key = rarityKey(rarity);
  return <div className="greenhouse-plant-identity">
    <ProfileItemTile id={id} name={name} tier={rarity} tierIsDisplayed count={count}
      ariaLabel={`${name}, ${count.toLocaleString()}`}
      iconElement={<CropImage cropId={id} cropName={name} width={26} height={26} showFallback />}
      onClick={() => onOpen(id)} />
    <button type="button" onClick={() => onOpen(id)} className="greenhouse-plant-copy">
      <strong style={key ? { color: `var(--color-rarity-${key})` } : undefined}>{name}</strong>
      {detail && <small>{detail}</small>}
    </button>
  </div>;
}
