import React, { useEffect, useState } from "react";
import {
  resolveNeuItemHeadUrl,
  resolvePetHeadUrl,
} from "../../profile/petTextures";
import { ItemIcon, type ItemIconProps } from "../../ui/ItemIcon";

export interface PetArtworkProps extends Pick<
  ItemIconProps,
  "size" | "fallback" | "className" | "freezeAnimatedMedia"
> {
  /** The profile pet type, such as `RABBIT` or `HEDGEHOG`. */
  type: string;
  /** The profile pet tier, such as `mythic` or `legendary`. */
  tier: string;
  /** Display name used by the wiki ladder and accessibility-facing caller. */
  name: string;
  /** The item id used by texture packs and item-resource lookups. */
  id?: string | null;
  /** Exact `PET_SKIN_*` id, when the profile reports a custom skin. */
  skinId?: string | null;
  /** Display name for the custom skin's wiki artwork, when present. */
  skinName?: string | null;
  /** Optional caller-owned artwork. It remains ahead of the pack by ItemIcon's contract. */
  iconSrc?: string | null;
}

const normalizePetId = (value: string | null | undefined): string | null => {
  const normalized = (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (!normalized) return null;
  return normalized.startsWith("PET_SKIN_") ? normalized : `PET_SKIN_${normalized}`;
};

const artworkKey = (type: string, tier: string, skinId: string | null): string =>
  skinId ? `item:${skinId}` : `pet:${type.trim().toUpperCase()}:${tier.trim().toLowerCase()}`;

/** Stable identity key shared by the request guard and its regression test. */
// eslint-disable-next-line react-refresh/only-export-components
export const petArtworkKey = (
  type: string,
  tier: string,
  rawSkinId: string | null | undefined,
): string => artworkKey(type, tier, normalizePetId(rawSkinId));

export interface PetArtworkResolution {
  key: string;
  url: string | null;
}

/** Keep an asynchronous result only when it still belongs to this tile. */
// eslint-disable-next-line react-refresh/only-export-components
export const selectPetArtworkTexture = (
  key: string,
  resolvedTexture: PetArtworkResolution | null,
): string | null => resolvedTexture?.key === key ? resolvedTexture.url : null;

/** Resolve one pet's exact identity render, guarding against recycled tiles. */
// eslint-disable-next-line react-refresh/only-export-components
export const usePetArtworkTexture = (
  type: string,
  tier: string,
  rawSkinId: string | null | undefined,
): string | null => {
  const skinId = normalizePetId(rawSkinId);
  const textureKey = petArtworkKey(type, tier, skinId);
  const [resolvedTexture, setResolvedTexture] = useState<PetArtworkResolution | null>(null);

  useEffect(() => {
    let current = true;
    const request = skinId
      ? resolveNeuItemHeadUrl(skinId)
      : resolvePetHeadUrl(type, tier);
    void request.then((url) => {
      if (current) setResolvedTexture({ key: textureKey, url });
    });
    return () => {
      current = false;
    };
  }, [skinId, textureKey, tier, type]);

  return selectPetArtworkTexture(textureKey, resolvedTexture);
};

export interface PetArtworkRenderProps extends PetArtworkProps {
  /** The exact NEU texture after the asynchronous identity lookup settles. */
  exactTexture?: string | null;
}

/** Build the shared icon props while keeping the pet-specific fallback policy in one place. */
// eslint-disable-next-line react-refresh/only-export-components
export const petArtworkIconProps = ({
  type,
  name,
  id = null,
  skinId: rawSkinId = null,
  skinName = null,
  iconSrc = null,
  exactTexture = null,
  size = 20,
  fallback = "initials",
  className = "",
  freezeAnimatedMedia = false,
}: PetArtworkRenderProps): ItemIconProps => {
  const skinId = normalizePetId(rawSkinId);
  const artworkName = skinId && skinName?.trim() ? skinName.trim() : name;
  const artworkId = skinId ?? id ?? `PET_${type.trim().toUpperCase()}`;
  return {
    name: artworkName,
    id: artworkId,
    src: iconSrc ?? undefined,
    terminalSrc: exactTexture ?? undefined,
    allowSemanticFallback: false,
    freezeAnimatedMedia,
    size,
    fallback,
    className,
  };
};

/** Thin renderer seam so the exact terminal and fallback policy can be tested without a browser. */
export const PetArtworkIcon: React.FC<PetArtworkRenderProps> = (props) => (
  <ItemIcon {...petArtworkIconProps(props)} />
);

/**
 * One identity-safe pet icon for both the Gear card and the Pets section.
 *
 * Wiki artwork and an enabled local texture pack keep their existing ItemIcon
 * order. The exact NEU texture is only the final identity rung, so a failed
 * wiki request cannot turn a pet into a generic Player Head.
 */
export const PetArtwork: React.FC<PetArtworkProps> = ({
  type,
  tier,
  name,
  id = null,
  skinId: rawSkinId = null,
  skinName = null,
  iconSrc = null,
  size = 20,
  fallback = "initials",
  className = "",
  freezeAnimatedMedia = false,
}) => {
  const exactTexture = usePetArtworkTexture(type, tier, rawSkinId);
  return <PetArtworkIcon
    type={type}
    tier={tier}
    name={name}
    id={id}
    skinId={rawSkinId}
    skinName={skinName}
    iconSrc={iconSrc}
    exactTexture={exactTexture}
    size={size}
    fallback={fallback}
    className={className}
    freezeAnimatedMedia={freezeAnimatedMedia}
  />;
};

export default PetArtwork;
