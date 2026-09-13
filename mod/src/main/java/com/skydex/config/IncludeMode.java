package com.skydex.config;

import java.util.Locale;

/**
 * Whether the clipboard code carries inventory, ender chest and storage.
 *
 * <p>Tri-state on purpose. A plain boolean cannot tell "the player wants this
 * off" from "nobody has touched it", and those need to behave differently: an
 * untouched setting follows the site mode, while an explicit choice is honoured
 * whatever the mode.
 */
public enum IncludeMode {

    /** Untouched: follow the site mode. */
    AUTO("auto"),
    /** The player asked for them. */
    ON("on"),
    /** The player asked against them. */
    OFF("off");

    private final String id;

    IncludeMode(String id) {
        this.id = id;
    }

    public String id() {
        return id;
    }

    public boolean isExplicit() {
        return this != AUTO;
    }

    /**
     * The effective setting.
     *
     * <p>Under {@link SiteMode#GITHUB_PAGES} the default is <b>on</b>: the
     * hosted site cannot reach the local server and does not yet parse the
     * API's NBT, so the code is the only way those sections can arrive at all.
     * Under {@link SiteMode#LOCAL} the default is <b>off</b>, because the live
     * feed already carries them and the code stays small.
     */
    public boolean effective(SiteMode mode) {
        return switch (this) {
            case ON -> true;
            case OFF -> false;
            case AUTO -> mode != null && !mode.usesLocalServer();
        };
    }

    /** The explicit choice matching a desired state. */
    public static IncludeMode explicit(boolean include) {
        return include ? ON : OFF;
    }

    public static IncludeMode fromId(String id, IncludeMode fallback) {
        if (id == null) {
            return fallback;
        }
        String needle = id.trim().toLowerCase(Locale.ROOT);
        for (IncludeMode mode : values()) {
            if (mode.id.equals(needle)) {
                return mode;
            }
        }
        return fallback;
    }
}
