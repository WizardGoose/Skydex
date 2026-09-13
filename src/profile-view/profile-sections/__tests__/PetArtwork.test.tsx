import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ItemIconProps } from "../../../ui/ItemIcon";

/* Capture the exact props sent to the shared renderer without needing a DOM. */
vi.mock("../../../ui/ItemIcon", () => ({
  ItemIcon: (props: ItemIconProps) => (
    <span
      data-icon-name={props.name}
      data-icon-id={props.id ?? ""}
      data-icon-src={props.src ?? ""}
      data-terminal-src={props.terminalSrc ?? ""}
      data-allow-semantic-fallback={String(props.allowSemanticFallback)}
    />
  ),
}));

import {
  PetArtworkIcon,
  petArtworkIconProps,
  petArtworkKey,
  selectPetArtworkTexture,
} from "../PetArtwork";

const RABBIT_TEXTURE = "https://mc-heads.net/head/63438555e899bd9a051a95dbea49eb2ecfa52a69dbba8998f3673819e277fdf5/64";
const HEDGEHOG_TEXTURE = "https://mc-heads.net/head/5f5e835c116e8e200e2e06aa593cab8f1a9f8c40e7f005a9c76f12e24f4c6370/64";
const ROCK_SKIN_TEXTURE = "https://mc-heads.net/head/7df8aab57136df2296c7c6f969ff25d58116fe2ec59b96a85ba4927e1f6779e6/64";

describe("PetArtwork", () => {
  it("passes an exact base-pet terminal and disables semantic replacement", () => {
    const pet = {
      type: "RABBIT",
      tier: "mythic",
      name: "Rabbit Pet",
      id: "PET_RABBIT",
      exactTexture: RABBIT_TEXTURE,
      size: 56,
    };
    const props = petArtworkIconProps(pet);
    const markup = renderToStaticMarkup(<PetArtworkIcon {...pet} />);

    expect(props).toMatchObject({
      name: "Rabbit Pet",
      id: "PET_RABBIT",
      terminalSrc: RABBIT_TEXTURE,
      allowSemanticFallback: false,
      size: 56,
    });
    expect(markup).toContain(`data-terminal-src="${RABBIT_TEXTURE}"`);
    expect(markup).toContain("data-allow-semantic-fallback=\"false\"");
  });

  it("uses a custom skin's exact id, name, and terminal head", () => {
    const pet = {
      type: "ROCK",
      tier: "legendary",
      name: "Rock Pet",
      id: "PET_ROCK",
      skinId: "rock_cool",
      skinName: "Rock Cool",
      exactTexture: ROCK_SKIN_TEXTURE,
    };
    const markup = renderToStaticMarkup(<PetArtworkIcon {...pet} />);

    expect(markup).toContain("data-icon-name=\"Rock Cool\"");
    expect(markup).toContain("data-icon-id=\"PET_SKIN_ROCK_COOL\"");
    expect(markup).toContain(`data-terminal-src="${ROCK_SKIN_TEXTURE}"`);
    expect(markup).toContain("data-allow-semantic-fallback=\"false\"");
  });

  it("does not carry a previous pet head into a recycled tile", () => {
    const rabbitKey = petArtworkKey("RABBIT", "mythic", null);
    const hedgehogKey = petArtworkKey("HEDGEHOG", "legendary", null);

    expect(selectPetArtworkTexture(rabbitKey, { key: hedgehogKey, url: HEDGEHOG_TEXTURE })).toBeNull();
    expect(selectPetArtworkTexture(rabbitKey, { key: rabbitKey, url: RABBIT_TEXTURE })).toBe(RABBIT_TEXTURE);
    expect(selectPetArtworkTexture(
      petArtworkKey("ROCK", "legendary", "rock_cool"),
      { key: rabbitKey, url: RABBIT_TEXTURE },
    )).toBeNull();
  });
});
