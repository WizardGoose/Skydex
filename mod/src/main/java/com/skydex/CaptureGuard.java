package com.skydex;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Keeps one capture path's failure inside that path.
 *
 * <p>This mod is passive quality-of-life: nothing it does is worth taking the
 * client down for. Its hooks run on the client tick, the screen lifecycle, the
 * chat pipeline and the render thread, and an exception on any of those
 * propagates into vanilla and crashes the game.
 *
 * <p>{@link Throwable} rather than {@link Exception} on purpose. The failure
 * that prompted this was a {@link LinkageError} family member: a jar replaced
 * underneath a running client left the classloader reading a class at stale
 * offsets, surfacing as a ZipException during lazy class load. Those are Errors,
 * not Exceptions, and would have sailed straight through a narrower catch.
 *
 * <p>A path that fails once stays off for the session: whatever broke is
 * structural, and retrying it every tick would turn one error into a flood.
 */
public final class CaptureGuard {

    private static final Logger LOGGER = LoggerFactory.getLogger("Skydex");
    /** One chat line per session, however many paths fail. */
    private static final AtomicBoolean TOLD_THE_PLAYER = new AtomicBoolean();

    private final String name;
    private volatile boolean disabled;

    public CaptureGuard(String name) {
        this.name = name;
    }

    public boolean isDisabled() {
        return disabled;
    }

    /** Run an action, swallowing and disabling on any failure. */
    public void run(Runnable action) {
        if (disabled) {
            return;
        }
        try {
            action.run();
        } catch (Throwable failure) {
            disable(failure);
        }
    }

    /** Run a supplier, falling back on any failure. */
    public <T> T supply(java.util.function.Supplier<T> action, T fallback) {
        if (disabled) {
            return fallback;
        }
        try {
            return action.get();
        } catch (Throwable failure) {
            disable(failure);
            return fallback;
        }
    }

    private void disable(Throwable failure) {
        disabled = true;
        LOGGER.error("Skydex disabled its {} path after an internal error", name, failure);
        if (TOLD_THE_PLAYER.compareAndSet(false, true)) {
            announce();
        }
    }

    /**
     * Telling the player is best-effort: if the client is mid-teardown, the
     * failure to print must not become a second failure.
     */
    private static void announce() {
        try {
            Minecraft client = Minecraft.getInstance();
            if (client == null || client.player == null) {
                return;
            }
            client.execute(() -> {
                try {
                    client.player.sendSystemMessage(
                            Component.literal("[Skydex] ")
                                    .withStyle(Style.EMPTY.withColor(SkydexTheme.rgb(SkydexTheme.ACCENT)))
                                    .append(Component.literal(
                                                    "capture disabled after an internal error - restart the game")
                                            .withStyle(Style.EMPTY.withColor(
                                                    SkydexTheme.rgb(SkydexTheme.DANGER)))));
                } catch (Throwable ignored) {
                    // Nothing useful left to do.
                }
            });
        } catch (Throwable ignored) {
            // Nothing useful left to do.
        }
    }
}
