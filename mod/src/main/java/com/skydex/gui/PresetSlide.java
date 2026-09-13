package com.skydex.gui;

/** The accepted 220 ms preset-rail motion, kept independent so it can be tested headlessly. */
public final class PresetSlide {

    public static final long DURATION_MS = 220L;

    private PresetSlide() {
    }

    /** CSS cubic-bezier(.16, 1, .3, 1), solved for time rather than approximated as y(t). */
    public static double ease(double progress) {
        double target = clamp(progress);
        double low = 0.0;
        double high = 1.0;
        for (int i = 0; i < 14; i++) {
            double parameter = (low + high) * 0.5;
            if (bezier(parameter, 0.16, 0.30) < target) {
                low = parameter;
            } else {
                high = parameter;
            }
        }
        return bezier((low + high) * 0.5, 1.0, 1.0);
    }

    public static double value(double from, double to, long elapsedMs) {
        if (elapsedMs <= 0L) {
            return from;
        }
        if (elapsedMs >= DURATION_MS) {
            return to;
        }
        return from + (to - from) * ease(elapsedMs / (double) DURATION_MS);
    }

    private static double bezier(double t, double firstControl, double secondControl) {
        double inverse = 1.0 - t;
        return 3.0 * inverse * inverse * t * firstControl
                + 3.0 * inverse * t * t * secondControl
                + t * t * t;
    }

    private static double clamp(double value) {
        return Math.max(0.0, Math.min(1.0, value));
    }
}
