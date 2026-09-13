package com.skydex;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The guard exists because a passive mod crashed a client. Its job is to make
 * that structurally impossible: whatever a capture path throws, the caller —
 * vanilla's tick, screen, chat or render loop — sees nothing.
 */
class CaptureGuardTest {

    @Test
    @DisplayName("a healthy path runs normally")
    void runsNormally() {
        CaptureGuard guard = new CaptureGuard("test");
        AtomicInteger runs = new AtomicInteger();

        guard.run(runs::incrementAndGet);
        guard.run(runs::incrementAndGet);

        assertEquals(2, runs.get());
        assertFalse(guard.isDisabled());
    }

    @Test
    @DisplayName("an exception is swallowed and the path switches off")
    void swallowsAndDisables() {
        CaptureGuard guard = new CaptureGuard("test");
        AtomicInteger runs = new AtomicInteger();

        guard.run(() -> {
            runs.incrementAndGet();
            throw new IllegalStateException("boom");
        });
        assertTrue(guard.isDisabled());

        // Once off, it stays off: retrying every tick would flood the log.
        guard.run(runs::incrementAndGet);
        guard.run(runs::incrementAndGet);
        assertEquals(1, runs.get(), "a disabled path must not run again");
    }

    @Test
    @DisplayName("Errors are caught too, which is the case that actually crashed the client")
    void catchesErrorsNotJustExceptions() {
        // The real failure was a LinkageError family member from a jar swapped
        // under a running client. catch (Exception) would have missed it.
        for (Throwable failure : new Throwable[]{
                new NoClassDefFoundError("com/skydex/capture/SackLoreParser"),
                new LinkageError("bad class file"),
                new ExceptionInInitializerError("static init blew up"),
                new StackOverflowError(),
                new OutOfMemoryError("simulated")}) {

            CaptureGuard guard = new CaptureGuard("test");
            guard.run(() -> {
                throw sneaky(failure);
            });
            assertTrue(guard.isDisabled(),
                    failure.getClass().getSimpleName() + " should have disabled the path");
        }
    }

    @Test
    @DisplayName("supply falls back instead of propagating")
    void supplyFallsBack() {
        CaptureGuard guard = new CaptureGuard("test");

        assertEquals("ok", guard.supply(() -> "ok", "fallback"));
        assertEquals("fallback", guard.supply(() -> {
            throw new NoClassDefFoundError("gone");
        }, "fallback"));
        assertTrue(guard.isDisabled());
        assertEquals("fallback", guard.supply(() -> "ok", "fallback"),
                "a disabled guard must keep returning the fallback");
    }

    @Test
    @DisplayName("guards are independent, so one broken path does not silence the rest")
    void guardsAreIndependent() {
        CaptureGuard broken = new CaptureGuard("broken");
        CaptureGuard healthy = new CaptureGuard("healthy");
        AtomicInteger healthyRuns = new AtomicInteger();

        broken.run(() -> {
            throw new RuntimeException("boom");
        });
        healthy.run(healthyRuns::incrementAndGet);

        assertTrue(broken.isDisabled());
        assertFalse(healthy.isDisabled());
        assertEquals(1, healthyRuns.get());
    }

    @SuppressWarnings("unchecked")
    private static <T extends Throwable> RuntimeException sneaky(Throwable t) throws T {
        throw (T) t;
    }
}
