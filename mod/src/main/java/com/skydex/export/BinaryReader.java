package com.skydex.export;

import java.nio.charset.StandardCharsets;

/**
 * Bounds-checked cursor over a payload.
 *
 * <p>Every read validates before it consumes, and every failure throws with an
 * offset. The rule this class exists to enforce: a corrupt payload must be
 * <b>rejected</b>, never partially decoded into plausible-looking data.
 */
final class BinaryReader {

    /** LEB128 for a 64-bit value never needs more than ten bytes. */
    private static final int MAX_VARINT_BYTES = 10;

    private final byte[] data;
    private int offset;

    BinaryReader(byte[] data) {
        this.data = data;
    }

    int offset() {
        return offset;
    }

    int remaining() {
        return data.length - offset;
    }

    boolean exhausted() {
        return offset >= data.length;
    }

    byte readByte(String field) {
        if (offset >= data.length) {
            throw new BinaryFormatException("payload ends before " + field, offset);
        }
        return data[offset++];
    }

    /** Unsigned LEB128. Rejects over-long encodings rather than wrapping. */
    long readVarLong(String field) {
        long value = 0;
        int shift = 0;
        for (int i = 0; i < MAX_VARINT_BYTES; i++) {
            if (offset >= data.length) {
                throw new BinaryFormatException("payload ends inside varint for " + field, offset);
            }
            int b = data[offset++] & 0xFF;
            value |= (long) (b & 0x7F) << shift;
            if ((b & 0x80) == 0) {
                return value;
            }
            shift += 7;
        }
        throw new BinaryFormatException(
                "varint for " + field + " is longer than " + MAX_VARINT_BYTES + " bytes", offset);
    }

    /** A varint that must fit a non-negative int. */
    int readVarInt(String field) {
        long value = readVarLong(field);
        if (value < 0 || value > Integer.MAX_VALUE) {
            throw new BinaryFormatException(field + " is out of int range: " + value, offset);
        }
        return (int) value;
    }

    /** Zigzag-decoded signed value, for coordinates. */
    int readSignedVarInt(String field) {
        long raw = readVarLong(field);
        long value = (raw >>> 1) ^ -(raw & 1);
        if (value < Integer.MIN_VALUE || value > Integer.MAX_VALUE) {
            throw new BinaryFormatException(field + " is out of int range: " + value, offset);
        }
        return (int) value;
    }

    /**
     * A count, checked against what could possibly remain.
     *
     * <p>Each element costs at least one byte, so a declared count larger than
     * the remaining bytes is corrupt by construction. Checking before
     * allocating is the point: it stops a bogus length from asking for a
     * gigabyte-sized list.
     */
    int readCount(String field) {
        int start = offset;
        int count = readVarInt(field);
        if (count > remaining()) {
            throw new BinaryFormatException(
                    field + " declares " + count + " entries but only " + remaining()
                            + " bytes remain", start);
        }
        return count;
    }

    String readString(String field) {
        int start = offset;
        int length = readVarInt(field + " length");
        if (length > remaining()) {
            throw new BinaryFormatException(
                    field + " declares " + length + " bytes but only " + remaining()
                            + " remain", start);
        }
        String value = new String(data, offset, length, StandardCharsets.UTF_8);
        offset += length;
        return value;
    }

    /** Nothing should follow the document; trailing bytes mean we misread it. */
    void expectEnd() {
        if (!exhausted()) {
            throw new BinaryFormatException(
                    remaining() + " unexpected trailing byte(s)", offset);
        }
    }
}
