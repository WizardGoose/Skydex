import React from "react";
import { ExternalLink } from "lucide-react";
import { FOCUS } from "./kit";
import { ItemIcon } from "./ItemIcon";
import { wikiArticleUrl } from "./wikiUrl";

/**
 * Article URL for a thing, built straight from its display name.
 *
 * Same trick as `wikiIconUrl`: MediaWiki titles are the display name with
 * spaces as underscores, so no API lookup is needed to link anything. Wiki
 * content is CC BY-NC-SA and stays where it is; we point at it, we never
 * bundle it. See `items/wikiCrafting.ts` for the full reasoning.
 */
export interface WikiLinkProps {
  /** Display name. Derives the article URL and, with `icon`, the image too. */
  name: string;
  /** Override the derived URL when the caller already holds a canonical one. */
  href?: string;
  /** Show the icon to the left of the name. */
  icon?: boolean;
  /** A preferred icon source tried before the wiki image, e.g. local art. */
  iconSrc?: string;
  /** Icon box in px. Match it to the row it sits in. */
  iconSize?: number;
  /** Classes for the link. Add `min-w-0` when the name needs to truncate. */
  className?: string;
  /** Classes for the name itself, e.g. `truncate` in a dense row. */
  nameClassName?: string;
  title?: string;
  /** Label to render instead of `name`, when the two differ. */
  children?: React.ReactNode;
  /** Dense icon-only surfaces can keep the shared link without a second glyph. */
  showExternalIcon?: boolean;
}

/**
 * A name that goes to its wiki article.
 *
 * Three constraints shaped this:
 *
 *   - It lands inside rarity-coloured and tier-coloured text, so it sets no
 *     colour of its own and inherits whatever it is dropped into. Hover adds
 *     an underline rather than a colour change, which works on every one of
 *     those colours without a second rule per rarity.
 *   - Rows here run at 10-11px and are read by scanning, so the external-link
 *     glyph only appears on hover or keyboard focus. It is always laid out,
 *     just transparent, which is what keeps hover from nudging the row.
 *   - Nothing about it is taller than the text or the icon it already sits
 *     beside, so adding it to a row cannot change that row's height.
 */
export const WikiLink: React.FC<WikiLinkProps> = ({
  name,
  href,
  icon = false,
  iconSrc,
  iconSize = 16,
  className = "",
  nameClassName = "",
  title,
  children,
  showExternalIcon = true,
}) => (
  <a
    href={href ?? wikiArticleUrl(name)}
    target="_blank"
    rel="noopener noreferrer"
    title={title ?? `${name} on the wiki`}
    className={`group/wikilink inline-flex items-center gap-1 rounded-sm hover:underline underline-offset-2 decoration-1 ${FOCUS} ${className}`}
  >
    {icon && <ItemIcon name={name} src={iconSrc} size={iconSize} />}
    <span className={nameClassName}>{children ?? name}</span>
    {showExternalIcon && (
      <ExternalLink
        className="w-2.5 h-2.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover/wikilink:opacity-70 group-focus-visible/wikilink:opacity-70"
        aria-hidden
      />
    )}
  </a>
);

export default WikiLink;
