import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemIcon } from "../ItemIcon";

describe("ItemIcon animated media boundary", () => {
  const gif = "https://hypixelskyblock.minecraft.wiki/images/thumb/Blaze.gif/64px-Blaze.gif?abc";

  it("does not mount an animated GIF when a dense surface requests a still", () => {
    const html = renderToStaticMarkup(
      <ItemIcon name="Blaze" src={gif} freezeAnimatedMedia size={34} fallback="blank" />,
    );
    expect(html).not.toContain(gif);
    expect(html).toContain("width:34px");
  });

  it("keeps animation available to ordinary item surfaces", () => {
    const html = renderToStaticMarkup(
      <ItemIcon name="Blaze" src={gif} size={34} fallback="blank" />,
    );
    expect(html).toContain(gif.replaceAll("&", "&amp;"));
  });
});
