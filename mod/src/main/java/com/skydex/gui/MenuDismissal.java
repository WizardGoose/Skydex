package com.skydex.gui;

/** The complete state transition produced by Escape on the Skydex screen. */
record MenuDismissal(boolean dataOpen, boolean presetOpen, boolean handled) {

    static MenuDismissal forEscape(boolean dataOpen, boolean presetOpen) {
        return new MenuDismissal(false, false, dataOpen || presetOpen);
    }
}
