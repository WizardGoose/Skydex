package com.skydex.gui;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SkydexScreenMenusTest {

    @Test
    @DisplayName("one Escape action closes the data menu and preset rail together")
    void dismissesBothOpenMenus() {
        MenuDismissal dismissal = MenuDismissal.forEscape(true, true);

        assertTrue(dismissal.handled());
        assertFalse(dismissal.dataOpen());
        assertFalse(dismissal.presetOpen());
    }

    @Test
    @DisplayName("Escape falls through when no Skydex flyout is open")
    void reportsNothingToDismiss() {
        MenuDismissal dismissal = MenuDismissal.forEscape(false, false);

        assertFalse(dismissal.handled());
        assertFalse(dismissal.dataOpen());
        assertFalse(dismissal.presetOpen());
    }
}
