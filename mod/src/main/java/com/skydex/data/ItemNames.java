package com.skydex.data;

/**
 * Turns a Hypixel item id into the display name the website would render for
 * it, so the mod can leave {@code name} off the wire when it carries nothing.
 *
 * <p>This <b>must</b> match the site's {@code prettify} exactly:
 * <pre>
 * id.toLowerCase().split(/[_\s:]+/).filter(Boolean)
 *   .map(w =&gt; w[0].toUpperCase() + w.slice(1)).join(" ")
 * </pre>
 * If it drifts, the mod omits a name the site then renders differently and the
 * real display name is silently lost. Omission is therefore conservative: only
 * an exact match is dropped.
 */
public final class ItemNames {

    private ItemNames() {
    }

    /** {@code ENCHANTED_BROWN_MUSHROOM -> "Enchanted Brown Mushroom"}. */
    public static String prettify(String id) {
        if (id == null || id.isEmpty()) {
            return "";
        }
        StringBuilder out = new StringBuilder(id.length());
        boolean startOfWord = true;
        boolean pendingSpace = false;

        for (int i = 0; i < id.length(); i++) {
            char c = id.charAt(i);
            // The site splits on underscore, whitespace and colon.
            if (c == '_' || c == ':' || Character.isWhitespace(c)) {
                if (!startOfWord) {
                    pendingSpace = true;
                }
                continue;
            }
            if (pendingSpace) {
                out.append(' ');
                pendingSpace = false;
            }
            if (startOfWord || out.charAt(out.length() - 1) == ' ') {
                out.append(Character.toUpperCase(c));
            } else {
                out.append(Character.toLowerCase(c));
            }
            startOfWord = false;
        }
        return out.toString();
    }

    /**
     * The display name a reader can rebuild from the id alone, or from the id
     * plus a known reforge.
     *
     * <p>Hypixel prefixes the reforge onto the display name, so a Rapid Juju
     * Shortbow reads "Rapid Juju Shortbow" — reconstructable once
     * {@code extra.reforge} is on the wire, which is why that name need not be
     * shipped separately.
     */
    public static String expected(String id, String reforge) {
        String base = prettify(id);
        if (reforge == null || reforge.isBlank()) {
            return base;
        }
        return reforge + " " + base;
    }

    /**
     * True when the name carries no information beyond the id, and can be left
     * off the wire for the reader to reconstruct.
     */
    public static boolean isRedundant(String id, String name) {
        return isRedundant(id, name, null);
    }

    /** As above, but also treats "reforge + prettified id" as reconstructable. */
    public static boolean isRedundant(String id, String name, String reforge) {
        return name == null || name.equals(expected(id, reforge));
    }
}
