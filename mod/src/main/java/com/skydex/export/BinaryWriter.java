package com.skydex.export;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/** Mirror of {@link BinaryReader}; LEB128 varints, UTF-8 strings. */
final class BinaryWriter {

    private final ByteArrayOutputStream out = new ByteArrayOutputStream(1024);

    void writeByte(int value) {
        out.write(value & 0xFF);
    }

    /** Unsigned LEB128: seven bits per byte, high bit continues. */
    void writeVarLong(long value) {
        long remaining = value;
        while (true) {
            int chunk = (int) (remaining & 0x7F);
            remaining >>>= 7;
            if (remaining == 0) {
                out.write(chunk);
                return;
            }
            out.write(chunk | 0x80);
        }
    }

    void writeVarInt(int value) {
        writeVarLong(Integer.toUnsignedLong(value));
    }

    /** Zigzag so small negatives stay one byte. */
    void writeSignedVarInt(int value) {
        writeVarLong(Integer.toUnsignedLong((value << 1) ^ (value >> 31)));
    }

    void writeString(String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        writeVarInt(bytes.length);
        out.writeBytes(bytes);
    }

    byte[] toByteArray() {
        return out.toByteArray();
    }
}
