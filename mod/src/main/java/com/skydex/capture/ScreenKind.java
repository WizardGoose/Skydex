package com.skydex.capture;

/** What a container screen is, decided from its stripped title. */
public enum ScreenKind {
    /** A sack category screen, or the Sack of Sacks. */
    SACK,
    /** One page of the ender chest. */
    ENDER_CHEST,
    /** A storage page or a backpack. */
    STORAGE,
    /**
     * The Crop Diagnostics screen, opened by inspecting a greenhouse crop with
     * the Plant Diagnostic Tool. Classified but not yet parsed: see
     * {@link com.skydex.garden.CropDiagnosticsParser} for why the countdown
     * read is disabled until a real captured fixture exists.
     */
    CROP_DIAGNOSTICS,
    /** Anything else — possibly a real island chest, decided by the caller. */
    OTHER
}
