package com.skydex.export;

/**
 * A binary payload was malformed. Every rejection carries a reason naming the
 * field and offset, because the alternative — guessing at a partially readable
 * payload — risks a silently wrong decode, which is far worse than a refusal.
 */
public class BinaryFormatException extends IllegalArgumentException {

    public BinaryFormatException(String reason) {
        super(reason);
    }

    public BinaryFormatException(String reason, int offset) {
        super(reason + " (at byte " + offset + ")");
    }
}
