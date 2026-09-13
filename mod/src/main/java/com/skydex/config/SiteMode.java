package com.skydex.config;

import java.util.Locale;

/**
 * Which Skydex site the player uses. This is the one setting the GUI exists
 * to ask about, because it decides whether the localhost server runs at all.
 */
public enum SiteMode {

    /**
     * The site runs on this machine: the localhost server runs and pushes live
     * updates. Manual copy still works.
     */
    LOCAL("local", "Locally Hosted"),

    /**
     * The hosted GitHub Pages site: the localhost server is stopped entirely
     * rather than holding a port nothing will connect to. Updates are manual,
     * via the Copy button or {@code /skydex copy}.
     */
    GITHUB_PAGES("githubPages", "GitHub Pages");

    private final String id;
    private final String label;

    SiteMode(String id, String label) {
        this.id = id;
        this.label = label;
    }

    /** Stable value written to the config file. */
    public String id() {
        return id;
    }

    /** Human label shown in the GUI. */
    public String label() {
        return label;
    }

    /** True when the localhost server should be running. */
    public boolean usesLocalServer() {
        return this == LOCAL;
    }

    /** Lenient parse; unknown values fall back to the default rather than throwing. */
    public static SiteMode fromId(String id, SiteMode fallback) {
        if (id == null) {
            return fallback;
        }
        String needle = id.trim().toLowerCase(Locale.ROOT);
        for (SiteMode mode : values()) {
            if (mode.id.toLowerCase(Locale.ROOT).equals(needle)) {
                return mode;
            }
        }
        return fallback;
    }

    /** Spec default: locally hosted. */
    public static SiteMode defaultMode() {
        return LOCAL;
    }
}
