package com.skydex.capture;

import com.skydex.data.SnapshotStore;
import com.skydex.data.StoreManager;
import com.skydex.location.LocationTracker;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Second sack capture path: the "[Sacks]" chat message.
 *
 * <p>Opening a sack screen gives a full snapshot of that category. This gives
 * running updates for everything else — pick up a crop and its sack total moves
 * without opening anything. The two compose: the screen is the full reading,
 * chat keeps individual items fresh in between.
 *
 * <p>Strictly passive. The message and its hover have already been sent to the
 * client and rendered; this only reads the component that is on screen.
 */
public final class SackChatListener {

    private final StoreManager stores;
    private final LocationTracker location;

    private String lastMessage;
    private long lastMessageAt;

    public SackChatListener(StoreManager stores, LocationTracker location) {
        this.stores = stores;
        this.location = location;
    }

    private final com.skydex.CaptureGuard guard = new com.skydex.CaptureGuard("sack chat");

    public void register() {
        ClientReceiveMessageEvents.GAME.register(
                (message, overlay) -> guard.run(() -> onGameMessage(message, overlay)));
    }

    private void onGameMessage(Component message, boolean overlay) {
        if (overlay || !location.isOnSkyBlock()) {
            return;
        }
        String flattened = ItemIds.strip(message);
        if (!SackChatParser.isSackMessage(flattened)) {
            return;
        }
        // Hypixel occasionally repeats the same line; applying it twice is
        // harmless (totals replace) but the work is not worth doing.
        long now = System.currentTimeMillis();
        if (flattened.equals(lastMessage) && now - lastMessageAt < 1_000L) {
            return;
        }
        lastMessage = flattened;
        lastMessageAt = now;

        SnapshotStore store = stores.active();
        if (store == null) {
            return;
        }
        List<String> hoverLines = new ArrayList<>();
        collectHoverLines(message, hoverLines);
        if (hoverLines.isEmpty()) {
            return;
        }
        SackChatParser.Update update = SackChatParser.parseDeltas(hoverLines);
        if (!update.isEmpty()) {
            // Deltas, not totals, and only for ids a sack screen already knows.
            store.addSacks(update.deltas());
        }
    }

    /**
     * Walk the message tree for a show_text hover and flatten it into lines.
     *
     * <p>The hover hangs off a style somewhere in the tree rather than the root,
     * so every sibling is checked.
     */
    private static void collectHoverLines(Component component, List<String> out) {
        HoverEvent hover = component.getStyle() == null ? null : component.getStyle().getHoverEvent();
        if (hover instanceof HoverEvent.ShowText showText) {
            // A mixed message carries TWO hovers, one on the "+N" sibling and
            // one on the "-N" sibling, so every sibling has to be checked
            // rather than just the first.
            String flattened = ItemIds.strip(showText.value());
            if (SackChatParser.isSackHover(flattened)) {
                flatten(showText.value(), out);
            }
        }
        for (Component sibling : component.getSiblings()) {
            collectHoverLines(sibling, out);
        }
    }

    /** Split a hover component into display lines, keeping each line intact. */
    private static void flatten(Component component, List<String> out) {
        String text = component.getString();
        if (text == null || text.isEmpty()) {
            return;
        }
        for (String line : text.split("\n")) {
            String trimmed = line.strip();
            if (!trimmed.isEmpty()) {
                out.add(trimmed);
            }
        }
    }
}
